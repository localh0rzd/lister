/** A UUIDv7 string, generated on the client so rows can be created offline (`newId()`). */
export type Id = string;

/** Milliseconds since the Unix epoch (UTC). */
export type Timestamp = number;

/**
 * Columns every synced row carries (design §3). `version` is the space's version counter at the
 * row's last change; deleted rows stay as tombstones with `deletedAt` set.
 */
export interface SyncMetadata {
  readonly id: Id;
  readonly spaceId: Id;
  readonly version: number;
  readonly deletedAt: Timestamp | null;
  readonly createdBy: Id;
  readonly updatedBy: Id;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}

/** A space owns lists and runs; all its members can edit them (D14). */
export interface Space {
  readonly id: Id;
  readonly name: string;
  /** The space's current version: the version of its latest change. */
  readonly version: number;
}

/** A reusable list. It has no check state; runs do (D1). */
export interface List extends SyncMetadata {
  readonly title: string;
  readonly description: string;
}

/** An item belongs to exactly one list. */
export interface Item extends SyncMetadata {
  readonly listId: Id;
  readonly title: string;
  /** Free text such as "2 pairs" or "500 g"; empty means 1 (D6). */
  readonly quantity: string;
  readonly note: string;
  /** Fractional-index key; see `comparePositions`. */
  readonly position: string;
}
