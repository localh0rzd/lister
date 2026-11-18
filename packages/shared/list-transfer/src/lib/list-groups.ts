import {
  type CompositionSource,
  type Id,
  type Item,
  flattenEntries,
} from '@lister/shared/domain';

/** The items of one list within an exported or printed list (D24). */
export interface ListGroup {
  readonly listId: Id;
  /** `null` for the list itself, else the included list's title. */
  readonly title: string | null;
  /** 0 for the list itself, 1 for a list it includes, and so on. */
  readonly depth: number;
  readonly items: readonly Item[];
}

/**
 * A list's items grouped by the list they belong to: its own items first, then each included
 * list (in the order it first appears, with its depth) with all of its own items, so an item
 * that follows an include stays with its list. A list reached twice appears once (D2); a list in
 * the trash is left out.
 */
export function groupsOfList(
  listId: Id,
  source: CompositionSource,
): ListGroup[] {
  const groups = new Map<Id, ListGroup & { items: Item[] }>([
    [listId, { listId, title: null, depth: 0, items: [] }],
  ]);
  for (const entry of flattenEntries(listId, source)) {
    if (entry.kind === 'item') {
      groups.get(entry.listId)?.items.push(entry.item);
    } else if (
      entry.kind === 'section' &&
      entry.state === 'live' &&
      entry.list
    ) {
      const { id, title } = entry.list;
      groups.set(id, { listId: id, title, depth: entry.depth + 1, items: [] });
    }
  }
  return [...groups.values()];
}
