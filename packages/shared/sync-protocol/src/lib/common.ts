import { z } from 'zod';
import { LIMITS } from '@lister/shared/domain';

/** Version of the socket protocol; the server answers older clients with `updateRequired`. */
export const PROTOCOL_VERSION = 1;

export const idSchema = z.uuidv7();
export const versionSchema = z.int().nonnegative();
export const timestampSchema = z.int().nonnegative();

/** Trimmed text of at most `max` characters. */
const text = (max: number) => z.string().trim().max(max);

export const titleSchema = text(LIMITS.title).min(1, 'A title is required');
export const descriptionSchema = text(LIMITS.description);
export const quantitySchema = text(LIMITS.quantity);
export const noteSchema = text(LIMITS.note);
export const positionSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[0-9A-Za-z]+$/, 'Not a position key');
