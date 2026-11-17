import type { CompositionSource, Id } from '@lister/shared/domain';
import { groupsOfList } from '@lister/shared/list-transfer';
import type { PrintGroup } from './print-sheet/print-sheet';

/**
 * What a list prints: its own items first, then each included list under its own heading, every
 * list once (a diamond prints its shared list once, D2). Lists in the trash are left out, and so
 * is the list's own group when it has no items of its own.
 */
export function printGroupsOfList(
  listId: Id,
  source: CompositionSource,
): PrintGroup[] {
  return groupsOfList(listId, source)
    .filter((group) => group.title !== null || group.items.length > 0)
    .map((group) => ({
      key: group.listId,
      title: group.title,
      items: group.items,
    }));
}
