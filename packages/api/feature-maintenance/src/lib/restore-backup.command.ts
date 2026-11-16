import { copyFileSync, existsSync, renameSync, rmSync } from 'node:fs';
import type { INestApplicationContext } from '@nestjs/common';
import BetterSqlite3 from 'better-sqlite3';
import { newId } from '@lister/shared/domain';
import {
  DatabaseConnection,
  openDatabase,
  schema,
} from '@lister/api/data-access-db';

export const RESTORE_BACKUP_COMMAND = 'restore-backup';

/** Deletes a database file and its journal files. */
function removeDatabaseFiles(path: string): void {
  for (const suffix of ['', '-wal', '-shm'])
    rmSync(path + suffix, { force: true });
}

/** The highest version any space has in this database (0 without spaces). */
function highestVersion(connection: DatabaseConnection): number {
  return connection.sqlite
    .prepare('select coalesce(max(version), 0) from spaces')
    .pluck()
    .get() as number;
}

/**
 * Fails while another connection (a running server) has the database open: an exclusive lock on
 * a WAL database is refused while any other connection holds it open, even an idle one.
 */
function assertNotInUse(path: string): void {
  const probe = new BetterSqlite3(path, { fileMustExist: true });
  try {
    probe.pragma('busy_timeout = 0');
    probe.pragma('locking_mode = EXCLUSIVE');
    probe.exec('BEGIN EXCLUSIVE');
    probe.exec('COMMIT');
  } catch (error) {
    if ((error as { code?: string }).code === 'SQLITE_BUSY') {
      throw new Error('The database is in use: stop the server first');
    }
    throw error;
  } finally {
    probe.close();
  }
}

/**
 * Replaces the live database with the backup at `file` (refused while the server runs). Every
 * space's `version` and `purged_version` are set one above the highest version of any space in
 * the backup **or** in the live database: versions are never reused and every device of every
 * space (whatever its last version) gets a full snapshot on its next pull. The bound is global
 * because a space deleted after the backup is not in the live database any more. Spaces created
 * after the backup are gone, and so is every session (the backup still holds those ended since).
 * The backup is migrated and changed in a copy; the live file is only replaced once that worked.
 * The given connection is closed. Returns the number of spaces.
 */
export function restoreBackup(live: DatabaseConnection, file: string): number {
  const options = live.options;
  if (!options || live.sqlite.memory) {
    throw new Error('Only a database file can be restored');
  }
  if (!existsSync(file)) throw new Error(`No such file: ${file}`);
  const path = live.sqlite.name;
  const issued = highestVersion(live);

  const staged = `${path}.restoring`;
  removeDatabaseFiles(staged);
  copyFileSync(file, staged);
  let spaces = 0;
  try {
    const restored = openDatabase({ ...options, path: staged });
    try {
      const next = Math.max(highestVersion(restored), issued) + 1;
      restored.sqlite.transaction(() => {
        spaces = restored.db
          .update(schema.spaces)
          .set({ version: next, purgedVersion: next, timeline: newId() })
          .run().changes;
        restored.db.delete(schema.sessions).run();
      })();
    } finally {
      restored.onApplicationShutdown();
    }
  } catch (error) {
    removeDatabaseFiles(staged);
    throw error;
  }

  live.onApplicationShutdown();
  try {
    assertNotInUse(path);
  } catch (error) {
    removeDatabaseFiles(staged);
    throw error;
  }
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
      'Everyone signs in again; every device will fetch a full copy of its spaces on its next sync.',
    );
    return 0;
  } catch (error) {
    print(`Restore failed: ${error instanceof Error ? error.message : error}`);
    return 1;
  }
}
