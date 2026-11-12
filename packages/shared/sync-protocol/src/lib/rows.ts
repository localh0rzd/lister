import { z } from 'zod';
import type { Item, List } from '@lister/shared/domain';
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

/** Rows as the server sends them; tombstones included. */
export const listRowSchema = z.strictObject({
  ...syncMetadata,
  title: z.string().max(200),
  description: descriptionSchema,
}) satisfies z.ZodType<List>;

export const itemRowSchema = z.strictObject({
  ...syncMetadata,
  listId: idSchema,
  title: z.string().max(200),
  quantity: quantitySchema,
  note: noteSchema,
  position: positionSchema,
}) satisfies z.ZodType<Item>;

/** Changed rows per table. */
export const rowSetSchema = z.strictObject({
  lists: z.array(listRowSchema),
  items: z.array(itemRowSchema),
});
export type RowSet = z.infer<typeof rowSetSchema>;
