import { and, eq } from 'drizzle-orm';
import type { Database } from '@lister/api/data-access-db';
import { schema } from '@lister/api/data-access-db';
import type { Mutation, MutationArgs } from '@lister/shared/sync-protocol';

const { items, lists } = schema;

/** A transaction handle (same API as the database). */
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface HandlerContext {
  readonly tx: Tx;
  readonly spaceId: string;
  readonly userId: string;
  readonly now: number;
  /** The version every row changed by this mutation gets. */
  readonly version: number;
}

/** What a handler did: the rows it changed, nothing (ignored), or a rejection. */
export type HandlerOutcome =
  | { kind: 'changed'; lists?: string[]; items?: string[] }
  | { kind: 'unchanged' }
  | { kind: 'rejected'; reason: string };

const unchanged: HandlerOutcome = { kind: 'unchanged' };
const reject = (reason: string): HandlerOutcome => ({
  kind: 'rejected',
  reason,
});

/** Only the fields a patch sets (absent and undefined keys are left alone). */
function definedFields<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function stamp(ctx: HandlerContext) {
  return { version: ctx.version, updatedBy: ctx.userId, updatedAt: ctx.now };
}

function created(ctx: HandlerContext) {
  return {
    spaceId: ctx.spaceId,
    deletedAt: null,
    createdBy: ctx.userId,
    createdAt: ctx.now,
    ...stamp(ctx),
  };
}

function findList(ctx: HandlerContext, id: string) {
  return ctx.tx
    .select()
    .from(lists)
    .where(and(eq(lists.id, id), eq(lists.spaceId, ctx.spaceId)))
    .get();
}

function findItem(ctx: HandlerContext, id: string) {
  return ctx.tx
    .select()
    .from(items)
    .where(and(eq(items.id, id), eq(items.spaceId, ctx.spaceId)))
    .get();
}

/**
 * Where an id already lives: in this space (a create was already applied, e.g. a retry whose
 * processed_mutations record is gone, so it's idempotent), in another space (ids are global, so
 * reject), or nowhere.
 */
function existingId(
  ctx: HandlerContext,
  table: typeof lists | typeof items,
  id: string,
): 'here' | 'elsewhere' | null {
  const row = ctx.tx
    .select({ spaceId: table.spaceId })
    .from(table)
    .where(eq(table.id, id))
    .get();
  if (!row) return null;
  return row.spaceId === ctx.spaceId ? 'here' : 'elsewhere';
}

/** D5: delete wins, also for the items of a deleted list (design §2.4). */
function listIsDeleted(ctx: HandlerContext, listId: string): boolean {
  return findList(ctx, listId)?.deletedAt != null;
}

function updateList(
  ctx: HandlerContext,
  id: string,
  change: Partial<typeof lists.$inferInsert>,
): HandlerOutcome {
  ctx.tx
    .update(lists)
    .set({ ...change, ...stamp(ctx) })
    .where(eq(lists.id, id))
    .run();
  return { kind: 'changed', lists: [id] };
}

function updateItem(
  ctx: HandlerContext,
  id: string,
  change: Partial<typeof items.$inferInsert>,
): HandlerOutcome {
  ctx.tx
    .update(items)
    .set({ ...change, ...stamp(ctx) })
    .where(eq(items.id, id))
    .run();
  return { kind: 'changed', items: [id] };
}

const LIST_MISSING = "This list doesn't exist";
const ITEM_MISSING = "This item doesn't exist";

/**
 * One handler per mutation. Handlers check everything before they write, so a rejection never
 * leaves a partial change. Rules: per-field patches; deletes win, so changes to a tombstone or
 * to the items of a deleted list are ignored (design §2.4); a create whose id already exists in
 * the space is ignored (idempotent); setting a value it already has is still a change.
 */
export const mutationHandlers: {
  [N in Mutation['name']]: (
    ctx: HandlerContext,
    args: MutationArgs<N>,
  ) => HandlerOutcome;
} = {
  'list.create': (ctx, args) => {
    const existing = existingId(ctx, lists, args.id);
    if (existing === 'here') return unchanged;
    if (existing === 'elsewhere') return reject('This list already exists');
    ctx.tx
      .insert(lists)
      .values({
        ...created(ctx),
        id: args.id,
        title: args.title,
        description: args.description,
      })
      .run();
    return { kind: 'changed', lists: [args.id] };
  },

  'list.update': (ctx, args) => {
    const list = findList(ctx, args.id);
    if (!list) return reject(LIST_MISSING);
    if (list.deletedAt !== null) return unchanged;
    return updateList(ctx, list.id, definedFields(args.patch));
  },

  'list.delete': (ctx, args) => {
    const list = findList(ctx, args.id);
    if (!list) return reject(LIST_MISSING);
    if (list.deletedAt !== null) return unchanged;
    return updateList(ctx, list.id, { deletedAt: ctx.now });
  },

  'list.restore': (ctx, args) => {
    const list = findList(ctx, args.id);
    if (!list) return reject(LIST_MISSING);
    if (list.deletedAt === null) return unchanged;
    return updateList(ctx, list.id, { deletedAt: null });
  },

  'item.create': (ctx, args) => {
    const existing = existingId(ctx, items, args.id);
    if (existing === 'here') return unchanged;
    if (existing === 'elsewhere') return reject('This item already exists');
    const list = findList(ctx, args.listId);
    if (!list) return reject(LIST_MISSING);
    if (list.deletedAt !== null) return unchanged;
    ctx.tx
      .insert(items)
      .values({
        ...created(ctx),
        id: args.id,
        listId: args.listId,
        title: args.title,
        quantity: args.quantity,
        note: args.note,
        position: args.position,
      })
      .run();
    return { kind: 'changed', items: [args.id] };
  },

  'item.update': (ctx, args) => {
    const item = findItem(ctx, args.id);
    if (!item) return reject(ITEM_MISSING);
    if (item.deletedAt !== null || listIsDeleted(ctx, item.listId)) {
      return unchanged;
    }
    return updateItem(ctx, item.id, definedFields(args.patch));
  },

  'item.move': (ctx, args) => {
    const item = findItem(ctx, args.id);
    if (!item) return reject(ITEM_MISSING);
    if (item.deletedAt !== null || listIsDeleted(ctx, item.listId)) {
      return unchanged;
    }
    return updateItem(ctx, item.id, { position: args.position });
  },

  'item.delete': (ctx, args) => {
    const item = findItem(ctx, args.id);
    if (!item) return reject(ITEM_MISSING);
    if (item.deletedAt !== null || listIsDeleted(ctx, item.listId)) {
      return unchanged;
    }
    return updateItem(ctx, item.id, { deletedAt: ctx.now });
  },

  'item.restore': (ctx, args) => {
    const item = findItem(ctx, args.id);
    if (!item) return reject(ITEM_MISSING);
    if (item.deletedAt === null || listIsDeleted(ctx, item.listId)) {
      return unchanged;
    }
    return updateItem(ctx, item.id, { deletedAt: null });
  },
};
