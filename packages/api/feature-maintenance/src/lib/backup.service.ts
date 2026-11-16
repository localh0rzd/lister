import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { DatabaseConnection } from '@lister/api/data-access-db';

/** How many backups are kept (D15). */
export const BACKUPS_KEPT = 14;

/** `lister-2026-11-16T03-00-00Z.db`: sorts by time, and only these names are ever pruned. */
const BACKUP_NAME = /^lister-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.db$/;

/**
 * Nightly backups (D15): a consistent copy of the live database made with `VACUUM INTO`, kept in
 * `BACKUP_DIR` (by default the `backups` folder next to the database file, `/data/backups` in
 * the Docker image). The newest 14 are kept.
 */
@Injectable()
export class BackupService {
  constructor(private readonly database: DatabaseConnection) {}

  /** The folder the backups go to, or `undefined` for an in-memory database. */
  get directory(): string | undefined {
    if (this.database.sqlite.memory) return undefined;
    return (
      process.env['BACKUP_DIR']?.trim() ||
      join(dirname(this.database.sqlite.name), 'backups')
    );
  }

  /** Backup file names, oldest first. */
  list(directory = this.directory): string[] {
    if (!directory) return [];
    try {
      return readdirSync(directory)
        .filter((n) => BACKUP_NAME.test(n))
        .sort();
    } catch {
      return [];
    }
  }

  /** Writes a backup of the database as of `now`, then prunes old ones. Returns its path. */
  backup(now: number): string {
    const directory = this.directory;
    if (!directory) throw new Error('An in-memory database has no backups');
    mkdirSync(directory, { recursive: true });
    const name = `lister-${new Date(now).toISOString().slice(0, 19).replace(/:/g, '-')}Z.db`;
    const target = join(directory, name);
    // Write beside the final name and rename, so a crash never leaves a half-written backup
    // that looks like a real one. VACUUM INTO refuses to overwrite an existing file.
    const partial = `${target}.partial`;
    rmSync(partial, { force: true });
    this.database.sqlite.prepare('VACUUM INTO ?').run(partial);
    renameSync(partial, target);
    this.prune(directory);
    return target;
  }

  /** Whether the newest backup is from before the UTC day of `now` (or there is none). */
  isDue(now: number): boolean {
    const directory = this.directory;
    if (!directory) return false;
    const newest = this.list(directory).at(-1);
    if (!newest) return true;
    const day = new Date(now).toISOString().slice(0, 10);
    return newest.slice('lister-'.length, 'lister-'.length + 10) < day;
  }

  private prune(directory: string): void {
    const names = this.list(directory);
    for (const name of names.slice(
      0,
      Math.max(0, names.length - BACKUPS_KEPT),
    )) {
      rmSync(join(directory, name), { force: true });
    }
    // Leftovers of a crashed backup.
    const stale = Date.now() - 3600_000;
    for (const name of readdirSync(directory)) {
      if (!name.endsWith('.partial')) continue;
      const path = join(directory, name);
      try {
        if (statSync(path).mtimeMs < stale) rmSync(path, { force: true });
      } catch {
        // Gone already.
      }
    }
  }
}
