import { v7 as uuidv7, validate, version } from 'uuid';
import type { Id } from './entities';

/** A new UUIDv7: time-ordered, so new rows sort after older ones and index well. */
export function newId(): Id {
  return uuidv7();
}

export function isId(value: unknown): value is Id {
  return typeof value === 'string' && validate(value) && version(value) === 7;
}
