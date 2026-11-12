import { join } from 'node:path';
import {
  type DatabaseConnection,
  type DatabaseOptions,
  openDatabase,
} from './database';

/** The migrations in this library's source tree, for tests. */
const SOURCE_MIGRATIONS_FOLDER = join(__dirname, '../../migrations');

/**
 * A fresh, migrated in-memory database. **For tests only**: it reads the migrations from the
 * source tree, which a production build doesn't have.
 */
export function createTestDatabase(): DatabaseConnection {
  return openDatabase(testDatabaseOptions(':memory:'));
}

/** Options for a test database at `path` with the source tree's migrations. For tests only. */
export function testDatabaseOptions(path: string): DatabaseOptions {
  return { path, migrationsFolder: SOURCE_MIGRATIONS_FOLDER };
}
