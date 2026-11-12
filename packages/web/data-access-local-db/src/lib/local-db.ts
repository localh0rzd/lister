import { InjectionToken } from '@angular/core';
import { Dexie, type EntityTable, type Table } from 'dexie';
import type { Item, List, Space } from '@lister/shared/domain';
import type { MutationInput } from '@lister/shared/sync-protocol';

/** A mutation waiting to be pushed, in the order it was made (`seq`). */
export interface OutboxEntry {
  seq?: number;
  mutationId: string;
  spaceId: string;
  mutation: MutationInput;
  createdAt: number;
  /**
   * Set when the server acked it. The entry leaves the outbox once this device has the space's
   * rows up to this version (design §4.2).
   */
  ackedVersion?: number;
}

/** A member of a space, as `welcome` sends it. */
export interface LocalMember {
  userId: string;
  displayName: string;
}

/** A space with its members (`version` is the server's version as of the last welcome). */
export interface LocalSpace extends Space {
  members: LocalMember[];
}

/**
 * How far this device has synced a space: it holds the space's server rows up to `version`.
 * Not the same as `LocalSpace.version`, which is what the server had at the last welcome.
 */
export interface SyncState {
  spaceId: string;
  version: number;
  lastSyncedAt: number | null;
}

/** A change the server refused, kept until the UI has shown it (every tab reads these). */
export interface Rejection {
  mutationId: string;
  reason: string;
  at: number;
}

/** The leader tab's connection state, shared with the other tabs (`meta` key `status`). */
export interface SyncStatus {
  online: boolean;
  syncing: boolean;
  updateRequired: boolean;
}

/** Small per-device values, e.g. the client id. */
export interface MetaEntry {
  key: string;
  value: string;
}

/**
 * The local database (IndexedDB via Dexie), design §2.5 and §4.2:
 *
 * - `serverLists` / `serverItems`: rows exactly as the server last sent them.
 * - `lists` / `items`: what the UI shows, i.e. the server rows with the pending outbox mutations
 *   re-applied on top. The sync engine rebuilds affected rows from the server copy whenever
 *   server rows arrive or a mutation is rejected (rebase and rollback).
 * - `outbox`: pending mutations in order; `syncState`: synced version per space; `meta`.
 *
 * Every server schema change (a Drizzle migration) comes with a new `this.version(n)` here, in
 * the same change (CLAUDE.md). Version 1 matches server migrations 0000–0001; version 2 adds the
 * client-only `rejections` table. Tombstones are
 * stored like other rows; queries leave them out (`deletedAt` can't be indexed while it's null).
 */
export class LocalDb extends Dexie {
  spaces!: EntityTable<LocalSpace, 'id'>;
  lists!: EntityTable<List, 'id'>;
  items!: EntityTable<Item, 'id'>;
  serverLists!: EntityTable<List, 'id'>;
  serverItems!: EntityTable<Item, 'id'>;
  outbox!: EntityTable<OutboxEntry, 'seq'>;
  syncState!: Table<SyncState, string>;
  meta!: Table<MetaEntry, string>;
  rejections!: Table<Rejection, string>;

  constructor(name = 'lister') {
    super(name);
    this.version(1).stores({
      spaces: 'id',
      lists: 'id, spaceId',
      items: 'id, listId, spaceId',
      serverLists: 'id, spaceId',
      serverItems: 'id, listId, spaceId',
      outbox: '++seq, &mutationId, spaceId',
      syncState: 'spaceId',
      meta: 'key',
    });
    // Client-only: rejections that every tab can show (no server migration).
    this.version(2).stores({ rejections: 'mutationId, at' });
  }
}

/** The app's local database. Tests provide their own (`new LocalDb(uniqueName)`). */
export const LOCAL_DB = new InjectionToken<LocalDb>('LOCAL_DB', {
  providedIn: 'root',
  factory: () => new LocalDb(),
});
