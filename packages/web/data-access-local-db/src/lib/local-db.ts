import { InjectionToken } from '@angular/core';
import { Dexie, type EntityTable, type Table } from 'dexie';
import type {
  Include,
  IncludeException,
  Item,
  List,
  Run,
  RunItem,
  Space,
} from '@lister/shared/domain';
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
  /** The space's timeline the rows belong to; another one on the server means a snapshot. */
  timeline: string;
  lastSyncedAt: number | null;
}

/**
 * A change the server refused (every tab reads these). Once the UI has shown it, it is marked
 * `seen` and stays in the error log, so it can be inspected later.
 */
export interface Rejection {
  mutationId: string;
  reason: string;
  /** Which change it was, e.g. "Add item “Stove” to “Camping”" (older entries don't have it). */
  description?: string;
  at: number;
  seen?: boolean;
}

/** The `meta` key of the leader tab's connection state (`SyncStatus`). */
export const SYNC_STATUS_KEY = 'status';

/** The leader tab's connection state, shared with the other tabs (`meta` key `status`). */
export interface SyncStatus {
  online: boolean;
  syncing: boolean;
  updateRequired: boolean;
  /** The server refused the connection: the session is gone (older rows don't have this). */
  signInRequired?: boolean;
}

/** Small per-device values, e.g. the client id. */
export interface MetaEntry {
  key: string;
  value: string;
}

/**
 * The local database (IndexedDB via Dexie), design §2.5 and §4.2:
 *
 * - `serverLists` / `serverItems` / `serverIncludes` / `serverIncludeExceptions` / `serverRuns` /
 *   `serverRunItems`: rows exactly as the server last sent them.
 * - `lists` / `items` / `includes` / `includeExceptions` / `runs` / `runItems`: what the UI shows,
 *   i.e. the server rows with the pending outbox mutations re-applied on top. The sync engine
 *   rebuilds affected rows from the server copy whenever server rows arrive or a mutation is
 *   rejected (rebase and rollback).
 * - `outbox`: pending mutations in order; `syncState`: synced version per space; `meta`.
 *
 * Every server schema change (a Drizzle migration) comes with a new `this.version(n)` here, in
 * the same change (CLAUDE.md). Version 1 matches server migrations 0000–0001; version 2 adds the
 * client-only `rejections` table; version 3 indexes spaces by name; version 4 matches migration
 * 0002 (includes), version 5 migration 0003 (runs) and version 6 migration 0004
 * (`mergedInto`), version 9 migration 0013 (include exceptions); each forces a snapshot.
 * Tombstones are stored like other rows; queries leave them out (`deletedAt` can't be indexed
 * while it's null).
 */
export class LocalDb extends Dexie {
  spaces!: EntityTable<LocalSpace, 'id'>;
  lists!: EntityTable<List, 'id'>;
  items!: EntityTable<Item, 'id'>;
  includes!: EntityTable<Include, 'id'>;
  serverLists!: EntityTable<List, 'id'>;
  serverItems!: EntityTable<Item, 'id'>;
  serverIncludes!: EntityTable<Include, 'id'>;
  includeExceptions!: EntityTable<IncludeException, 'id'>;
  serverIncludeExceptions!: EntityTable<IncludeException, 'id'>;
  runs!: EntityTable<Run, 'id'>;
  runItems!: EntityTable<RunItem, 'id'>;
  serverRuns!: EntityTable<Run, 'id'>;
  serverRunItems!: EntityTable<RunItem, 'id'>;
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
    // Spaces by name (CurrentSpace).
    this.version(3).stores({ spaces: 'id, name' });
    // Server migration 0002: includes. A new synced table: the next pull must be a snapshot,
    // since an older app dropped includes from the pokes it got (design §2.5).
    this.version(4)
      .stores({
        includes: 'id, spaceId, parentListId, childListId',
        serverIncludes: 'id, spaceId, parentListId, childListId',
      })
      .upgrade((tx) => tx.table('syncState').clear());
    // Server migration 0003: runs. A new synced table again: snapshot on the next pull.
    this.version(5)
      .stores({
        runs: 'id, spaceId',
        runItems: 'id, spaceId, runId',
        serverRuns: 'id, spaceId',
        serverRunItems: 'id, spaceId, runId',
      })
      .upgrade((tx) => tx.table('syncState').clear());
    // Server migration 0004: run items' `mergedInto` (a new synced field: snapshot).
    this.version(6)
      .stores({})
      .upgrade((tx) => tx.table('syncState').clear());
    // Server migration 0009: the space's timeline, stored in `syncState` and sent with every
    // pull. Entries without one are dropped: the next pull is a snapshot.
    this.version(7)
      .stores({})
      .upgrade((tx) => tx.table('syncState').clear());
    // Server migration 0011: lists' `colour` and `icon` (new synced fields: snapshot).
    this.version(8)
      .stores({})
      .upgrade((tx) => tx.table('syncState').clear());
    // Server migration 0013: include exceptions, "leaving out" (D28). A new synced table:
    // snapshot on the next pull, since an older app dropped them from the pokes it got.
    this.version(9)
      .stores({
        includeExceptions: 'id, spaceId, includeId',
        serverIncludeExceptions: 'id, spaceId, includeId',
      })
      .upgrade((tx) => tx.table('syncState').clear());
  }

  /** Empties every table: everything this device holds of the signed-in user, pending changes included. */
  async clearAll(): Promise<void> {
    await this.transaction('rw', this.tables, () =>
      Promise.all(this.tables.map((table) => table.clear())),
    );
  }
}

/** The app's local database. Tests provide their own (`new LocalDb(uniqueName)`). */
export const LOCAL_DB = new InjectionToken<LocalDb>('LOCAL_DB', {
  providedIn: 'root',
  factory: () => new LocalDb(),
});
