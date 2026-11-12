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

/** Ids are global, so a create must not reuse one from any space. */
function idTaken(
  ctx: HandlerContext,
  table: typeof lists | typeof items,
  id: string,
) {
  return (
    ctx.tx
      .select({ id: table.id })
      .from(table)
      .where(eq(table.id, id))
      .get() !== undefined
  );
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
 * leaves a partial change. Rules: per-field patches, deletes win (changes to a tombstone are
 * ignored), and setting a value it already has is still a change (simple and idempotent).
 */
export const mutationHandlers: {
  [N in Mutation['name']]: (
    ctx: HandlerContext,
    args: MutationArgs<N>,
  ) => HandlerOutcome;
} = {
  'list.create': (ctx, args) => {
    if (idTaken(ctx, lists, args.id)) return reject('This list already exists');
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
    if (idTaken(ctx, items, args.id)) return reject('This item already exists');
    const list = findList(ctx, args.listId);
    if (!list) return reject(LIST_MISSING);
    if (list.deletedAt !== null) return reject('The list was deleted');
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
    if (item.deletedAt !== null) return unchanged;
    return updateItem(ctx, item.id, definedFields(args.patch));
  },

  'item.move': (ctx, args) => {
    const item = findItem(ctx, args.id);
    if (!item) return reject(ITEM_MISSING);
    if (item.deletedAt !== null) return unchanged;
    return updateItem(ctx, item.id, { position: args.position });
  },

  'item.delete': (ctx, args) => {
    const item = findItem(ctx, args.id);
    if (!item) return reject(ITEM_MISSING);
    if (item.deletedAt !== null) return unchanged;
    return updateItem(ctx, item.id, { deletedAt: ctx.now });
  },

  'item.restore': (ctx, args) => {
    const item = findItem(ctx, args.id);
    if (!item) return reject(ITEM_MISSING);
    if (item.deletedAt === null) return unchanged;
    return updateItem(ctx, item.id, { deletedAt: null });
  },
};
