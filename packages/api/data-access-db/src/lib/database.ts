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
  if (options.path !== ':memory:') {
    mkdirSync(dirname(options.path), { recursive: true });
  }
  const sqlite = new BetterSqlite3(options.path);
  // WAL lets readers and the single writer work at the same time; NORMAL is safe with WAL.
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: options.migrationsFolder });
  return new DatabaseConnection(sqlite, db);
}
