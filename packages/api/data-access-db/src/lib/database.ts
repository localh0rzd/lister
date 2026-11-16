import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { OnApplicationShutdown } from '@nestjs/common';
import BetterSqlite3 from 'better-sqlite3';
import {
  type BetterSQLite3Database,
  drizzle,
} from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

export type Database = BetterSQLite3Database<typeof schema>;

export interface DatabaseOptions {
  /** File path, or `:memory:` for tests. */
  path: string;
  /** Folder with the drizzle-kit migrations (`packages/api/data-access-db/migrations`). */
  migrationsFolder: string;
}

/**
 * The open SQLite database. Inject it to query with Drizzle (`connection.db`); it closes when
 * the app shuts down.
 */
export class DatabaseConnection implements OnApplicationShutdown {
  constructor(
    readonly sqlite: BetterSqlite3.Database,
    readonly db: Database,
    /** What it was opened with: a restore reopens another file the same way. */
    readonly options?: DatabaseOptions,
  ) {}

  /** True when the database answers a trivial query. */
  isHealthy(): boolean {
    try {
      return this.sqlite.prepare('select 1 as ok').get() !== undefined;
    } catch {
      return false;
    }
  }

  onApplicationShutdown(): void {
    if (this.sqlite.open) this.sqlite.close();
  }
}

/** Opens the database with Lister's pragmas and applies pending migrations. */
export function openDatabase(options: DatabaseOptions): DatabaseConnection {
  if (!options.path.trim()) {
    // better-sqlite3 would open an anonymous temporary database and lose everything on restart.
    throw new Error('The database path is empty (check DATABASE_PATH)');
  }
  if (options.path !== ':memory:') {
    mkdirSync(dirname(options.path), { recursive: true });
  }
  const sqlite = new BetterSqlite3(options.path);
  // WAL lets readers and the single writer work at the same time; NORMAL is safe with WAL.
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');

  const db = drizzle(sqlite, { schema });
  // Migrate with foreign keys off: drizzle-kit rebuilds tables (create, copy, drop, rename), and
  // Drizzle runs all pending migrations in one transaction, where SQLite ignores the
  // `PRAGMA foreign_keys=OFF` in the migration itself. With them on, dropping a parent table
  // would cascade-delete its children. Check the result, then enforce foreign keys.
  sqlite.pragma('foreign_keys = OFF');
  try {
    migrate(db, { migrationsFolder: options.migrationsFolder });
    const violations = sqlite.pragma('foreign_key_check') as {
      table: string;
      parent: string;
    }[];
    if (violations.length > 0) {
      const where = violations.map((v) => `${v.table} → ${v.parent}`);
      throw new Error(
        `Migrations left broken foreign keys: ${[...new Set(where)].join(', ')}`,
      );
    }
  } catch (error) {
    sqlite.close();
    throw error;
  }
  sqlite.pragma('foreign_keys = ON');
  return new DatabaseConnection(sqlite, db, options);
}
