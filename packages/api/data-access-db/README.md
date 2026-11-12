# @lister/api/data-access-db

SQLite for the API: Drizzle 0.45 on `better-sqlite3`.

- **Use it:** `AppModule` imports `DatabaseModule.forRoot(...)`; inject `DatabaseConnection` and
  query `connection.db` (Drizzle). Writes that must be atomic go in one synchronous
  `connection.db.transaction(...)`, with no `await` inside.
- **Where the data lives:** `DATABASE_PATH` (default `data/lister.db`, relative to the working
  directory). The connection uses WAL, `busy_timeout=5000` and `synchronous=NORMAL`, and enforces
  foreign keys.
- **Schema changes:** edit `src/lib/schema.ts`, then run
  `npx nx run api-data-access-db:db-generate --name=<change>` and commit the new files in
  `migrations/`. They apply on startup, with foreign keys off during migration (so table rebuilds
  can't cascade-delete rows), checked afterwards. Bump the Dexie version on the client in the
  same change.
- **Tests:** `createTestDatabase()` gives a fresh, migrated in-memory database;
  `testDatabaseOptions(path)` does the same for a file. Both read the migrations from the source
  tree, so never use them in app code.
