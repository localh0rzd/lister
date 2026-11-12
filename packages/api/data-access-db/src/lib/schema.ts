import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Instance-wide key/value settings (e.g. markers for one-off startup work). Synced tables
 * (spaces, lists, items, …) are added by the tasks that need them, starting with T-006.
 */
export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
