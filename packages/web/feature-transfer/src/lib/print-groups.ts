import {
  type CompositionSource,
  type Id,
  flattenEntries,
} from '@lister/shared/domain';
import type { PrintGroup, PrintItem } from './print-sheet/print-sheet';

/**
 * What a list prints: its own items first, then each included list under its own heading, every
 * list once (a diamond prints its shared list once, D2). Lists in the trash are left out.
 */
export function printGroupsOfList(
  listId: Id,
  source: CompositionSource,
): PrintGroup[] {
  const groups = new Map<Id, { title: string | null; items: PrintItem[] }>([
    [listId, { title: null, items: [] }],
  ]);
  for (const entry of flattenEntries(listId, source)) {
    if (entry.kind === 'section') {
      if (entry.state === 'live' && entry.list) {
        groups.set(entry.list.id, { title: entry.list.title, items: [] });
      }
      continue;
    }
    groups.get(entry.listId)?.items.push(entry.item);
  }
  return [...groups].flatMap(([id, group]) =>
    group.items.length > 0 || group.title
      ? [{ key: id, title: group.title, items: group.items }]
      : [],
  );
}
