import type { Id, Include, Item, List } from './entities';
import { comparePositions } from './positions';

/** Where flattening and the cycle check read a space's rows from (tombstones included). */
export interface CompositionSource {
  list(id: Id): List | undefined;
  /** The list's own items. */
  itemsOf(listId: Id): readonly Item[];
  /** The includes whose parent is the list. */
  includesOf(listId: Id): readonly Include[];
}

/** One item of a flattened list, with the list it belongs to (its section). */
export interface FlatItem {
  readonly item: Item;
  readonly listId: Id;
}

/**
 * A list's items with those of its included lists, in position order (design §3, Flattening):
 * walk the list's own items and includes by position; an item is emitted with its list, an
 * include recurses into its child unless that list was already visited. So a list reached twice
 * (a diamond) appears once, and a cycle can't loop. Deleted items, includes and lists are left
 * out.
 */
export function flatten(listId: Id, source: CompositionSource): FlatItem[] {
  const out: FlatItem[] = [];
  const visited = new Set<Id>();
  const visit = (id: Id) => {
    visited.add(id);
    const entries: (
      { kind: 'item'; row: Item } | { kind: 'include'; row: Include }
    )[] = [
      ...source
        .itemsOf(id)
        .filter((row) => row.deletedAt === null)
        .map((row) => ({ kind: 'item' as const, row })),
      ...source
        .includesOf(id)
        .filter((row) => row.deletedAt === null)
        .map((row) => ({ kind: 'include' as const, row })),
    ];
    entries.sort((a, b) => comparePositions(a.row, b.row));
    for (const entry of entries) {
      if (entry.kind === 'item') {
        out.push({ item: entry.row, listId: id });
        continue;
      }
      const child = entry.row.childListId;
      if (visited.has(child)) continue;
      if (source.list(child)?.deletedAt !== null) continue; // missing or in the trash
      visit(child);
    }
  };
  visit(listId);
  return out;
}

/**
 * Whether including `childId` in `parentId` would close a loop: the parent is the child, or the
 * child already reaches the parent through live includes. Includes of deleted lists still count,
 * so restoring a list can never bring a loop back.
 */
export function wouldCreateCycle(
  parentId: Id,
  childId: Id,
  includesOf: CompositionSource['includesOf'],
): boolean {
  const seen = new Set<Id>();
  const stack = [childId];
  while (stack.length > 0) {
    const id = stack.pop() as Id;
    if (id === parentId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const include of includesOf(id)) {
      if (include.deletedAt === null) stack.push(include.childListId);
    }
  }
  return false;
}
