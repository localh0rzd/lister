import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import {
  deleteSpace,
  insertSpace,
  openDatabase,
  schema,
  testDatabaseOptions,
} from '@lister/api/data-access-db';
import { BackupService, restoreBackup } from '@lister/api/feature-maintenance';
import { SyncReader } from '@lister/api/feature-sync';
import { newId } from '@lister/shared/domain';

describe('restore-backup and sync', () => {
  it('makes devices pull a snapshot even after the space passed their version again', () => {
    const folder = mkdtempSync(join(tmpdir(), 'lister-restore-'));
    const path = join(folder, 'lister.db');
    const live = openDatabase(testDatabaseOptions(path));
    try {
      const userId = newId();
      live.db
        .insert(schema.users)
        .values({
          id: userId,
          username: 'anna',
          displayName: 'Anna',
          passwordHash: 'x',
          createdAt: 0,
        })
        .run();
      const space = insertSpace(live.db, {
        name: 'Home',
        ownerId: userId,
        personal: false,
        now: 0,
      });
      const setVersion = (db: typeof live, version: number) =>
        db.db
          .update(schema.spaces)
          .set({ version })
          .where(eq(schema.spaces.id, space.id))
          .run();
      setVersion(live, 100);
      const backup = new BackupService(live).backup(Date.UTC(2026, 0, 1));
      const before = space.timeline;
      setVersion(live, 150);

      restoreBackup(live, backup);

      const restored = openDatabase(testDatabaseOptions(path));
      try {
        const reader = new SyncReader(restored);
        // The restored server issues versions again, up to 160 (it had issued 150 before).
        setVersion(restored, 160);
        // A tablet that synced before the restore names the old timeline: whatever version it
        // holds (140, 150, or one the restored space has not reached), it replaces its copy ...
        expect(reader.rowsSince(space.id, 140, before)?.snapshot).toBe(true);
        expect(reader.rowsSince(space.id, 155, before)?.snapshot).toBe(true);
        expect(reader.rowsSince(space.id, 159, before)?.snapshot).toBe(true);
        // ... and one that has synced since the restore pulls incrementally.
        const after = reader.rowsSince(space.id, 155, 'x')!.timeline;
        expect(after).not.toBe(before);
        expect(reader.rowsSince(space.id, 155, after)?.snapshot).toBe(false);
      } finally {
        restored.onApplicationShutdown();
      }
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it('makes devices pull a snapshot of a space deleted after the backup, whatever versions it had reached', () => {
    const folder = mkdtempSync(join(tmpdir(), 'lister-restore-'));
    const path = join(folder, 'lister.db');
    const live = openDatabase(testDatabaseOptions(path));
    try {
      const userId = newId();
      live.db
        .insert(schema.users)
        .values({
          id: userId,
          username: 'anna',
          displayName: 'Anna',
          passwordHash: 'x',
          createdAt: 0,
        })
        .run();
      const newSpace = (name: string) =>
        insertSpace(live.db, {
          name,
          ownerId: userId,
          personal: false,
          now: 0,
        });
      const kept = newSpace('Home');
      const gone = newSpace('Trips');
      const setVersion = (db: typeof live, id: string, version: number) =>
        db.db
          .update(schema.spaces)
          .set({ version })
          .where(eq(schema.spaces.id, id))
          .run();
      setVersion(live, kept.id, 100);
      setVersion(live, gone.id, 100);
      const backup = new BackupService(live).backup(Date.UTC(2026, 0, 1));
      // After the backup, Trips out-versions every other space and is deleted for good, while a
      // tablet that holds it at 500 is offline.
      setVersion(live, kept.id, 150);
      setVersion(live, gone.id, 500);
      live.sqlite.transaction(() => deleteSpace(live.db, gone.id))();

      restoreBackup(live, backup);

      const restored = openDatabase(testDatabaseOptions(path));
      try {
        const reader = new SyncReader(restored);
        // Trips is back, from the backup, with versions below the tablet's (bounded only by what
        // the live database still had) ...
        const back = reader.rowsSince(gone.id, 500, gone.timeline);
        expect(back?.version).toBeLessThan(500);
        expect(back?.snapshot).toBe(true);
        // ... and stays a snapshot for the tablet once it has passed 500 again.
        setVersion(restored, gone.id, 600);
        expect(reader.rowsSince(gone.id, 500, gone.timeline)?.snapshot).toBe(
          true,
        );
        expect(reader.rowsSince(gone.id, 500, back!.timeline)?.snapshot).toBe(
          false,
        );
      } finally {
        restored.onApplicationShutdown();
      }
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
