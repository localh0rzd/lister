import { z } from 'zod';
import {
  type Include,
  type Item,
  LIMITS,
  type List,
  type Run,
  type RunItem,
} from '@lister/shared/domain';
import {
  descriptionSchema,
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
  deletedAt: timestampSchema.nullable(),
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
  title: z.string().max(LIMITS.title),
  description: descriptionSchema,
}) satisfies z.ZodType<List>;

export const itemRowSchema = z.object({
  ...syncMetadata,
  listId: idSchema,
  title: z.string().max(LIMITS.title),
  quantity: quantitySchema,
  note: noteSchema,
  position: positionSchema,
}) satisfies z.ZodType<Item>;

export const includeRowSchema = z.object({
  ...syncMetadata,
  parentListId: idSchema,
  childListId: idSchema,
  position: positionSchema,
}) satisfies z.ZodType<Include>;

export const runRowSchema = z.object({
  ...syncMetadata,
  title: z.string().max(LIMITS.title),
  sourceListId: idSchema.nullable(),
  finishedAt: timestampSchema.nullable(),
}) satisfies z.ZodType<Run>;

export const runItemStateSchema = z.enum(['unchecked', 'checked', 'skipped']);

export const runItemRowSchema = z.object({
  ...syncMetadata,
  runId: idSchema,
  title: z.string().max(LIMITS.title),
  quantity: quantitySchema,
  note: noteSchema,
  position: positionSchema,
  sources: z.array(idSchema),
  state: runItemStateSchema,
  stateBy: idSchema.nullable(),
  stateAt: timestampSchema.nullable(),
}) satisfies z.ZodType<RunItem>;

/** Changed rows per table. A table the server doesn't send yet is empty. */
export const rowSetSchema = z.object({
  lists: z.array(listRowSchema),
  items: z.array(itemRowSchema),
  includes: z.array(includeRowSchema).default([]),
  runs: z.array(runRowSchema).default([]),
  runItems: z.array(runItemRowSchema).default([]),
});
export type RowSet = z.infer<typeof rowSetSchema>;
