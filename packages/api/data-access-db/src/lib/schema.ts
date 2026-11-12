import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Instance-wide key/value settings (e.g. markers for one-off startup work).
 */
export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** A space owns lists and runs. `version` is its change counter (design §4.2). */
export const spaces = sqliteTable('spaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  version: integer('version').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});

/**
 * Columns of every synced row (design §3). Field names match `SyncMetadata` in
 * @lister/shared/domain, so selected rows are domain objects. Rows are never hard-deleted outside
 * the purge job: `deletedAt` marks a tombstone. Times are epoch milliseconds.
 */
const syncColumns = {
  id: text('id').primaryKey(),
  spaceId: text('space_id')
    .notNull()
    .references(() => spaces.id),
  version: integer('version').notNull(),
  deletedAt: integer('deleted_at'),
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
};

export const lists = sqliteTable(
  'lists',
  {
    ...syncColumns,
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
  },
  (table) => [index('lists_space_version').on(table.spaceId, table.version)],
);

export const items = sqliteTable(
  'items',
  {
    ...syncColumns,
    listId: text('list_id')
      .notNull()
      .references(() => lists.id),
    title: text('title').notNull(),
    quantity: text('quantity').notNull().default(''),
    note: text('note').notNull().default(''),
    position: text('position').notNull(),
  },
  (table) => [
    index('items_space_version').on(table.spaceId, table.version),
    index('items_list').on(table.listId),
  ],
);

/** "List `parent` contains list `child`" (D2), ordered among the parent's items. */
export const includes = sqliteTable(
  'includes',
  {
    ...syncColumns,
    parentListId: text('parent_list_id')
      .notNull()
      .references(() => lists.id),
    childListId: text('child_list_id')
      .notNull()
      .references(() => lists.id),
    position: text('position').notNull(),
  },
  (table) => [
    index('includes_space_version').on(table.spaceId, table.version),
    // The rules read a list's includes (loop and duplicate checks).
    index('includes_parent').on(table.parentListId),
    index('includes_child').on(table.childListId),
  ],
);

/** A run: one use of a list, or an ad-hoc checklist (D1, D10). */
export const runs = sqliteTable(
  'runs',
  {
    ...syncColumns,
    title: text('title').notNull(),
    // No foreign key: the source list may be purged while the run lives on.
    sourceListId: text('source_list_id'),
    finishedAt: integer('finished_at'),
  },
  (table) => [index('runs_space_version').on(table.spaceId, table.version)],
);

/** A run's items: copies, merged when identical (D16), with their check state. */
export const runItems = sqliteTable(
  'run_items',
  {
    ...syncColumns,
    runId: text('run_id')
      .notNull()
      .references(() => runs.id),
    title: text('title').notNull(),
    quantity: text('quantity').notNull().default(''),
    note: text('note').notNull().default(''),
    position: text('position').notNull(),
    /** JSON array of list ids; the first decides the item's section. */
    sources: text('sources', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
    state: text('state', { enum: ['unchecked', 'checked', 'skipped'] })
      .notNull()
      .default('unchecked'),
    stateBy: text('state_by'),
    stateAt: integer('state_at'),
    /** An alias: this id merged into that item when it entered the run (D16). */
    mergedInto: text('merged_into'),
  },
  (table) => [
    index('run_items_space_version').on(table.spaceId, table.version),
    // Merging and the finished check read a run's items.
    index('run_items_run').on(table.runId),
  ],
);

/**
 * The answer to every mutation the server has handled, so a retried mutation id gets the same
 * answer without being applied twice.
 */
export const processedMutations = sqliteTable('processed_mutations', {
  mutationId: text('mutation_id').primaryKey(),
  spaceId: text('space_id').notNull(),
  clientId: text('client_id'),
  /** JSON: `{ "version": n }` or `{ "reason": "…" }`. */
  result: text('result').notNull(),
  createdAt: integer('created_at').notNull(),
});
