import { Service, type Signal, inject } from '@angular/core';
import {
  TRASH_KEEP_MS,
  type CompositionSource,
  type Include,
  type Item,
  type List,
  type Run,
  type RunItem,
  finishedBy,
  sortByPosition,
} from '@lister/shared/domain';
import { LOCAL_DB } from './local-db';
import { type QueryState, liveQuerySignal } from './live-query-signal';

/** Case- and accent-insensitive, numbers by value ("List 9" before "List 10"); design §3. */
const byTitle = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/**
 * Something in the trash: a deleted list (its items come back with it), a deleted item, or a
 * finished run (D10). A run has no tombstone: it is in the trash while `finishedAt` is set.
 */
export type TrashEntry =
  | {
      kind: 'list';
      row: List;
      /** Items that come back with the list. */
      itemCount: number;
      /** Items of the list that were deleted on their own: they stay deleted. */
      deletedItemCount: number;
    }
  | { kind: 'item'; row: Item; listTitle: string }
  | {
      kind: 'run';
      row: Run;
      items: number;
      /** Who finished it: the check (or removal) that finished it (`finishedBy()`). */
      finishedBy: string;
    };

/** When an entry went to the trash: deleted, or (for a run) finished. */
export function trashedAt(entry: TrashEntry): number {
  return (
    (entry.kind === 'run' ? entry.row.finishedAt : entry.row.deletedAt) ?? 0
  );
}

/** Who put an entry there: who deleted it (its last change), or who finished the run. */
export function trashedBy(entry: TrashEntry): string {
  return entry.kind === 'run' ? entry.finishedBy : entry.row.updatedBy;
}

/** An active run with its progress, as the Runs page shows it. */
export interface RunSummary {
  run: Run;
  /** Items checked or skipped. */
  done: number;
  total: number;
}

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
   * come back with them), items deleted within it whose list isn't deleted (an item of a
   * deleted list comes back with its list), and runs finished within it.
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
        const live = new Map<string, number>();
        const deleted = new Map<string, number>();
        for (const item of items) {
          const counts = item.deletedAt === null ? live : deleted;
          counts.set(item.listId, (counts.get(item.listId) ?? 0) + 1);
        }
        const recent = (row: { deletedAt: number | null }) =>
          row.deletedAt !== null && row.deletedAt >= since;
        const runs = (
          await this.db.runs.where('spaceId').equals(id).toArray()
        ).filter(
          (run) =>
            run.deletedAt === null &&
            run.finishedAt !== null &&
            run.finishedAt >= since,
        );
        const runItems = new Map<string, RunItem[]>();
        await this.db.runItems
          .where('runId')
          .anyOf(runs.map((run) => run.id))
          .each((item) => {
            const of = runItems.get(item.runId);
            if (of) of.push(item);
            else runItems.set(item.runId, [item]);
          });
        const entries: TrashEntry[] = [
          ...runs.map((row) => {
            const of = runItems.get(row.id) ?? [];
            return {
              kind: 'run' as const,
              row,
              items: of.filter((item) => item.deletedAt === null).length,
              finishedBy: finishedBy(row, of),
            };
          }),
          ...lists.filter(recent).map((row) => ({
            kind: 'list' as const,
            row,
            itemCount: live.get(row.id) ?? 0,
            deletedItemCount: deleted.get(row.id) ?? 0,
          })),
          ...items.flatMap((row) => {
            const list = listsById.get(row.listId);
            if (!recent(row) || !list || list.deletedAt !== null) return [];
            return [{ kind: 'item' as const, row, listTitle: list.title }];
          }),
        ];
        return entries.sort(
          (a, b) =>
            trashedAt(b) - trashedAt(a) || (a.row.id < b.row.id ? -1 : 1),
        );
      };
    });
  }

  /**
   * The space's active runs, newest first, with their progress. Finished and deleted runs are
   * left out: a finished run is only in the trash (D10).
   */
  activeRunsOfSpace(
    spaceId: () => string | undefined,
  ): Signal<QueryState<RunSummary[]>> {
    return liveQuerySignal(() => {
      const id = spaceId();
      if (!id) return undefined;
      return async () => {
        const runs = (await this.db.runs.where('spaceId').equals(id).toArray())
          .filter((run) => run.deletedAt === null && run.finishedAt === null)
          .sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1));
        const items = await this.db.runItems
          .where('runId')
          .anyOf(runs.map((run) => run.id))
          .toArray();
        return runs.map((run) => {
          const live = items.filter(
            (item) => item.runId === run.id && item.deletedAt === null,
          );
          return {
            run,
            done: live.filter((item) => item.state !== 'unchecked').length,
            total: live.length,
          };
        });
      };
    });
  }

  /** One run by id, finished or not (`undefined` if it doesn't exist here). */
  run(runId: () => string | undefined): Signal<QueryState<Run | undefined>> {
    return liveQuerySignal(() => {
      const id = runId();
      if (!id) return undefined;
      return () => this.db.runs.get(id);
    });
  }

  /** The items of a run, by position, without removed ones (merged-away aliases are removed rows, so they're left out too). */
  itemsOfRun(runId: () => string | undefined): Signal<QueryState<RunItem[]>> {
    return liveQuerySignal(() => {
      const id = runId();
      if (!id) return undefined;
      return async () =>
        sortByPosition(
          (await this.db.runItems.where('runId').equals(id).toArray()).filter(
            (item) => item.deletedAt === null,
          ),
        );
    });
  }

  /** One run item by id, removed or not (`undefined` if it doesn't exist here). */
  runItem(
    id: () => string | undefined,
  ): Signal<QueryState<RunItem | undefined>> {
    return liveQuerySignal(() => {
      const itemId = id();
      if (!itemId) return undefined;
      return () => this.db.runItems.get(itemId);
    });
  }

  /** The signed-in user's id, as the server's welcome told this device (until then `undefined`). */
  currentUserId(): Signal<QueryState<string | undefined>> {
    return liveQuerySignal(
      () => async () => (await this.db.meta.get('userId'))?.value,
    );
  }
}
