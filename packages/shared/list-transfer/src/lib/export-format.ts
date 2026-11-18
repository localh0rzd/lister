import * as z from 'zod/mini';
import {
  type CompositionSource,
  type Id,
  type Item,
  type Include,
  comparePositions,
  newId,
} from '@lister/shared/domain';
import {
  type MutationArgs,
  colourSchema,
  descriptionSchema,
  iconSchema,
  idSchema,
  noteSchema,
  quantitySchema,
  titleSchema,
} from '@lister/shared/sync-protocol';

/** What a Lister JSON export says it is, and its current version (D24). */
export const EXPORT_FORMAT = 'lister-lists';
export const EXPORT_VERSION = 1;

const exportedItem = z.object({
  /** Optional: the item's id in the exporting space, so an exception can name it (D28). */
  id: z.optional(idSchema),
  title: titleSchema,
  quantity: z._default(quantitySchema, ''),
  note: z._default(noteSchema, ''),
});
/** An entry of a list: an item, or the (file) id of an included list. */
const exportedEntry = z.union([
  z.object({
    include: idSchema,
    /** Optional (D28): what the include leaves out, by the file's item and list ids. */
    exceptions: z.optional(
      z.array(
        z.object({
          targetKind: z.enum(['item', 'list']),
          targetId: idSchema,
        }),
      ),
    ),
  }),
  exportedItem,
]);

export const listExportSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  lists: z
    .array(
      z.object({
        id: idSchema,
        title: titleSchema,
        description: z._default(descriptionSchema, ''),
        /** Optional (D26): files from before colours and icons have neither, and a value this
         * version doesn't know is dropped rather than refusing the file. */
        colour: z._default(z.catch(z.nullable(colourSchema), null), null),
        icon: z._default(z.catch(z.nullable(iconSchema), null), null),
        /** Items and includes in the list's order. */
        entries: z.array(exportedEntry),
      }),
    )
    .check(
      z.minLength(1, 'This file has no lists'),
      z.refine(
        (lists) => new Set(lists.map((list) => list.id)).size === lists.length,
        'This file lists the same list twice',
      ),
    ),
});

export type ListExport = z.output<typeof listExportSchema>;

/** An include entry; `exceptions` is left out of the file when there are none. */
function includeEntry(
  row: Include,
  exceptions: { targetKind: 'item' | 'list'; targetId: Id }[],
) {
  return exceptions.length === 0
    ? { include: row.childListId }
    : { include: row.childListId, exceptions };
}

/**
 * The export of `listIds` (live lists only, in that order) plus every live list they include,
 * directly or not. Each list holds its live items and includes of live lists in position order.
 */
export function buildListExport(
  listIds: readonly Id[],
  source: CompositionSource,
): ListExport {
  const lists: ListExport['lists'] = [];
  const exceptionsOf = (includeId: Id) =>
    (source.exceptionsOf?.(includeId) ?? [])
      .filter((row) => row.deletedAt === null)
      .map(({ targetKind, targetId }) => ({ targetKind, targetId }));
  const seen = new Set<Id>();
  const queue = [...listIds];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    const list = source.list(id);
    if (!list || list.deletedAt !== null || seen.has(id)) continue;
    seen.add(id);
    const rows: (Item | Include)[] = [
      ...source.itemsOf(id).filter((row) => row.deletedAt === null),
      ...source
        .includesOf(id)
        .filter(
          (row) =>
            row.deletedAt === null &&
            source.list(row.childListId)?.deletedAt === null,
        ),
    ].sort(comparePositions);
    lists.push({
      id,
      title: list.title,
      description: list.description,
      colour: list.colour,
      icon: list.icon,
      entries: rows.map((row) =>
        'childListId' in row
          ? includeEntry(row, exceptionsOf(row.id))
          : {
              id: row.id,
              title: row.title,
              quantity: row.quantity,
              note: row.note,
            },
      ),
    });
    for (const row of rows)
      if ('childListId' in row) queue.push(row.childListId);
  }
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, lists };
}

/**
 * The `list.import` arguments that create new copies of every list of an export: new ids, and
 * includes remapped among them. An include of a list that isn't in the file (or a repeat of
 * one) is dropped.
 */
export function importArgs(
  file: ListExport,
  makeId: () => Id = newId,
): MutationArgs<'list.import'> {
  const ids = new Map(file.lists.map((list) => [list.id, makeId()]));
  // The new id of every item the file names (D28 exceptions refer to them).
  const itemIds = new Map<Id, Id>();
  for (const list of file.lists) {
    for (const entry of list.entries) {
      if (!('include' in entry) && entry.id !== undefined)
        itemIds.set(entry.id, itemIds.get(entry.id) ?? makeId());
    }
  }
  const taken = new Set<Id>();
  return {
    lists: file.lists.map((list) => {
      const included = new Set<Id>();
      const entries: MutationArgs<'list.import'>['lists'][number]['entries'] =
        [];
      for (const entry of list.entries) {
        if (!('include' in entry)) {
          // An item id used twice in a file names the first one.
          const known =
            entry.id === undefined ? undefined : itemIds.get(entry.id);
          const id =
            known !== undefined && !taken.has(known) ? known : makeId();
          taken.add(id);
          entries.push({
            id,
            title: entry.title,
            quantity: entry.quantity,
            note: entry.note,
          });
          continue;
        }
        const listId = ids.get(entry.include);
        if (listId === undefined || included.has(listId)) continue;
        included.add(listId);
        // Exceptions whose target isn't in the file, or that repeat one, are dropped.
        const targets = new Set<Id>();
        const exceptions = (entry.exceptions ?? []).flatMap((exception) => {
          const targetId =
            exception.targetKind === 'item'
              ? itemIds.get(exception.targetId)
              : ids.get(exception.targetId);
          if (targetId === undefined || targets.has(targetId)) return [];
          targets.add(targetId);
          return [{ id: makeId(), targetKind: exception.targetKind, targetId }];
        });
        entries.push({ id: makeId(), listId, exceptions });
      }
      return {
        id: ids.get(list.id) as Id,
        title: list.title,
        description: list.description,
        colour: list.colour,
        icon: list.icon,
        entries,
      };
    }),
  };
}

/** A file name for a download: the title without characters file systems refuse. */
export function exportFileName(title: string, extension: string): string {
  const name = title
    // eslint-disable-next-line no-control-regex -- names must not hold control characters
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 100)
    .trim();
  return `${name || 'list'}.${extension}`;
}
