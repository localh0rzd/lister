import { generateNKeysBetween } from 'fractional-indexing';
import {
  type PositionChange,
  type Positioned,
  comparePositions,
  positionAt,
  positionAtEnd,
} from './positions';

/** A row that can be sorted by its title. */
export interface Titled extends Positioned {
  readonly title: string;
}

/** Case- and accent-insensitive, numbers by value ("List 9" before "List 10"); design §3. */
const collator = new Intl.Collator('en', {
  sensitivity: 'base',
  numeric: true,
});

/** The title order lists, items and runs share (D17); `0` for titles that differ only in case. */
export function compareTitles(a: string, b: string): number {
  return collator.compare(a, b);
}

/** Title order, then position order, then id, so equal titles keep their place. */
function compareRows(a: Titled, b: Titled): number {
  return compareTitles(a.title, b.title) || comparePositions(a, b);
}

/**
 * "Sort A–Z" (D17): the new keys that put `rows` in title order. Rows are assigned the keys they
 * already hold, in order — the slots — so nothing else in the same key space moves: the
 * includes among a list's items (`others`) keep their places. Only rows whose key changes are
 * returned (`[]` when already sorted). Rows that share a key (two clients adding at the same
 * spot, design §2.4) get fresh keys between their neighbours, so the result is unambiguous.
 * Applying the returned keys again, or sorting the result, changes nothing.
 */
export function sortByTitle(
  rows: readonly Titled[],
  others: readonly Positioned[] = [],
): PositionChange[] {
  const sortedRows = [...rows].sort(comparePositions);
  const slots = sortedRows.map((row) => row.position);
  const keys = [...slots];
  const all = [...slots, ...others.map((row) => row.position)];
  for (let start = 0; start < slots.length;) {
    let end = start;
    while (end + 1 < slots.length && slots[end + 1] === slots[start]) end++;
    const tie = slots[start];
    const tiedOthers = others.filter((row) => row.position === tie);
    if (end > start || tiedOthers.length > 0) {
      // A tied slot (rows sharing a key, or a row sharing it with an include): fresh keys
      // between the nearest keys on either side. An include keeps its key, so the rows that
      // sat before it (by id, the tie-break) get keys below it and the rest above it.
      let lower: string | null = null;
      let upper: string | null = null;
      for (const key of all) {
        if (key < tie && (lower === null || key > lower)) lower = key;
        if (key > tie && (upper === null || key < upper)) upper = key;
      }
      const count = end - start + 1;
      const firstOther = [...tiedOthers].sort(comparePositions)[0];
      const below = firstOther
        ? sortedRows
            .slice(start, end + 1)
            .filter((row) => comparePositions(row, firstOther) < 0).length
        : count;
      const fresh = firstOther
        ? [
            ...generateNKeysBetween(lower, tie, below),
            ...generateNKeysBetween(tie, upper, count - below),
          ]
        : generateNKeysBetween(lower, upper, count);
      for (let i = start; i <= end; i++) keys[i] = fresh[i - start];
    }
    start = end + 1;
  }
  const byPosition = new Map(rows.map((row) => [row.id, row.position]));
  return [...rows]
    .sort(compareRows)
    .flatMap((row, i): PositionChange[] =>
      byPosition.get(row.id) === keys[i]
        ? []
        : [{ id: row.id, position: keys[i] }],
    );
}

/**
 * A key for a new item titled `title` that sorts it in (D17): before the first of `siblings`
 * (the items of the same list or run section) whose title sorts after it, or after `all` (every
 * row of the key space, items and includes) when none does. When that item shares its key with
 * the row before it (a tie), the new key goes right after the tie: one key can't split it.
 */
export function positionForSortedInsert(
  title: string,
  siblings: readonly Titled[],
  all: readonly Positioned[],
): string {
  const next = [...siblings]
    .sort(comparePositions)
    .find((row) => compareTitles(row.title, title) > 0);
  if (!next) return positionAtEnd(all);
  const sorted = [...all].sort(comparePositions);
  return positionAt(
    sorted,
    sorted.findIndex((row) => row.id === next.id),
  );
}
