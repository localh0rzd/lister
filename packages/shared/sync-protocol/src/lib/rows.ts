import { z } from 'zod';
import { type Item, LIMITS, type List } from '@lister/shared/domain';
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

/** Changed rows per table. */
export const rowSetSchema = z.object({
  lists: z.array(listRowSchema),
  items: z.array(itemRowSchema),
});
export type RowSet = z.infer<typeof rowSetSchema>;
