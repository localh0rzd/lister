import type { Item, List, Run } from './entities';
import { compareTitles } from './sorting';

/** How many results each group of a search shows at most. */
export const MAX_SEARCH_RESULTS = 20;

/** What a search looks through: the live lists, their live items and the active runs (D25). */
export interface SearchData {
  readonly lists: readonly List[];
  readonly items: readonly Item[];
  readonly runs: readonly Run[];
}

/** An item that matched, with the list it is in. */
export interface ItemMatch {
  readonly item: Item;
  readonly list: List;
}

/** Search results by group, best match first. */
export interface SearchResults {
  readonly lists: List[];
  readonly items: ItemMatch[];
  readonly runs: Run[];
}

/** Text as compared by search: ignoring case, accents and extra spaces. */
export function searchKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * 0 when `key` starts with the needle, 1 when a word does, 2 when it only contains it, else
 * `undefined`. A needle of several words also matches a key that contains each of them, in any
 * order: 1 when each starts a word, else 2.
 */
function rank(key: string, needle: string): number | undefined {
  const at = key.indexOf(needle);
  if (at === 0) return 0;
  if (at > 0) return key.includes(' ' + needle) ? 1 : 2;
  const words = needle.split(' ');
  if (words.length < 2 || !words.every((word) => key.includes(word))) {
    return undefined;
  }
  const spaced = ' ' + key;
  return words.every((word) => spaced.includes(' ' + word)) ? 1 : 2;
}

/**
 * The folded title and note of each row searched, so typing does not fold every row again. Rows
 * from the local database are never changed in place (a change brings a new object).
 */
const foldedRows = new WeakMap<object, { title?: string; note?: string }>();

function folded(
  row: { readonly title: string; readonly note?: string },
  field: 'title' | 'note',
): string {
  let keys = foldedRows.get(row);
  if (!keys) {
    keys = {};
    foldedRows.set(row, keys);
  }
  return (keys[field] ??= searchKey(row[field] ?? ''));
}

/** The rows `rankOf` accepts, lowest rank first, then A–Z, then by id; at most `MAX_SEARCH_RESULTS`. */
function pick<T extends { readonly id: string }>(
  rows: readonly T[],
  titleOf: (row: T) => string,
  rankOf: (row: T) => number | undefined,
): T[] {
  return rows
    .flatMap((row) => {
      const score = rankOf(row);
      return score === undefined ? [] : [{ row, score }];
    })
    .sort(
      (a, b) =>
        a.score - b.score ||
        compareTitles(titleOf(a.row), titleOf(b.row)) ||
        (a.row.id < b.row.id ? -1 : 1),
    )
    .slice(0, MAX_SEARCH_RESULTS)
    .map(({ row }) => row);
}

/**
 * The search of D25: lists and active runs by title, items by title or note, ignoring case and
 * accents. A title that starts with the text ranks first, then one with a word that does, then
 * any other match; an item matched only by its note comes last. Within a rank the order is A–Z.
 * Several words match a text that contains all of them, in any order.
 * Nothing matches empty text, and an item whose list is not in `data` is left out.
 */
export function search(data: SearchData, query: string): SearchResults {
  const needle = searchKey(query);
  if (!needle) return { lists: [], items: [], runs: [] };
  const byTitle = (row: { readonly title: string }) =>
    rank(folded(row, 'title'), needle);
  const listsById = new Map(data.lists.map((list) => [list.id, list]));
  const matches = data.items.flatMap((item) => {
    const list = listsById.get(item.listId);
    return list ? [{ id: item.id, item, list }] : [];
  });
  return {
    lists: pick(data.lists, (list) => list.title, byTitle),
    items: pick(
      matches,
      (match) => match.item.title,
      (match) =>
        byTitle(match.item) ??
        (rank(folded(match.item, 'note'), needle) === undefined
          ? undefined
          : 3),
    ).map(({ item, list }) => ({ item, list })),
    runs: pick(data.runs, (run) => run.title, byTitle),
  };
}
