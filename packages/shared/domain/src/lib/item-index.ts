import type { Id, Item, List } from './entities';
import { compareTitles } from './sorting';
import { sameItemKey } from './runs';

/** One row of the "All items" view: an item title and the lists that hold an item of that title. */
export interface IndexedItem {
  /** The title as written in the first matching item (by id), so the result is stable. */
  readonly title: string;
  /** The live lists that contain it, by title. */
  readonly lists: readonly List[];
}

/**
 * The "All items" view (D21): every item of the given live lists, identical items (D16: titles
 * equal ignoring case and surrounding spaces) as one row in title order, each with the lists
 * that hold it. Deleted items and items of lists not in `lists` are left out; an item reached
 * only through an include belongs to its own list, so it is listed under that one.
 */
export function indexItems(
  lists: readonly List[],
  items: readonly Item[],
): IndexedItem[] {
  const listsById = new Map(lists.map((list) => [list.id, list]));
  const rows = new Map<string, { title: string; ids: Set<Id> }>();
  for (const item of [...items].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (item.deletedAt !== null || !listsById.has(item.listId)) continue;
    const key = sameItemKey(item.title);
    const row = rows.get(key) ?? { title: item.title.trim(), ids: new Set() };
    row.ids.add(item.listId);
    rows.set(key, row);
  }
  return [...rows.values()]
    .map(({ title, ids }) => ({
      title,
      lists: [...ids]
        .map((id) => listsById.get(id) as List)
        .sort(
          (a, b) => compareTitles(a.title, b.title) || (a.id < b.id ? -1 : 1),
        ),
    }))
    .sort(
      (a, b) => compareTitles(a.title, b.title) || (a.title < b.title ? -1 : 1),
    );
}
