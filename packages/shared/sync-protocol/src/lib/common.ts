import { z } from 'zod';
import { LIMITS, isPositionKey } from '@lister/shared/domain';

/** Version of the socket protocol; the server answers older clients with `updateRequired`. */
export const PROTOCOL_VERSION = 1;

/** Lower case only: SQLite and IndexedDB keys are case-sensitive. */
export const idSchema = z.uuidv7().regex(/^[0-9a-f-]+$/, 'Ids are lower case');
export const versionSchema = z.int().nonnegative();
export const timestampSchema = z.int().nonnegative();

/** Trimmed text of at most `max` characters, without control characters. */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `At most ${max} characters`)
    .regex(/^[^\p{Cc}]*$/u, 'Remove the control characters');

/** One line with at least one visible character. */
export const titleSchema = text(LIMITS.title).regex(
  /[\p{L}\p{N}\p{P}\p{S}]/u,
  'A title is required',
);
export const descriptionSchema = text(LIMITS.description);
export const quantitySchema = text(LIMITS.quantity);
export const noteSchema = text(LIMITS.note);
export const positionSchema = z
  .string()
  .refine(isPositionKey, 'Not a position key');
