import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
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

/** A new key for one row, as `moveTo` returns them. */
export interface PositionChange {
  readonly id: Id;
  readonly position: string;
}

/**
 * The key changes that put `movedId` at `toIndex` of the sorted `rows` (0 = first). Usually
 * that's one change for the moved row. When it lands among rows that share a key (a tie from
 * two clients inserting at the same spot, design §2.4), the tied rows get fresh keys as well,
 * so the move always takes effect. Returns `[]` when the order wouldn't change.
 */
export function moveTo(
  rows: readonly Positioned[],
  movedId: Id,
  toIndex: number,
): PositionChange[] {
  const sorted = sortByPosition(rows);
  const moved = sorted.find((row) => row.id === movedId);
  if (!moved) return [];
  const order = sorted.filter((row) => row.id !== movedId);
  const at = Math.max(0, Math.min(toIndex, order.length));
  order.splice(at, 0, moved);
  if (order.every((row, i) => row.id === sorted[i].id)) return [];

  const before = order[at - 1];
  const after = order[at + 1];
  if (!before || !after || before.position < after.position) {
    return [
      {
        id: movedId,
        position: positionBetween(
          before?.position ?? null,
          after?.position ?? null,
        ),
      },
    ];
  }

  // Inside a tie (the others stay sorted, so the neighbours share one key): re-key the moved
  // row together with every row that has that key.
  const tieKey = before.position;
  let start = at;
  while (start > 0 && order[start - 1].position === tieKey) start--;
  let end = at;
  while (end < order.length - 1 && order[end + 1].position === tieKey) end++;

  const lower = start > 0 ? order[start - 1].position : null;
  const upper = end < order.length - 1 ? order[end + 1].position : null;
  const keys = generateNKeysBetween(lower, upper, end - start + 1);
  return order
    .slice(start, end + 1)
    .map((row, i) => ({ id: row.id, position: keys[i] }))
    .filter((change) => {
      const row = order.find((r) => r.id === change.id);
      return change.id === movedId || row?.position !== change.position;
    });
}

/** `count` ascending keys for rows entering an empty list, in order. */
export function positionsFromStart(count: number): string[] {
  return generateNKeysBetween(null, null, count);
}
