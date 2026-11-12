import { v7 as uuidv7, validate, version } from 'uuid';
import type { Id } from './entities';

/** A new UUIDv7: time-ordered, so new rows sort after older ones and index well. */
export function newId(): Id {
  return uuidv7();
}

/** A lower-case UUIDv7. Upper case is refused: SQLite and IndexedDB keys are case-sensitive. */
export function isId(value: unknown): value is Id {
  return (
    typeof value === 'string' &&
    value === value.toLowerCase() &&
    validate(value) &&
    version(value) === 7
  );
}
