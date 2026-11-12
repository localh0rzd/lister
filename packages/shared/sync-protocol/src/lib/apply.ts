import type { Item, List } from '@lister/shared/domain';
import type { Mutation, MutationArgs } from './mutations';

/**
 * Rows a mutation can read and write. The server implements it over its SQLite transaction, the
 * client over an in-memory copy of the space; both are synchronous.
 */
export interface RowStore {
  /** The list with this id in any space, if it exists (tombstones included). */
  getList(id: string): List | undefined;
  getItem(id: string): Item | undefined;
  /** Insert or replace. */
  putList(row: List): void;
  putItem(row: Item): void;
}

export interface ApplyContext {
  readonly spaceId: string;
  readonly userId: string;
  readonly now: number;
  /** The version every row changed by this mutation gets. */
  readonly version: number;
}

/** What a mutation did: rows changed, nothing (ignored), or a rejection with a reason. */
export type ApplyOutcome =
  | { kind: 'changed'; lists: string[]; items: string[] }
  | { kind: 'unchanged' }
  | { kind: 'rejected'; reason: string };

const unchanged: ApplyOutcome = { kind: 'unchanged' };
const reject = (reason: string): ApplyOutcome => ({ kind: 'rejected', reason });
const changedList = (id: string): ApplyOutcome => ({
  kind: 'changed',
  lists: [id],
  items: [],
});
const changedItem = (id: string): ApplyOutcome => ({
  kind: 'changed',
  lists: [],
  items: [id],
});

const LIST_MISSING = "This list doesn't exist";
const ITEM_MISSING = "This item doesn't exist";

/** Only the fields a patch sets (absent and undefined keys are left alone). */
function definedFields<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/**
 * The mutation rules, shared by the server (authoritative) and the client (optimistic
 * prediction), design §2.4 and §4.2:
 * - per-field patches; the change that reaches the server last wins;
 * - deletes win: changes to a tombstone, or to the items of a deleted list, are ignored;
 * - creates are idempotent by id within the space; an id from another space is rejected;
 * - everything is checked before anything is written, so a rejection changes nothing.
 */
export function applyMutation(
  store: RowStore,
  ctx: ApplyContext,
  mutation: Mutation,
): ApplyOutcome {
  const stamp = {
    version: ctx.version,
    updatedBy: ctx.userId,
    updatedAt: ctx.now,
  };
  const created = {
    spaceId: ctx.spaceId,
    deletedAt: null,
    createdBy: ctx.userId,
    createdAt: ctx.now,
    ...stamp,
  };
  const listHere = (id: string) => {
    const list = store.getList(id);
    return list?.spaceId === ctx.spaceId ? list : undefined;
  };
  const itemHere = (id: string) => {
    const item = store.getItem(id);
    return item?.spaceId === ctx.spaceId ? item : undefined;
  };
  const listIsDeleted = (listId: string) => listHere(listId)?.deletedAt != null;

  const updateList = (list: List, change: Partial<List>) => {
    store.putList({ ...list, ...change, ...stamp });
    return changedList(list.id);
  };
  const updateItem = (item: Item, change: Partial<Item>) => {
    store.putItem({ ...item, ...change, ...stamp });
    return changedItem(item.id);
  };

  /** An item that may be changed: it exists here, isn't deleted, nor is its list. */
  const liveItem = (id: string): Item | ApplyOutcome => {
    const item = itemHere(id);
    if (!item) return reject(ITEM_MISSING);
    if (item.deletedAt !== null || listIsDeleted(item.listId)) return unchanged;
    return item;
  };
  const isOutcome = (value: Item | ApplyOutcome): value is ApplyOutcome =>
    'kind' in value;

  switch (mutation.name) {
    case 'list.create': {
      const args: MutationArgs<'list.create'> = mutation.args;
      const existing = store.getList(args.id);
      if (existing) {
        return existing.spaceId === ctx.spaceId
          ? unchanged
          : reject('This list already exists');
      }
      store.putList({
        ...created,
        id: args.id,
        title: args.title,
        description: args.description,
      });
      return changedList(args.id);
    }
    case 'list.update': {
      const list = listHere(mutation.args.id);
      if (!list) return reject(LIST_MISSING);
      if (list.deletedAt !== null) return unchanged;
      return updateList(list, definedFields(mutation.args.patch));
    }
    case 'list.delete': {
      const list = listHere(mutation.args.id);
      if (!list) return reject(LIST_MISSING);
      if (list.deletedAt !== null) return unchanged;
      return updateList(list, { deletedAt: ctx.now });
    }
    case 'list.restore': {
      const list = listHere(mutation.args.id);
      if (!list) return reject(LIST_MISSING);
      if (list.deletedAt === null) return unchanged;
      return updateList(list, { deletedAt: null });
    }
    case 'item.create': {
      const args = mutation.args;
      const existing = store.getItem(args.id);
      if (existing) {
        return existing.spaceId === ctx.spaceId
          ? unchanged
          : reject('This item already exists');
      }
      const list = listHere(args.listId);
      if (!list) return reject(LIST_MISSING);
      if (list.deletedAt !== null) return unchanged;
      store.putItem({
        ...created,
        id: args.id,
        listId: args.listId,
        title: args.title,
        quantity: args.quantity,
        note: args.note,
        position: args.position,
      });
      return changedItem(args.id);
    }
    case 'item.update': {
      const item = liveItem(mutation.args.id);
      return isOutcome(item)
        ? item
        : updateItem(item, definedFields(mutation.args.patch));
    }
    case 'item.move': {
      const item = liveItem(mutation.args.id);
      return isOutcome(item)
        ? item
        : updateItem(item, { position: mutation.args.position });
    }
    case 'item.delete': {
      const item = liveItem(mutation.args.id);
      return isOutcome(item) ? item : updateItem(item, { deletedAt: ctx.now });
    }
    case 'item.restore': {
      const item = itemHere(mutation.args.id);
      if (!item) return reject(ITEM_MISSING);
      if (item.deletedAt === null || listIsDeleted(item.listId))
        return unchanged;
      return updateItem(item, { deletedAt: null });
    }
  }
}

/** A `RowStore` over plain maps, e.g. a client's copy of one space. */
export class MemoryRowStore implements RowStore {
  readonly lists = new Map<string, List>();
  readonly items = new Map<string, Item>();

  constructor(lists: Iterable<List> = [], items: Iterable<Item> = []) {
    for (const list of lists) this.lists.set(list.id, list);
    for (const item of items) this.items.set(item.id, item);
  }

  getList(id: string) {
    return this.lists.get(id);
  }
  getItem(id: string) {
    return this.items.get(id);
  }
  putList(row: List) {
    this.lists.set(row.id, row);
  }
  putItem(row: Item) {
    this.items.set(row.id, row);
  }
}
