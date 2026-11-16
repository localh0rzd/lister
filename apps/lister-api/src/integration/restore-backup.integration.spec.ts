import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import {
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
});
