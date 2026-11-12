import {
  type Include,
  type Item,
  type List,
  wouldCreateCycle,
} from '@lister/shared/domain';
import type { Mutation, MutationArgs } from './mutations';

/**
 * Rows a mutation can read and write. The server implements it over its SQLite transaction, the
 * client over an in-memory copy of the space; both are synchronous.
 */
export interface RowStore {
  /** The list with this id in any space, if it exists (tombstones included). */
  getList(id: string): List | undefined;
  getItem(id: string): Item | undefined;
  getInclude(id: string): Include | undefined;
  /** The includes whose parent is this list, in any space (tombstones included). */
  includesOf(parentListId: string): readonly Include[];
  /** Insert or replace. */
  putList(row: List): void;
  putItem(row: Item): void;
  putInclude(row: Include): void;
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
  | { kind: 'changed'; lists: string[]; items: string[]; includes: string[] }
  | { kind: 'unchanged' }
  | { kind: 'rejected'; reason: string };

const unchanged: ApplyOutcome = { kind: 'unchanged' };
const reject = (reason: string): ApplyOutcome => ({ kind: 'rejected', reason });
const changedList = (id: string): ApplyOutcome => ({
  kind: 'changed',
  lists: [id],
  items: [],
  includes: [],
});
const changedItem = (id: string): ApplyOutcome => ({
  kind: 'changed',
  lists: [],
  items: [id],
  includes: [],
});
const changedInclude = (id: string): ApplyOutcome => ({
  kind: 'changed',
  lists: [],
  items: [],
  includes: [id],
});

const LIST_MISSING = "This list doesn't exist";
const ITEM_MISSING = "This item doesn't exist";
const INCLUDE_MISSING = "This list isn't included there";

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
 * - includes never form a loop, and a list includes another at most once (live includes): the
 *   one that would arrive second is rejected, also when two clients made the halves offline;
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
  const isOutcome = (value: object): value is ApplyOutcome => 'kind' in value;

  const includeHere = (id: string) => {
    const include = store.getInclude(id);
    return include?.spaceId === ctx.spaceId ? include : undefined;
  };
  const updateInclude = (include: Include, change: Partial<Include>) => {
    store.putInclude({ ...include, ...change, ...stamp });
    return changedInclude(include.id);
  };
  const liveIncludesOf = (listId: string) =>
    store
      .includesOf(listId)
      .filter((row) => row.spaceId === ctx.spaceId && row.deletedAt === null);
  /** Why `parent` may not (again) include `child`, if it may not. */
  const includeRefusal = (
    parent: List,
    child: List,
    self?: string,
  ): ApplyOutcome | undefined => {
    if (parent.id === child.id) return reject("A list can't include itself");
    if (
      liveIncludesOf(parent.id).some(
        (row) => row.childListId === child.id && row.id !== self,
      )
    ) {
      return reject(`“${child.title}” is already included`);
    }
    if (wouldCreateCycle(parent.id, child.id, liveIncludesOf)) {
      return reject(
        `That would make a loop: “${child.title}” already contains “${parent.title}”`,
      );
    }
    return undefined;
  };
  /** An include that may be changed: it exists here, isn't deleted, nor is its parent list. */
  const liveInclude = (id: string): Include | ApplyOutcome => {
    const include = includeHere(id);
    if (!include) return reject(INCLUDE_MISSING);
    if (include.deletedAt !== null || listIsDeleted(include.parentListId))
      return unchanged;
    return include;
  };

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
    case 'list.duplicate': {
      const args = mutation.args;
      const existing = store.getList(args.id);
      if (existing) {
        return existing.spaceId === ctx.spaceId
          ? unchanged
          : reject('This list already exists');
      }
      const source = listHere(args.sourceListId);
      if (!source) return reject(LIST_MISSING);
      // Everything is checked before anything is written.
      for (const { id } of args.items) {
        if (store.getItem(id)) return reject('This item already exists');
      }
      for (const { id } of args.includes) {
        if (store.getInclude(id)) return reject('This include already exists');
      }
      store.putList({
        ...created,
        id: args.id,
        title: args.title,
        description: source.description,
      });
      // Rows deleted or moved away since the client looked are skipped: the copy is of the
      // source as the server has it now.
      const items: string[] = [];
      for (const { from, id } of args.items) {
        const item = itemHere(from);
        if (!item || item.listId !== source.id || item.deletedAt !== null)
          continue;
        store.putItem({ ...item, ...created, id, listId: args.id });
        items.push(id);
      }
      const includes: string[] = [];
      for (const { from, id } of args.includes) {
        const include = includeHere(from);
        if (
          !include ||
          include.parentListId !== source.id ||
          include.deletedAt !== null
        )
          continue;
        // A new list includes nothing and nothing includes it: no loop, no duplicate.
        store.putInclude({ ...include, ...created, id, parentListId: args.id });
        includes.push(id);
      }
      return { kind: 'changed', lists: [args.id], items, includes };
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
    case 'include.create': {
      const args = mutation.args;
      const existing = store.getInclude(args.id);
      if (existing) {
        return existing.spaceId === ctx.spaceId
          ? unchanged
          : reject('This include already exists');
      }
      const parent = listHere(args.parentListId);
      const child = listHere(args.childListId);
      if (!parent || !child) return reject(LIST_MISSING);
      if (parent.deletedAt !== null) return unchanged;
      // A child in the trash may still be included: deleting never blocks (design §2.2).
      const refusal = includeRefusal(parent, child);
      if (refusal) return refusal;
      store.putInclude({
        ...created,
        id: args.id,
        parentListId: args.parentListId,
        childListId: args.childListId,
        position: args.position,
      });
      return changedInclude(args.id);
    }
    case 'include.move': {
      const include = liveInclude(mutation.args.id);
      return isOutcome(include)
        ? include
        : updateInclude(include, { position: mutation.args.position });
    }
    case 'include.delete': {
      const include = liveInclude(mutation.args.id);
      return isOutcome(include)
        ? include
        : updateInclude(include, { deletedAt: ctx.now });
    }
    case 'include.restore': {
      const include = includeHere(mutation.args.id);
      if (!include) return reject(INCLUDE_MISSING);
      if (include.deletedAt === null || listIsDeleted(include.parentListId))
        return unchanged;
      const parent = listHere(include.parentListId);
      const child = listHere(include.childListId);
      if (!parent || !child) return reject(LIST_MISSING);
      // Others may have added the same include, or the other half of a loop, meanwhile.
      const refusal = includeRefusal(parent, child, include.id);
      if (refusal) return refusal;
      return updateInclude(include, { deletedAt: null });
    }
  }
}

/** A `RowStore` over plain maps, e.g. a client's copy of one space. */
export class MemoryRowStore implements RowStore {
  readonly lists = new Map<string, List>();
  readonly items = new Map<string, Item>();
  readonly includes = new Map<string, Include>();

  constructor(
    lists: Iterable<List> = [],
    items: Iterable<Item> = [],
    includes: Iterable<Include> = [],
  ) {
    for (const list of lists) this.lists.set(list.id, list);
    for (const item of items) this.items.set(item.id, item);
    for (const include of includes) this.includes.set(include.id, include);
  }

  getInclude(id: string) {
    return this.includes.get(id);
  }
  includesOf(parentListId: string) {
    return [...this.includes.values()].filter(
      (row) => row.parentListId === parentListId,
    );
  }
  putInclude(row: Include) {
    this.includes.set(row.id, row);
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
