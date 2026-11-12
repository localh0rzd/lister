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
    .refine((value) => Object.keys(value).length > 0, 'Nothing to change');

const byId = z.strictObject({ id: idSchema });

/**
 * Mutations set values; they never toggle or increment, so a retry is harmless (design §4.2).
 * Creates carry the client's id. Lists are shown by title, so they have no `move`.
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
  mutationOf('item.create'),
  mutationOf('item.update'),
  mutationOf('item.move'),
  mutationOf('item.delete'),
  mutationOf('item.restore'),
]);

/** A mutation as sent (defaults may be missing). */
export type MutationInput = z.input<typeof mutationSchema>;
/** A validated mutation (defaults filled in, text trimmed). */
export type Mutation = z.output<typeof mutationSchema>;
export type MutationArgs<N extends MutationName> = z.output<
  (typeof mutationArgs)[N]
>;
