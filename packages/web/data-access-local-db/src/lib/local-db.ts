import { InjectionToken } from '@angular/core';
import { Dexie, type EntityTable, type Table } from 'dexie';
import type { Item, List, Space } from '@lister/shared/domain';
import type { MutationInput } from '@lister/shared/sync-protocol';

/** A mutation waiting to be pushed, in the order it was made (`seq`). */
export interface OutboxEntry {
  seq?: number;
  mutation: MutationInput;
  createdAt: number;
}

/** How far this device has synced each space. */
export interface SyncState {
  spaceId: string;
  /** The last space version whose rows are in the local database. */
  version: number;
  lastSyncedAt: number | null;
}

/** Small per-device values, e.g. the client id. */
export interface MetaEntry {
  key: string;
  value: string;
}

/**
 * The local database (IndexedDB via Dexie): server rows plus the outbox (design §2.5).
 *
 * Every server schema change (a Drizzle migration) comes with a new `this.version(n)` here, in
 * the same change (CLAUDE.md). Version 1 matches server migrations 0000–0001 (spaces, lists,
 * items). Tombstones are stored like other rows; queries leave them out (`deletedAt` can't be
 * indexed while it's null).
 */
export class LocalDb extends Dexie {
  spaces!: EntityTable<Space, 'id'>;
  lists!: EntityTable<List, 'id'>;
  items!: EntityTable<Item, 'id'>;
  outbox!: EntityTable<OutboxEntry, 'seq'>;
  syncState!: Table<SyncState, string>;
  meta!: Table<MetaEntry, string>;

  constructor(name = 'lister') {
    super(name);
    this.version(1).stores({
      spaces: 'id',
      lists: 'id, spaceId',
      items: 'id, listId, spaceId',
      outbox: '++seq',
      syncState: 'spaceId',
      meta: 'key',
    });
  }
}

/** The app's local database. Tests provide their own (`new LocalDb(uniqueName)`). */
export const LOCAL_DB = new InjectionToken<LocalDb>('LOCAL_DB', {
  providedIn: 'root',
  factory: () => new LocalDb(),
});
