import type { Id, Include, IncludeException, Item, List } from './entities';
import { comparePositions } from './positions';

/** Where flattening and the cycle check read a space's rows from (tombstones included). */
export interface CompositionSource {
  list(id: Id): List | undefined;
  /** The list's own items. */
  itemsOf(listId: Id): readonly Item[];
  /** The includes whose parent is the list. */
  includesOf(listId: Id): readonly Include[];
  /** The exceptions (D28) of the include, tombstones included. Absent: nothing is left out. */
  exceptionsOf?(includeId: Id): readonly IncludeException[];
}

/** One item of a flattened list, with the list it belongs to (its section). */
export interface FlatItem {
  readonly item: Item;
  readonly listId: Id;
}

/**
 * An entry of a list as the editor shows it: an item, or an included list's section header.
 * `depth` is 0 for the list's own entries, 1 inside an included list, and so on.
 * A section's `state` says what follows it: `live` (its entries), `deleted` (the list is in the
 * trash or missing: a placeholder, nothing follows) or `repeated` (already shown above, in a
 * diamond or a loop: nothing follows).
 */
export type FlatEntry =
  | {
      readonly kind: 'item';
      readonly item: Item;
      readonly listId: Id;
      readonly depth: number;
    }
  | {
      readonly kind: 'section';
      readonly include: Include;
      readonly list: List | undefined;
      readonly state: 'live' | 'deleted' | 'repeated';
      readonly depth: number;
    }
  | {
      /**
       * An item or an included list that an exception (D28) leaves out. It sits in the section
       * `listId` (the list that has the item, or the parent of the include), at `depth`, and
       * `exception` is the one that applies (the nearest to the viewed list); its owner is the
       * list of `exception`'s include: `ownerListId`.
       */
      readonly kind: 'leftOut';
      readonly target:
        | { readonly kind: 'item'; readonly item: Item }
        | {
            readonly kind: 'list';
            readonly include: Include;
            readonly list: List | undefined;
          };
      readonly listId: Id;
      readonly depth: number;
      readonly exception: IncludeException;
      readonly ownerListId: Id;
    };

const byPosition = <T extends { position: string; id: Id }>(rows: T[]) =>
  rows.sort((a, b) => comparePositions(a, b));

/** The live includes of the list whose child is a live list, in position order. */
const liveIncludesOf = (id: Id, source: CompositionSource) =>
  byPosition(
    source
      .includesOf(id)
      .filter(
        (row) =>
          row.deletedAt === null &&
          source.list(row.childListId)?.deletedAt === null,
      ),
  );

/**
 * The live exceptions of every live include reachable from the list (through live includes of
 * live lists) whose target is still below that include, by target id; any other exception does
 * nothing (design §2.2, "Targets that go away"). When several name the same target, the one
 * nearest to the list wins (breadth first, in position order), for the editor to say where it
 * was left out.
 */
function collectExceptions(
  listId: Id,
  source: CompositionSource,
): Map<Id, { exception: IncludeException; ownerListId: Id }> {
  const found = new Map<Id, { exception: IncludeException; ownerListId: Id }>();
  const exceptionsOf = source.exceptionsOf;
  if (!exceptionsOf) return found;
  // The lists and items below each child list (the child included), worked out once per child.
  const below = new Map<Id, { lists: Set<Id>; items: Set<Id> }>();
  const belowOf = (childId: Id) => {
    let rows = below.get(childId);
    if (!rows) {
      rows = { lists: new Set([childId]), items: new Set() };
      for (const id of rows.lists) {
        for (const item of source.itemsOf(id)) rows.items.add(item.id);
        for (const include of liveIncludesOf(id, source)) {
          rows.lists.add(include.childListId);
        }
      }
      below.set(childId, rows);
    }
    return rows;
  };
  const seen = new Set<Id>([listId]);
  const queue = [listId];
  for (const id of queue) {
    for (const include of liveIncludesOf(id, source)) {
      for (const exception of exceptionsOf(include.id)) {
        if (exception.deletedAt !== null || found.has(exception.targetId)) {
          continue;
        }
        const rows = belowOf(include.childListId);
        const targets =
          exception.targetKind === 'item' ? rows.items : rows.lists;
        if (targets.has(exception.targetId)) {
          found.set(exception.targetId, { exception, ownerListId: id });
        }
      }
      if (!seen.has(include.childListId)) {
        seen.add(include.childListId);
        queue.push(include.childListId);
      }
    }
  }
  return found;
}

/**
 * A list's entries with those of its included lists, in position order (design §3, Flattening):
 * walk the list's own items and includes by position; an item is emitted with its list, an
 * include emits its section and recurses into its child unless that list was already visited.
 * So a list reached twice (a diamond) appears once, and a cycle can't loop. Deleted items and
 * includes are left out; an included list in the trash is a `deleted` section. Items and lists
 * that exceptions leave out (D28) are skipped wherever they are met and reported as `leftOut`.
 */
export function flattenEntries(
  listId: Id,
  source: CompositionSource,
): FlatEntry[] {
  const out: FlatEntry[] = [];
  const visited = new Set<Id>();
  const leftOut = collectExceptions(listId, source);
  const visit = (id: Id, depth: number) => {
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
      const isItem = entry.kind === 'item';
      const hit = leftOut.get(isItem ? entry.row.id : entry.row.childListId);
      if (hit && hit.exception.targetKind === (isItem ? 'item' : 'list')) {
        out.push({
          kind: 'leftOut',
          target: isItem
            ? { kind: 'item', item: entry.row }
            : {
                kind: 'list',
                include: entry.row,
                list: source.list(entry.row.childListId),
              },
          listId: id,
          depth,
          exception: hit.exception,
          ownerListId: hit.ownerListId,
        });
        continue;
      }
      if (entry.kind === 'item') {
        out.push({ kind: 'item', item: entry.row, listId: id, depth });
        continue;
      }
      const list = source.list(entry.row.childListId);
      const state =
        list?.deletedAt !== null
          ? 'deleted' // missing or in the trash
          : visited.has(list.id)
            ? 'repeated'
            : 'live';
      out.push({ kind: 'section', include: entry.row, list, state, depth });
      if (state === 'live' && list) visit(list.id, depth + 1);
    }
  };
  visit(listId, 0);
  return out;
}

/**
 * A list's items with those of its included lists, in order, each with its source list: what a
 * run copies (design §3). The same walk as `flattenEntries`, without the section headers.
 */
export function flatten(listId: Id, source: CompositionSource): FlatItem[] {
  return flattenEntries(listId, source).flatMap((entry) =>
    entry.kind === 'item' ? [{ item: entry.item, listId: entry.listId }] : [],
  );
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
