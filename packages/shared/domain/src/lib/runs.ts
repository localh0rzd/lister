import type { Id, RunItem } from './entities';
import { type CompositionSource, flatten } from './composition';
import { LIMITS } from './limits';

/** Titles that count as the same item (D16): ignoring case and surrounding spaces. */
export function sameItemKey(title: string): string {
  return title.trim().toLocaleLowerCase('en');
}

/** A quantity's amount if it is a plain number; an empty quantity counts as 1 (D6). */
function amount(quantity: string): number | undefined {
  const text = quantity.trim();
  if (text === '') return 1;
  return /^\d+(\.\d+)?$/.test(text) ? Number(text) : undefined;
}

const cut = (text: string, max: number) =>
  [...text].length <= max ? text : [...text].slice(0, max - 1).join('') + '…';

/**
 * The quantity of two identical items merged (D16): the larger of two plain numbers (not the
 * sum: two lists needing a headlamp still means one headlamp; empty counts as 1); otherwise the
 * different texts joined ("2 pairs, 1 pair"), so nothing is lost.
 */
export function mergeQuantity(existing: string, incoming: string): string {
  const a = amount(existing);
  const b = amount(incoming);
  if (a !== undefined && b !== undefined) return b > a ? incoming : existing;
  const parts = existing
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  const known = parts.map((part) => part.toLocaleLowerCase('en'));
  const next = incoming.trim();
  if (next === '' || known.includes(next.toLocaleLowerCase('en'))) {
    return existing;
  }
  return cut(
    existing.trim() === '' ? next : `${existing}, ${next}`,
    LIMITS.quantity,
  );
}

/**
 * Notes of two identical items merged: both kept, unless one already contains the other
 * (ignoring case), in which case the longer one stays.
 */
export function mergeNote(existing: string, incoming: string): string {
  const next = incoming.trim();
  const has = (a: string, b: string) =>
    a.toLocaleLowerCase('en').includes(b.toLocaleLowerCase('en'));
  if (next === '' || has(existing, next)) return existing;
  if (existing.trim() === '' || has(next, existing.trim())) return next;
  return cut(`${existing} · ${next}`, LIMITS.note);
}

/** Source lists merged, in order, each once. */
export function mergeSources(
  existing: readonly Id[],
  incoming: readonly Id[],
): Id[] {
  return [...new Set([...existing, ...incoming])];
}

/** What changes when an item identical to `existing` enters its run (D16). */
export function mergeRunItem(
  existing: Pick<RunItem, 'quantity' | 'note' | 'sources' | 'state'>,
  incoming: { quantity: string; note: string; sources: readonly Id[] },
): Pick<RunItem, 'quantity' | 'note' | 'sources' | 'state'> {
  const quantity = mergeQuantity(existing.quantity, incoming.quantity);
  return {
    quantity,
    note: mergeNote(existing.note, incoming.note),
    sources: mergeSources(existing.sources, incoming.sources),
    // More of something already packed: it needs checking again.
    state:
      existing.state === 'checked' && quantity !== existing.quantity
        ? 'unchecked'
        : existing.state,
  };
}

/** A run is finished while it has items and every one is checked or skipped (D10). */
export function isRunFinished(
  items: readonly Pick<RunItem, 'state' | 'deletedAt'>[],
): boolean {
  const live = items.filter((item) => item.deletedAt === null);
  return live.length > 0 && live.every((item) => item.state !== 'unchecked');
}

/**
 * The item whose check finished a run, which restoring it unchecks (D20): of the live items that
 * are checked or skipped, the one whose state was set last (ties: the later position, then id,
 * so every device picks the same one). `undefined` when nothing is checked.
 */
export function lastCheckedItem<
  T extends Pick<
    RunItem,
    'id' | 'state' | 'stateAt' | 'deletedAt' | 'position'
  >,
>(items: readonly T[]): T | undefined {
  let last: T | undefined;
  for (const item of items) {
    if (item.deletedAt !== null || item.state === 'unchecked') continue;
    if (!last || isLater(item, last)) last = item;
  }
  return last;
}

function isLater(
  a: Pick<RunItem, 'id' | 'stateAt' | 'position'>,
  b: Pick<RunItem, 'id' | 'stateAt' | 'position'>,
): boolean {
  const at = (a.stateAt ?? 0) - (b.stateAt ?? 0);
  if (at !== 0) return at > 0;
  if (a.position !== b.position) return a.position > b.position;
  return a.id > b.id;
}

/** An item about to enter a run, as `run.start` and `run.addItems` carry it. */
export interface NewRunItem {
  id: Id;
  title: string;
  quantity: string;
  note: string;
  sources: Id[];
}

/**
 * A list's items, included lists' too, as they enter a run (design §3): flattened, in order,
 * each with the list it belongs to as its source, and a new id from `newId`. Merging identical
 * items is the run rule's job (D16), so nothing is merged here.
 */
export function runItemsFromList(
  listId: Id,
  source: CompositionSource,
  newId: () => Id,
): NewRunItem[] {
  return flatten(listId, source).map(({ item, listId: from }) => ({
    id: newId(),
    title: item.title,
    quantity: item.quantity,
    note: item.note,
    sources: [from],
  }));
}
