import { z } from 'zod';
import {
  descriptionSchema,
  idSchema,
  noteSchema,
  positionSchema,
  quantitySchema,
  titleSchema,
} from './common';

/** A patch must change at least one field. */
const patch = <T extends z.ZodRawShape>(shape: T) =>
  z
    .strictObject(shape)
    .partial()
    .refine(
      // `undefined` values vanish in JSON, so they don't count as a change.
      (value) => Object.values(value).some((v) => v !== undefined),
      'Nothing to change',
    );

const byId = z.strictObject({ id: idSchema });

/** A row to copy: the source row's id and the copy's new id (from the client). */
const copyOf = z.strictObject({ from: idSchema, id: idSchema });

/** How many rows one duplicate may copy (a packing list has dozens, not thousands). */
export const MAX_DUPLICATE_ROWS = 2000;

/** An item entering a run (start, a whole list, typed in); the client picks its id. */
const newRunItem = z.strictObject({
  id: idSchema,
  title: titleSchema,
  quantity: quantitySchema.default(''),
  note: noteSchema.default(''),
  /** The list it came from (flattened: the list that owns it); empty when typed in. */
  sources: z.array(idSchema).max(50).default([]),
});

/** How many items may enter a run in one change. */
export const MAX_RUN_ITEMS = 2000;

/**
 * Mutations set values; they never toggle or increment, so a retry is harmless (design §4.2).
 * Creates carry the client's id. Lists are shown by title, so they have no `move`. Includes
 * share their parent's position key space with its items.
 */
export const mutationArgs = {
  'list.create': z.strictObject({
    id: idSchema,
    title: titleSchema,
    description: descriptionSchema.default(''),
  }),
  'list.update': z.strictObject({
    id: idSchema,
    patch: patch({ title: titleSchema, description: descriptionSchema }),
  }),
  'list.delete': byId,
  'list.restore': byId,
  /**
   * One step, so the copy appears complete everywhere and never half-made: a new list `id`
   * titled `title`, with the source's description, a copy of each listed item (same fields and
   * position) and each listed include (same child, same position).
   */
  'list.duplicate': z.strictObject({
    id: idSchema,
    sourceListId: idSchema,
    title: titleSchema,
    items: z.array(copyOf).max(MAX_DUPLICATE_ROWS),
    includes: z.array(copyOf).max(MAX_DUPLICATE_ROWS),
  }),
  'item.create': z.strictObject({
    id: idSchema,
    listId: idSchema,
    title: titleSchema,
    quantity: quantitySchema.default(''),
    note: noteSchema.default(''),
    position: positionSchema,
  }),
  'item.update': z.strictObject({
    id: idSchema,
    patch: patch({
      title: titleSchema,
      quantity: quantitySchema,
      note: noteSchema,
    }),
  }),
  'item.move': z.strictObject({ id: idSchema, position: positionSchema }),
  'item.delete': byId,
  'item.restore': byId,
  /**
   * Starts a run: from a list (the client flattens it and sends its items, so this works
   * offline) or empty (ad-hoc). Identical items are merged as they enter (D16).
   */
  'run.start': z.strictObject({
    id: idSchema,
    title: titleSchema,
    sourceListId: idSchema.nullable().default(null),
    items: z.array(newRunItem).max(MAX_RUN_ITEMS).default([]),
  }),
  'run.update': z.strictObject({
    id: idSchema,
    patch: patch({ title: titleSchema }),
  }),
  /** Items typed in or a whole list (as a new section), merged as they enter (D16). */
  'run.addItems': z.strictObject({
    runId: idSchema,
    items: z.array(newRunItem).min(1).max(MAX_RUN_ITEMS),
  }),
  /**
   * "Save as list" (D13), in one step like `list.duplicate`: a new list `listId` titled `title`
   * with a copy (title, quantity, note) of each listed run item, in the order given — the run's
   * order as shown. Items removed or merged away since the client looked are skipped. The run
   * itself is unchanged.
   */
  'run.saveAsList': z.strictObject({
    runId: idSchema,
    listId: idSchema,
    title: titleSchema,
    items: z.array(copyOf).max(MAX_DUPLICATE_ROWS),
  }),
  'runItem.update': z.strictObject({
    id: idSchema,
    patch: patch({
      title: titleSchema,
      quantity: quantitySchema,
      note: noteSchema,
    }),
  }),
  'runItem.move': z.strictObject({ id: idSchema, position: positionSchema }),
  'runItem.remove': byId,
  'runItem.restore': byId,
  /** Sets (never toggles) an item's state. */
  'runItem.setState': z.strictObject({
    id: idSchema,
    state: z.enum(['unchecked', 'checked', 'skipped']),
  }),
  'include.create': z.strictObject({
    id: idSchema,
    parentListId: idSchema,
    childListId: idSchema,
    position: positionSchema,
  }),
  'include.move': z.strictObject({ id: idSchema, position: positionSchema }),
  'include.delete': byId,
  'include.restore': byId,
} as const;

export type MutationName = keyof typeof mutationArgs;
export const MUTATION_NAMES = Object.keys(mutationArgs) as MutationName[];

const mutationOf = <N extends MutationName>(name: N) =>
  z.strictObject({
    mutationId: idSchema,
    spaceId: idSchema,
    name: z.literal(name),
    args: mutationArgs[name],
  });

export const mutationSchema = z.discriminatedUnion('name', [
  mutationOf('list.create'),
  mutationOf('list.update'),
  mutationOf('list.delete'),
  mutationOf('list.restore'),
  mutationOf('list.duplicate'),
  mutationOf('item.create'),
  mutationOf('item.update'),
  mutationOf('item.move'),
  mutationOf('item.delete'),
  mutationOf('item.restore'),
  mutationOf('run.start'),
  mutationOf('run.update'),
  mutationOf('run.addItems'),
  mutationOf('run.saveAsList'),
  mutationOf('runItem.update'),
  mutationOf('runItem.move'),
  mutationOf('runItem.remove'),
  mutationOf('runItem.restore'),
  mutationOf('runItem.setState'),
  mutationOf('include.create'),
  mutationOf('include.move'),
  mutationOf('include.delete'),
  mutationOf('include.restore'),
]);

/** A mutation as sent (defaults may be missing). */
export type MutationInput = z.input<typeof mutationSchema>;
/** A validated mutation (defaults filled in, text trimmed). */
export type Mutation = z.output<typeof mutationSchema>;
export type MutationArgs<N extends MutationName> = z.output<
  (typeof mutationArgs)[N]
>;

export type ParsedMutation =
  | { ok: true; mutation: Mutation }
  | { ok: false; mutationId: string; reason: string };

/** Validates one pushed entry; a failure carries a readable reason for the `reject` message. */
export function parseMutation(entry: { mutationId: string }): ParsedMutation {
  const result = mutationSchema.safeParse(entry);
  if (result.success) return { ok: true, mutation: result.data };
  const issue = result.error.issues[0];
  const where = issue?.path.length ? ` (${issue.path.join('.')})` : '';
  return {
    ok: false,
    mutationId: entry.mutationId,
    reason: `${issue?.message ?? 'Invalid change'}${where}`,
  };
}
