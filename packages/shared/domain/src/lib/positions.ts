import { generateKeyBetween } from 'fractional-indexing';
import type { Id } from './entities';

/**
 * Positions are fractional-index keys (strings) compared by code unit, the same order SQLite
 * (BINARY) and IndexedDB use. Two clients inserting at the same spot offline can produce the
 * same key; rows with equal keys are ordered by id, so every client shows the same order.
 */
export interface Positioned {
  readonly id: Id;
  readonly position: string;
}

export function comparePositions(a: Positioned, b: Positioned): number {
  if (a.position !== b.position) return a.position < b.position ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/** A sorted copy. */
export function sortByPosition<T extends Positioned>(rows: readonly T[]): T[] {
  return [...rows].sort(comparePositions);
}

/**
 * A key between two neighbours' keys; `null` means the start or the end. The neighbours must be
 * in order and distinct: for a drop between rows that may share a key, use `positionAt`, which
 * skips ties.
 */
export function positionBetween(
  before: string | null,
  after: string | null,
): string {
  if (before !== null && after !== null && before >= after) {
    throw new Error(
      `positionBetween needs before < after (got ${before}, ${after}); use positionAt`,
    );
  }
  return generateKeyBetween(before, after);
}

/** True for a well-formed fractional-index key that the helpers above can build on. */
export function isPositionKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[0-9A-Za-z]{1,100}$/.test(value)) {
    return false;
  }
  try {
    generateKeyBetween(value, null);
    generateKeyBetween(null, value);
    return true;
  } catch {
    return false;
  }
}

/** A key after all of `rows` (to append). */
export function positionAtEnd(rows: readonly Positioned[]): string {
  const last = rows.reduce<string | null>(
    (max, row) => (max === null || row.position > max ? row.position : max),
    null,
  );
  return positionBetween(last, null);
}

/**
 * A key that puts a row at `index` of the sorted `rows` (0 = first, rows.length = last). The
 * moved row itself must not be in `rows`. Equal neighbouring keys are skipped, so the result
 * always sorts where asked or right after a tie.
 */
export function positionAt(rows: readonly Positioned[], index: number): string {
  const sorted = sortByPosition(rows);
  const at = Math.max(0, Math.min(index, sorted.length));
  const before = at > 0 ? sorted[at - 1].position : null;
  const next = sorted
    .slice(at)
    .find((row) => before === null || row.position > before);
  return positionBetween(before, next?.position ?? null);
}
