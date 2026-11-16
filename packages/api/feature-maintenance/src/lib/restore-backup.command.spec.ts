import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { INestApplicationContext } from '@nestjs/common';
import BetterSqlite3 from 'better-sqlite3';
import {
  DatabaseConnection,
  insertSpace,
  openDatabase,
  schema,
  testDatabaseOptions,
} from '@lister/api/data-access-db';
import { newId } from '@lister/shared/domain';
import { BackupService } from './backup.service';
import {
  restoreBackup,
  runRestoreBackupCommand,
} from './restore-backup.command';

describe('restore-backup', () => {
  let folder: string;
  let path: string;
  let live: DatabaseConnection;
  const USER = newId();

  const addSpace = (connection: DatabaseConnection, name: string) =>
    insertSpace(connection.db, {
      name,
      ownerId: USER,
      personal: false,
      now: 0,
    });
  const setVersion = (id: string, version: number) =>
    live.db
      .update(schema.spaces)
      .set({ version })
      .where(eq(schema.spaces.id, id))
      .run();
  const versionOf = (connection: DatabaseConnection, id: string) =>
    connection.db
      .select()
      .from(schema.spaces)
      .where(eq(schema.spaces.id, id))
      .get();

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'lister-restore-'));
    path = join(folder, 'lister.db');
    live = openDatabase(testDatabaseOptions(path));
    live.db
      .insert(schema.users)
      .values({
        id: USER,
        username: 'anna',
        displayName: 'Anna',
        passwordHash: 'x',
        createdAt: 0,
      })
      .run();
  });
  afterEach(() => {
    live.onApplicationShutdown();
    rmSync(folder, { recursive: true, force: true });
  });

  it('puts the backup in place, drops later spaces and moves versions past both timelines', () => {
    const kept = addSpace(live, 'Kept');
    setVersion(kept.id, 100);
    const backup = new BackupService(live).backup(Date.UTC(2026, 0, 1));
    // The server went on to 150 and created another space.
    setVersion(kept.id, 150);
    const later = addSpace(live, 'Later');

    expect(restoreBackup(live, backup)).toBe(1);

    const restored = openDatabase(testDatabaseOptions(path));
    try {
      expect(versionOf(restored, later.id)).toBeUndefined();
      const space = versionOf(restored, kept.id);
      expect(space?.version).toBe(151);
      expect(space?.purgedVersion).toBe(151);
      expect(space?.timeline).not.toBe(kept.timeline);
      expect(space?.timeline).toBeTruthy();
    } finally {
      restored.onApplicationShutdown();
    }
  });

  it('moves every space past the highest version of any space, deleted ones included', () => {
    const quiet = addSpace(live, 'Quiet');
    const deleted = addSpace(live, 'Deleted later');
    setVersion(quiet.id, 5);
    setVersion(deleted.id, 100);
    const backup = new BackupService(live).backup(Date.UTC(2026, 0, 1));
    // The lost timeline: "Deleted later" reached 150, then was deleted; "Quiet" reached 120.
    setVersion(quiet.id, 120);
    live.db.delete(schema.spaces).where(eq(schema.spaces.id, deleted.id)).run();

    restoreBackup(live, backup);

    const restored = openDatabase(testDatabaseOptions(path));
    try {
      // A device still at 140 in "Deleted later" is ahead of 121, so it pulls a snapshot.
      expect(versionOf(restored, deleted.id)?.version).toBe(121);
      expect(versionOf(restored, deleted.id)?.purgedVersion).toBe(121);
      expect(versionOf(restored, quiet.id)?.version).toBe(121);
    } finally {
      restored.onApplicationShutdown();
    }
  });

  it('ends every session, those ended after the backup too', () => {
    live.db
      .insert(schema.sessions)
      .values({ id: 'revoked', userId: USER, expiresAt: 1e15, createdAt: 0 })
      .run();
    const backup = new BackupService(live).backup(Date.UTC(2026, 0, 1));
    live.db.delete(schema.sessions).run();

    restoreBackup(live, backup);

    const restored = openDatabase(testDatabaseOptions(path));
    try {
      expect(restored.db.select().from(schema.sessions).all()).toEqual([]);
    } finally {
      restored.onApplicationShutdown();
    }
  });

  it('refuses while another connection (the server) has the database open', () => {
    const space = addSpace(live, 'Kept');
    const backup = new BackupService(live).backup(Date.UTC(2026, 0, 1));
    setVersion(space.id, 150);
    const server = new BetterSqlite3(path);
    try {
      server.prepare('select 1').get();

      expect(() => restoreBackup(live, backup)).toThrow(
        /in use: stop the server first/,
      );

      expect(existsSync(`${path}.restoring`)).toBe(false);
      expect(server.prepare('select version from spaces').pluck().get()).toBe(
        150,
      );
    } finally {
      server.close();
    }
  });

  it('leaves the live database alone when the file is not a database', () => {
    const space = addSpace(live, 'Kept');
    const bogus = join(folder, 'bogus.db');
    writeFileSync(bogus, 'not sqlite');

    expect(() => restoreBackup(live, bogus)).toThrow();
    expect(existsSync(`${path}.restoring`)).toBe(false);
    expect(() => restoreBackup(live, join(folder, 'missing.db'))).toThrow(
      /No such file/,
    );
    expect(versionOf(live, space.id)?.version).toBe(0);
  });

  it('prints usage, and reports a failed restore with exit code 1', async () => {
    const lines: string[] = [];
    const print = (l: string) => lines.push(l);
    const context = {
      get: () => live,
    } as unknown as INestApplicationContext;

    expect(await runRestoreBackupCommand(context, [], print)).toBe(2);
    expect(lines[0]).toMatch(/^Usage:/);
    expect(
      await runRestoreBackupCommand(context, [join(folder, 'nope.db')], print),
    ).toBe(1);
    expect(lines.at(-1)).toMatch(/^Restore failed: No such file/);
  });

  it('succeeds with exit code 0 and says what happened', async () => {
    const backup = new BackupService(live).backup(Date.UTC(2026, 0, 1));
    const lines: string[] = [];
    const context = { get: () => live } as unknown as INestApplicationContext;

    expect(
      await runRestoreBackupCommand(context, [backup], (l) => lines.push(l)),
    ).toBe(0);
    expect(lines[0]).toContain('Restored');
  });
});
