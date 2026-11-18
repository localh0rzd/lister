import * as z from 'zod/mini';
import {
  type Include,
  type IncludeException,
  type Item,
  LIMITS,
  type List,
  type Run,
  type RunItem,
} from '@lister/shared/domain';
import {
  colourSchema,
  descriptionSchema,
  iconSchema,
  idSchema,
  noteSchema,
  positionSchema,
  quantitySchema,
  timestampSchema,
  versionSchema,
} from './common';

const syncMetadata = {
  id: idSchema,
  spaceId: idSchema,
  version: versionSchema,
  deletedAt: z.nullable(timestampSchema),
  createdBy: idSchema,
  updatedBy: idSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
};

/**
 * Rows as the server sends them; tombstones included. Server → client schemas are tolerant
 * (`z.object` drops unknown fields), so an older cached client keeps working when the server
 * adds fields or tables: protocol changes are additive (design §2.5).
 */
export const listRowSchema = z.object({
  ...syncMetadata,
  title: z.string().check(z.maxLength(LIMITS.title)),
  description: descriptionSchema,
  // A colour or icon a newer app added reads as none here, instead of failing the whole message
  // (D26): growing the sets is an additive change too.
  colour: z._default(z.catch(z.nullable(colourSchema), null), null),
  icon: z._default(z.catch(z.nullable(iconSchema), null), null),
}) satisfies z.ZodMiniType<List>;

export const itemRowSchema = z.object({
  ...syncMetadata,
  listId: idSchema,
  title: z.string().check(z.maxLength(LIMITS.title)),
  quantity: quantitySchema,
  note: noteSchema,
  position: positionSchema,
}) satisfies z.ZodMiniType<Item>;

export const includeRowSchema = z.object({
  ...syncMetadata,
  parentListId: idSchema,
  childListId: idSchema,
  position: positionSchema,
}) satisfies z.ZodMiniType<Include>;

export const includeExceptionRowSchema = z.object({
  ...syncMetadata,
  includeId: idSchema,
  targetKind: z.enum(['item', 'list']),
  targetId: idSchema,
}) satisfies z.ZodMiniType<IncludeException>;

export const runRowSchema = z.object({
  ...syncMetadata,
  title: z.string().check(z.maxLength(LIMITS.title)),
  sourceListId: z.nullable(idSchema),
  finishedAt: z.nullable(timestampSchema),
}) satisfies z.ZodMiniType<Run>;

export const runItemStateSchema = z.enum(['unchecked', 'checked', 'skipped']);

export const runItemRowSchema = z.object({
  ...syncMetadata,
  runId: idSchema,
  title: z.string().check(z.maxLength(LIMITS.title)),
  quantity: quantitySchema,
  note: noteSchema,
  position: positionSchema,
  sources: z.array(idSchema),
  state: runItemStateSchema,
  stateBy: z.nullable(idSchema),
  stateAt: z.nullable(timestampSchema),
  mergedInto: z._default(z.nullable(idSchema), null),
}) satisfies z.ZodMiniType<RunItem>;

/** Changed rows per table. A table the server doesn't send yet is empty. */
export const rowSetSchema = z.object({
  lists: z.array(listRowSchema),
  items: z.array(itemRowSchema),
  includes: z._default(z.array(includeRowSchema), []),
  includeExceptions: z._default(z.array(includeExceptionRowSchema), []),
  runs: z._default(z.array(runRowSchema), []),
  runItems: z._default(z.array(runItemRowSchema), []),
});
export type RowSet = z.infer<typeof rowSetSchema>;
