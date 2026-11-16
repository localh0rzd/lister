import { copyFileSync, existsSync, renameSync, rmSync } from 'node:fs';
import type { INestApplicationContext } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import {
  DatabaseConnection,
  openDatabase,
  schema,
} from '@lister/api/data-access-db';

export const RESTORE_BACKUP_COMMAND = 'restore-backup';

/**
 * Replaces the live database with the backup at `file` (the server must be stopped). Every
 * space's `version` and `purged_version` are set one above the highest version the space had in
 * the backup **or** in the live database, so versions are never reused and every device of every
 * space (whatever its last version) gets a full snapshot on its next pull. Spaces created after
 * the backup are gone. The backup is migrated and changed in a copy; the live file is only
 * replaced once that worked. The given connection is closed. Returns the number of spaces.
 */
export function restoreBackup(live: DatabaseConnection, file: string): number {
  const options = live.options;
  if (!options || live.sqlite.memory) {
    throw new Error('Only a database file can be restored');
  }
  if (!existsSync(file)) throw new Error(`No such file: ${file}`);
  const path = live.sqlite.name;
  const issued = new Map(
    live.db
      .select({ id: schema.spaces.id, version: schema.spaces.version })
      .from(schema.spaces)
      .all()
      .map((s) => [s.id, s.version]),
  );

  const staged = `${path}.restoring`;
  for (const suffix of ['', '-wal', '-shm'])
    rmSync(staged + suffix, { force: true });
  copyFileSync(file, staged);
  let spaces: number;
  try {
    const restored = openDatabase({ ...options, path: staged });
    try {
      const rows = restored.db
        .select({ id: schema.spaces.id, version: schema.spaces.version })
        .from(schema.spaces)
        .all();
      for (const row of rows) {
        const next = Math.max(row.version, issued.get(row.id) ?? 0) + 1;
        restored.db
          .update(schema.spaces)
          .set({ version: next, purgedVersion: next })
          .where(sql`${schema.spaces.id} = ${row.id}`)
          .run();
      }
      spaces = rows.length;
    } finally {
      restored.onApplicationShutdown();
    }
  } catch (error) {
    for (const suffix of ['', '-wal', '-shm'])
      rmSync(staged + suffix, { force: true });
    throw error;
  }

  live.onApplicationShutdown();
  // The old journal must not be applied to the restored file.
  rmSync(`${path}-wal`, { force: true });
  rmSync(`${path}-shm`, { force: true });
  renameSync(staged, path);
  return spaces;
}

/**
 * `restore-backup <file>`: `node main.js restore-backup /data/backups/lister-….db`, with the
 * server stopped. Returns the process exit code.
 */
export async function runRestoreBackupCommand(
  context: INestApplicationContext,
  args: string[],
  print: (line: string) => void,
): Promise<number> {
  const [file, ...rest] = args;
  if (!file || rest.length > 0) {
    print(`Usage: ${RESTORE_BACKUP_COMMAND} <backup file>`);
    return 2;
  }
  try {
    const spaces = restoreBackup(context.get(DatabaseConnection), file);
    print(`Restored ${file}: ${spaces} space(s). Start the server again.`);
    print(
      'Every device will fetch a full copy of its spaces on its next sync.',
    );
    return 0;
  } catch (error) {
    print(`Restore failed: ${error instanceof Error ? error.message : error}`);
    return 1;
  }
}
