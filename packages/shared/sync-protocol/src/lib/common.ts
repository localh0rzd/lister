import * as z from 'zod/mini';
import { en } from 'zod/locales';
import {
  LIMITS,
  LIST_COLOURS,
  LIST_ICON_NAMES,
  isPositionKey,
} from '@lister/shared/domain';

/**
 * `zod/mini` loads no messages, so every issue without its own would read "Invalid input".
 * Reject reasons are shown to users, so load the English ones (every schema module imports
 * this file).
 */
z.config(en());

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
/** A list's colour and icon from the fixed sets (D26); `null` clears them. */
export const colourSchema = z.enum(LIST_COLOURS);
export const iconSchema = z.enum(LIST_ICON_NAMES);
export const quantitySchema = text(LIMITS.quantity);
export const noteSchema = text(LIMITS.note);
export const positionSchema = z
  .string()
  .check(z.refine(isPositionKey, 'Not a position key'));
