import { join } from 'node:path';
import { type DatabaseConnection, openDatabase } from './database';

/** The migrations in this library's source tree, for tests. */
export const SOURCE_MIGRATIONS_FOLDER = join(__dirname, '../../migrations');

/** A fresh, migrated in-memory database. For tests only. */
export function createTestDatabase(): DatabaseConnection {
  return openDatabase({
    path: ':memory:',
    migrationsFolder: SOURCE_MIGRATIONS_FOLDER,
  });
}
