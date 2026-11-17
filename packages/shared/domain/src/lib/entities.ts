import type { ListColour, ListIconName } from './list-appearance';

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
  /** Optional colour and icon (D26); `null` when not set. */
  readonly colour: ListColour | null;
  readonly icon: ListIconName | null;
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

/**
 * "List `parentListId` contains list `childListId`" (D2): a live reference, ordered among the
 * parent's items (they share one position key space). The include graph never has a cycle.
 */
export interface Include extends SyncMetadata {
  readonly parentListId: Id;
  readonly childListId: Id;
  /** Fractional-index key, in the same key space as the parent's items. */
  readonly position: string;
}

/**
 * A run: one use of a list, or an ad-hoc checklist (D1, D10). It owns copies of its items, so
 * editing a list never changes it. `finishedAt` is set while every item is checked or skipped
 * (and there is at least one); a finished run is only in the trash (D10, D20).
 */
export interface Run extends SyncMetadata {
  readonly title: string;
  /** The list it was started from; `null` for an ad-hoc run. */
  readonly sourceListId: Id | null;
  readonly finishedAt: Timestamp | null;
}

export type RunItemState = 'unchecked' | 'checked' | 'skipped';

/** An item of a run: a copy, merged with identical items (D16). */
export interface RunItem extends SyncMetadata {
  readonly runId: Id;
  readonly title: string;
  /** Free text; empty means 1 (D6). */
  readonly quantity: string;
  readonly note: string;
  /** Fractional-index key within the run. */
  readonly position: string;
  /** The lists it came from, in order; the first decides its section. Empty when typed in. */
  readonly sources: Id[];
  readonly state: RunItemState;
  /** Who last set `state`, and when (`null` while never set). */
  readonly stateBy: Id | null;
  readonly stateAt: Timestamp | null;
  /**
   * Set on a removed row whose id entered the run but merged into this other item (D16): an
   * alias, so changes to it (e.g. a check made offline) apply to the item it became part of.
   */
  readonly mergedInto: Id | null;
}
