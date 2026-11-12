import { Service, type Signal, inject } from '@angular/core';
import {
  TRASH_KEEP_MS,
  type CompositionSource,
  type Include,
  type Item,
  type List,
  sortByPosition,
} from '@lister/shared/domain';
import { LOCAL_DB } from './local-db';
import { type QueryState, liveQuerySignal } from './live-query-signal';

/** Case- and accent-insensitive, numbers by value ("List 9" before "List 10"); design §3. */
const byTitle = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/** Something in the trash: a deleted list (its items come back with it) or a deleted item. */
export type TrashEntry =
  | { kind: 'list'; row: List; itemCount: number }
  | { kind: 'item'; row: Item; listTitle: string };

/** A space's lists, items and includes (tombstones included), for flattening and loop checks. */
export interface SpaceComposition extends CompositionSource {
  /** The live includes of the space. */
  readonly includes: readonly Include[];
  /** The live lists that include this list, directly or through other lists. */
  usersOf(listId: string): ReadonlySet<string>;
}

function composition(
  lists: readonly List[],
  items: readonly Item[],
  includes: readonly Include[],
): SpaceComposition {
  const listsById = new Map(lists.map((list) => [list.id, list]));
  const group = <T>(rows: readonly T[], key: (row: T) => string) => {
    const map = new Map<string, T[]>();
    for (const row of rows)
      map.set(key(row), [...(map.get(key(row)) ?? []), row]);
    return map;
  };
  const itemsByList = group(items, (item) => item.listId);
  const includesByParent = group(includes, (row) => row.parentListId);
  const live = includes.filter(
    (row) =>
      row.deletedAt === null &&
      listsById.get(row.parentListId)?.deletedAt === null,
  );
  const parentsOf = new Map<string, Set<string>>();
  for (const row of live) {
    const parents = parentsOf.get(row.childListId) ?? new Set<string>();
    parents.add(row.parentListId);
    parentsOf.set(row.childListId, parents);
  }
  const usersOf = (listId: string) => {
    const users = new Set<string>();
    const stack = [listId];
    while (stack.length > 0) {
      for (const parent of parentsOf.get(stack.pop() as string) ?? []) {
        if (parent === listId || users.has(parent)) continue;
        users.add(parent);
        stack.push(parent);
      }
    }
    return users;
  };
  return {
    includes: includes.filter((row) => row.deletedAt === null),
    list: (id) => listsById.get(id),
    itemsOf: (listId) => itemsByList.get(listId) ?? [],
    includesOf: (listId) => includesByParent.get(listId) ?? [],
    usersOf,
  };
}

/**
 * Read-only queries on the local database, as signals. Changes go through the sync engine's
 * mutations (`@lister/web/data-access-sync`), never through these tables directly.
 * Call the methods in an injection context (field initializers).
 */
@Service()
export class Repositories {
  private readonly db = inject(LOCAL_DB);

  /** The lists of a space, by title (design §3), without deleted ones. */
  listsOfSpace(spaceId: () => string | undefined): Signal<QueryState<List[]>> {
    return liveQuerySignal(() => {
      const id = spaceId();
      if (!id) return undefined;
      return async () =>
        (await this.db.lists.where('spaceId').equals(id).toArray())
          .filter((list) => list.deletedAt === null)
          .sort(
            (a, b) =>
              byTitle.compare(a.title, b.title) || (a.id < b.id ? -1 : 1),
          );
    });
  }

  /** One list by id, deleted or not (`undefined` if it doesn't exist here). */
  list(listId: () => string | undefined): Signal<QueryState<List | undefined>> {
    return liveQuerySignal(() => {
      const id = listId();
      if (!id) return undefined;
      return () => this.db.lists.get(id);
    });
  }

  /** The items of a list, by position, without deleted ones. */
  itemsOfList(listId: () => string | undefined): Signal<QueryState<Item[]>> {
    return liveQuerySignal(() => {
      const id = listId();
      if (!id) return undefined;
      return async () =>
        sortByPosition(
          (await this.db.items.where('listId').equals(id).toArray()).filter(
            (item) => item.deletedAt === null,
          ),
        );
    });
  }

  /**
   * Every list, item and include of a space, kept current: what `flattenEntries` and
   * `wouldCreateCycle` read (the list editor, the include picker).
   */
  compositionOfSpace(
    spaceId: () => string | undefined,
  ): Signal<QueryState<SpaceComposition>> {
    return liveQuerySignal(() => {
      const id = spaceId();
      if (!id) return undefined;
      return async () =>
        composition(
          await this.db.lists.where('spaceId').equals(id).toArray(),
          await this.db.items.where('spaceId').equals(id).toArray(),
          await this.db.includes.where('spaceId').equals(id).toArray(),
        );
    });
  }

  /**
   * The space's trash, newest first: lists deleted within `TRASH_KEEP_MS` (with how many items
   * come back with them), and items deleted within it whose list isn't deleted (an item of a
   * deleted list comes back with its list).
   */
  trashOfSpace(
    spaceId: () => string | undefined,
    now: () => number = Date.now,
  ): Signal<QueryState<TrashEntry[]>> {
    return liveQuerySignal(() => {
      const id = spaceId();
      if (!id) return undefined;
      return async () => {
        const since = now() - TRASH_KEEP_MS;
        const lists = await this.db.lists.where('spaceId').equals(id).toArray();
        const items = await this.db.items.where('spaceId').equals(id).toArray();
        const listsById = new Map(lists.map((list) => [list.id, list]));
        const recent = (row: { deletedAt: number | null }) =>
          row.deletedAt !== null && row.deletedAt >= since;
        const entries: TrashEntry[] = [
          ...lists.filter(recent).map((row) => ({
            kind: 'list' as const,
            row,
            itemCount: items.filter(
              (item) => item.listId === row.id && item.deletedAt === null,
            ).length,
          })),
          ...items.flatMap((row) => {
            const list = listsById.get(row.listId);
            if (!recent(row) || !list || list.deletedAt !== null) return [];
            return [{ kind: 'item' as const, row, listTitle: list.title }];
          }),
        ];
        return entries.sort(
          (a, b) =>
            (b.row.deletedAt ?? 0) - (a.row.deletedAt ?? 0) ||
            (a.row.id < b.row.id ? -1 : 1),
        );
      };
    });
  }

  /** The signed-in user's id, as the server's welcome told this device (until then `undefined`). */
  currentUserId(): Signal<QueryState<string | undefined>> {
    return liveQuerySignal(
      () => async () => (await this.db.meta.get('userId'))?.value,
    );
  }
}
