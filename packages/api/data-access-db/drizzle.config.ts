import { defineConfig } from 'drizzle-kit';

// Used by `npx nx run api-data-access-db:db-generate` (run from the workspace root).
export default defineConfig({
  dialect: 'sqlite',
  schema: './packages/api/data-access-db/src/lib/schema.ts',
  out: './packages/api/data-access-db/migrations',
});
