import * as z from 'zod/mini';
import { LIMITS, isPositionKey } from '@lister/shared/domain';

/** Version of the socket protocol; the server answers older clients with `updateRequired`. */
export const PROTOCOL_VERSION = 2;

/** Lower case only: SQLite and IndexedDB keys are case-sensitive. */
export const idSchema = z
  .uuidv7()
  .check(z.regex(/^[0-9a-f-]+$/, 'Ids are lower case'));
export const versionSchema = z.int().check(z.nonnegative());
export const timestampSchema = z.int().check(z.nonnegative());

/** Trimmed text of at most `max` characters, without control characters. */
const text = (max: number) =>
  z
    .string()
    .check(
      z.trim(),
      z.maxLength(max, `At most ${max} characters`),
      z.regex(/^[^\p{Cc}]*$/u, 'Remove the control characters'),
    );

/** One line with at least one visible character. */
export const titleSchema = text(LIMITS.title).check(
  z.regex(/[\p{L}\p{N}\p{P}\p{S}]/u, 'A title is required'),
);
export const descriptionSchema = text(LIMITS.description);
export const quantitySchema = text(LIMITS.quantity);
export const noteSchema = text(LIMITS.note);
export const positionSchema = z
  .string()
  .check(z.refine(isPositionKey, 'Not a position key'));
