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
  descriptionSchema,
  idSchema,
  noteSchema,
  quantitySchema,
  titleSchema,
} from '@lister/shared/sync-protocol';

/** What a Lister JSON export says it is, and its current version (D24). */
export const EXPORT_FORMAT = 'lister-lists';
export const EXPORT_VERSION = 1;

const exportedItem = z.object({
  title: titleSchema,
  quantity: z._default(quantitySchema, ''),
  note: z._default(noteSchema, ''),
});
/** An entry of a list: an item, or the (file) id of an included list. */
const exportedEntry = z.union([z.object({ include: idSchema }), exportedItem]);

export const listExportSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  lists: z
    .array(
      z.object({
        id: idSchema,
        title: titleSchema,
        description: z._default(descriptionSchema, ''),
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

/**
 * The export of `listIds` (live lists only, in that order) plus every live list they include,
 * directly or not. Each list holds its live items and includes of live lists in position order.
 */
export function buildListExport(
  listIds: readonly Id[],
  source: CompositionSource,
): ListExport {
  const lists: ListExport['lists'] = [];
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
      entries: rows.map((row) =>
        'childListId' in row
          ? { include: row.childListId }
          : { title: row.title, quantity: row.quantity, note: row.note },
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
  return {
    lists: file.lists.map((list) => {
      const included = new Set<Id>();
      const entries: MutationArgs<'list.import'>['lists'][number]['entries'] =
        [];
      for (const entry of list.entries) {
        if (!('include' in entry)) {
          entries.push({ id: makeId(), ...entry });
          continue;
        }
        const listId = ids.get(entry.include);
        if (listId === undefined || included.has(listId)) continue;
        included.add(listId);
        entries.push({ id: makeId(), listId });
      }
      return {
        id: ids.get(list.id) as Id,
        title: list.title,
        description: list.description,
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
