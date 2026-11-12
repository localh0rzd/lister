import {
  DOCUMENT,
  DestroyRef,
  ErrorHandler,
  Service,
  type Signal,
  computed,
  inject,
} from '@angular/core';
import { liveQuery } from 'dexie';
import { newId } from '@lister/shared/domain';
import {
  type Ack,
  type ClientToServerEvents,
  MAX_PUSH_MUTATIONS,
  MemoryRowStore,
  type MutationInput,
  PROTOCOL_VERSION,
  type Poke,
  type Reject,
  type RowSet,
  type Rows,
  type Welcome,
  ackSchema,
  applyMutation,
  mutationSchema,
  parseMutation,
  pokeSchema,
  rejectSchema,
  rowsSchema,
  welcomeSchema,
} from '@lister/shared/sync-protocol';
import {
  LOCAL_DB,
  type LocalDb,
  type Rejection,
  type SyncStatus,
  liveQuerySignal,
  valueOf,
} from '@lister/web/data-access-local-db';
import type { ZodType } from 'zod';
import {
  SYNC_CLOCK,
  SYNC_LOCKS,
  SYNC_SOCKET_FACTORY,
  type SyncSocket,
} from './tokens';

/** A change the server refused; the UI shows `reason` (T-029). */
export type SyncError = Rejection;

/** What `mutate` answers: queued (applied locally), or refused before queueing. */
export type MutateResult = { ok: true } | { ok: false; reason: string };

/** `Omit` over each member of a union, so the name/args pairing survives. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/** A filter that keeps the rows of one space (and drops missing ones). */
function inSpaceOf(spaceId: string) {
  return <T extends { spaceId: string }>(row: T | undefined): row is T =>
    row?.spaceId === spaceId;
}

/**
 * What to write for the rebuilt rows `ids` of a space: rows to put, and ids to remove because
 * they no longer have a row (e.g. a rejected create). Visible rows of other spaces stay.
 */
function changes<T extends { spaceId: string }>(
  spaceId: string,
  ids: readonly string[],
  rows: ReadonlyMap<string, T>,
  current: readonly (T | undefined)[],
): { put: T[]; gone: string[] } {
  const put: T[] = [];
  const gone: string[] = [];
  ids.forEach((id, i) => {
    const row = rows.get(id);
    if (row?.spaceId === spaceId) put.push(row);
    else if (current[i]?.spaceId === spaceId) gone.push(id);
  });
  return { put, gone };
}

/** Row ids a set of mutations reads or writes. */
interface Touched {
  lists: Set<string>;
  items: Set<string>;
  includes: Set<string>;
  runs: Set<string>;
  runItems: Set<string>;
}

const noneTouched = (): Touched => ({
  lists: new Set(),
  items: new Set(),
  includes: new Set(),
  runs: new Set(),
  runItems: new Set(),
});

/** The args fields `touchedBy` reads (every mutation has some of them). */
interface TouchingArgs {
  id?: string;
  listId?: string;
  parentListId?: string;
  childListId?: string;
  sourceListId?: string | null;
  runId?: string;
  items?: { id: string; from?: string }[];
  includes?: { id: string; from: string }[];
}

/**
 * The rows a set of mutations writes or reads by reference, per table. Rows a rule reads by
 * relation (all includes of the space, all items of a run) are loaded by `rebuild()` itself.
 */
function touchedBy(
  mutations: readonly { name: string; args: unknown }[],
  into: Touched = noneTouched(),
): Touched {
  for (const { name, args } of mutations) {
    const a = args as TouchingArgs;
    const family = name.slice(0, name.indexOf('.'));
    switch (family) {
      case 'list':
        if (a.id) into.lists.add(a.id);
        // list.duplicate: reads its source and writes copies of the listed rows.
        if (a.sourceListId) into.lists.add(a.sourceListId);
        for (const row of a.items ?? []) {
          into.items.add(row.id);
          if (row.from) into.items.add(row.from);
        }
        for (const row of a.includes ?? [])
          into.includes.add(row.id).add(row.from);
        break;
      case 'item':
        if (a.id) into.items.add(a.id);
        if (a.listId) into.lists.add(a.listId);
        break;
      case 'include':
        if (a.id) into.includes.add(a.id);
        if (a.parentListId) into.lists.add(a.parentListId);
        if (a.childListId) into.lists.add(a.childListId);
        break;
      case 'run':
        if (a.id) into.runs.add(a.id); // run.start, run.update
        if (a.runId) into.runs.add(a.runId); // run.addItems
        if (a.sourceListId) into.lists.add(a.sourceListId); // run.start checks it
        for (const row of a.items ?? []) into.runItems.add(row.id);
        break;
      case 'runItem':
        if (a.id) into.runItems.add(a.id);
        break;
      // A name the schema doesn't know never reaches the rules, so it touches nothing.
    }
  }
  return into;
}

/** A mutation as the UI asks for it: the engine adds the mutation id. */
export type MutationRequest = DistributiveOmit<MutationInput, 'mutationId'>;

const LOCK_NAME = 'lister-sync';
const STATUS_KEY = 'status';
const FIRST_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const OFFLINE: SyncStatus = {
  online: false,
  syncing: false,
  updateRequired: false,
};

/**
 * The client half of the sync protocol (design §4.2):
 *
 * - `mutate()` predicts the change with the shared rules, queues it in the outbox and rebuilds
 *   the space's visible rows, so the UI updates at once, also offline.
 * - One tab (the Web Locks leader) runs the socket: hello → pull per space → push the outbox in
 *   order. Pokes are applied in version order; a gap triggers one pull. An ack removes a
 *   mutation from the outbox once this device has the space's rows up to its version; a reject
 *   drops it, rolls back by rebuilding from the server copy, and is recorded in `rejections`.
 * - Rebase: whenever server rows arrive, the visible rows are rebuilt as server rows plus the
 *   pending mutations, so local changes stay on top until the server confirms them.
 *
 * Every tab shows the same status: the leader writes it to the local database (`meta.status`,
 * `syncState`, `rejections`) and all tabs read it from there. Other tabs only write the outbox,
 * which the leader watches. All database work runs one task at a time, in arrival order.
 */
@Service()
export class SyncEngine {
  private readonly db: LocalDb = inject(LOCAL_DB);
  private readonly createSocket = inject(SYNC_SOCKET_FACTORY);
  private readonly locks = inject(SYNC_LOCKS);
  private readonly now = inject(SYNC_CLOCK);
  private readonly errorHandler = inject(ErrorHandler);
  private readonly destroyRef = inject(DestroyRef);
  private readonly window = inject(DOCUMENT).defaultView;

  private readonly status = liveQuerySignal(() => async () => {
    const row = await this.db.meta.get(STATUS_KEY);
    return row ? (JSON.parse(row.value) as SyncStatus) : OFFLINE;
  });
  private readonly outboxCount = liveQuerySignal(
    () => () => this.db.outbox.count(),
  );
  private readonly latestSync = liveQuerySignal(() => async () => {
    const states = await this.db.syncState.toArray();
    const times = states.flatMap((s) =>
      s.lastSyncedAt === null ? [] : [s.lastSyncedAt],
    );
    return times.length > 0 ? Math.max(...times) : null;
  });
  private readonly rejections = liveQuerySignal(
    () => () => this.db.rejections.orderBy('at').toArray(),
  );
  private readonly currentStatus = computed(
    () => valueOf(this.status()) ?? OFFLINE,
  );

  /** The syncing tab is connected and welcomed by the server. */
  readonly online: Signal<boolean> = computed(
    () => this.currentStatus().online,
  );
  /** Changes are on their way to the server. */
  readonly syncing: Signal<boolean> = computed(
    () => this.currentStatus().syncing,
  );
  /** Changes made on this device that the server hasn't confirmed yet. */
  readonly pendingCount: Signal<number> = computed(
    () => valueOf(this.outboxCount()) ?? 0,
  );
  /** When this device last received rows from the server (also after a reload). */
  readonly lastSyncedAt: Signal<number | null> = computed(
    () => valueOf(this.latestSync()) ?? null,
  );
  /** Changes the server refused, oldest first, until dismissed. */
  readonly errors: Signal<readonly SyncError[]> = computed(
    () => valueOf(this.rejections()) ?? [],
  );
  /** The server speaks a newer protocol: the app must reload to update. */
  readonly updateRequired: Signal<boolean> = computed(
    () => this.currentStatus().updateRequired,
  );

  private socket?: SyncSocket;
  private started = false;
  /** Leader-only connection state; mirrored to `meta.status` for every tab. */
  private connection: SyncStatus = OFFLINE;
  /** Mutation ids pushed on the current connection and not yet answered. */
  private readonly inFlight = new Set<string>();
  /** Spaces with a pull on its way, so pokes in the meantime don't pull again. */
  private readonly pulling = new Set<string>();
  /** The current connection has had a mutation answered, so it works. */
  private healthy = false;
  private reconnectDelay = FIRST_RECONNECT_DELAY_MS;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private queue: Promise<unknown> = Promise.resolve();

  /** Starts syncing in this tab once it holds the sync lock (one tab at a time). */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.locks.request(
      LOCK_NAME,
      () =>
        new Promise<void>((release) => {
          this.lead();
          this.destroyRef.onDestroy(release);
        }),
    );
  }

  /** Resolves when all queued database work is done (for tests and orderly shutdown). */
  whenIdle(): Promise<void> {
    return this.queue.then(() => undefined);
  }

  /** Applies a change locally at once and queues it for the server. */
  mutate(request: MutationRequest): Promise<MutateResult> {
    const mutation = { ...request, mutationId: newId() } as MutationInput;
    const parsed = parseMutation(mutation);
    if (!parsed.ok)
      return Promise.resolve({ ok: false, reason: parsed.reason });

    return this.enqueue(async () => {
      const spaceId = parsed.mutation.spaceId;
      const rejection = await this.db.transaction(
        'rw',
        this.syncTables(),
        async () => {
          const store = new MemoryRowStore(
            await this.db.lists.where('spaceId').equals(spaceId).toArray(),
            await this.db.items.where('spaceId').equals(spaceId).toArray(),
            await this.db.includes.where('spaceId').equals(spaceId).toArray(),
            await this.db.runs.where('spaceId').equals(spaceId).toArray(),
            await this.db.runItems.where('spaceId').equals(spaceId).toArray(),
          );
          const context = await this.context(spaceId);
          const outcome = applyMutation(
            store,
            { ...context, now: this.now() },
            parsed.mutation,
          );
          if (outcome.kind === 'rejected') return outcome.reason;
          await this.db.outbox.add({
            mutationId: mutation.mutationId,
            spaceId,
            mutation,
            createdAt: this.now(),
          });
          await this.rebuild(spaceId, touchedBy([mutation]));
          return undefined;
        },
      );
      return rejection === undefined
        ? { ok: true }
        : { ok: false, reason: rejection };
    });
  }

  /** Forgets a reported rejection once the UI has shown it (in every tab). */
  async dismissError(mutationId: string): Promise<void> {
    await this.db.rejections.delete(mutationId);
  }

  // ── Leader: the connection ─────────────────────────────────────────────────

  private lead(): void {
    const socket = this.createSocket();
    this.socket = socket;
    this.setStatus(OFFLINE);

    socket.on('connect', () => {
      this.healthy = false;
      void this.enqueue(() => this.hello());
    });
    socket.on('disconnect', (reason) => this.onDisconnect(reason));
    this.listen('welcome', welcomeSchema, (m) => this.onWelcome(m));
    this.listen('rows', rowsSchema, (m) => this.onRows(m));
    this.listen('poke', pokeSchema, (m) => this.onPoke(m));
    this.listen('ack', ackSchema, (m) => this.onAck(m));
    this.listen('reject', rejectSchema, (m) => this.onReject(m));
    socket.on('updateRequired', () =>
      this.setStatus({ ...this.connection, updateRequired: true }),
    );

    // The browser knows about lost networks long before Socket.IO's ping timeout (up to 45 s).
    // Closing only the transport keeps Socket.IO's own reconnect loop running, so a false
    // `offline` (VPN adapters, flapping networks) heals by itself even if `online` never comes.
    const goOffline = () => socket.io.engine?.close();
    const goOnline = () => {
      if (socket.connected || this.connection.updateRequired) return;
      // While Socket.IO waits between reconnect attempts, connect() does nothing; restarting
      // the connection skips the remaining backoff now that the network is back.
      socket.disconnect();
      socket.connect();
    };
    this.window?.addEventListener('offline', goOffline);
    this.window?.addEventListener('online', goOnline);

    // Push whatever any tab adds to the outbox.
    const outbox = liveQuery(() => this.db.outbox.count()).subscribe(
      () => void this.enqueue(() => this.flush()),
    );
    this.destroyRef.onDestroy(() => {
      this.window?.removeEventListener('offline', goOffline);
      this.window?.removeEventListener('online', goOnline);
      outbox.unsubscribe();
      clearTimeout(this.reconnectTimer);
      socket.disconnect();
    });

    socket.connect();
  }

  /**
   * Handles a server message after checking it with its (tolerant) schema: unknown fields from a
   * newer server are dropped, and a malformed message is reported and ignored.
   */
  private listen<T>(
    event: 'welcome' | 'rows' | 'poke' | 'ack' | 'reject',
    schema: ZodType<T>,
    handle: (message: T) => Promise<void>,
  ): void {
    (
      this.socket?.on as (
        e: string,
        listener: (payload: unknown) => void,
      ) => void
    )(event, (payload) => {
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        this.errorHandler.handleError(
          new Error(
            `Ignored an invalid "${event}" message: ${parsed.error.message}`,
          ),
        );
        return;
      }
      void this.enqueue(() => handle(parsed.data));
    });
  }

  /** Emits only on a live connection: Socket.IO would otherwise buffer it to go out before hello. */
  private send<E extends keyof ClientToServerEvents>(
    event: E,
    ...args: Parameters<ClientToServerEvents[E]>
  ): boolean {
    if (!this.socket?.connected) return false;
    (
      this.socket.emit as (
        e: E,
        ...a: Parameters<ClientToServerEvents[E]>
      ) => void
    )(event, ...args);
    return true;
  }

  private onDisconnect(reason: string): void {
    this.inFlight.clear();
    this.pulling.clear();
    this.setStatus({ ...this.connection, online: false, syncing: false });
    // Socket.IO reconnects by itself unless the server closed the connection (design §4.2).
    if (reason === 'io server disconnect' && !this.connection.updateRequired) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(
        () => this.socket?.connect(),
        this.reconnectDelay,
      );
      // Only a connection that answered a mutation resets this, so a server that welcomes but
      // fails every push (e.g. a full disk) is retried less and less often.
      this.reconnectDelay = Math.min(
        this.reconnectDelay * 2,
        MAX_RECONNECT_DELAY_MS,
      );
    }
  }

  private async hello(): Promise<void> {
    let clientId = (await this.db.meta.get('clientId'))?.value;
    if (!clientId) {
      clientId = newId();
      await this.db.meta.put({ key: 'clientId', value: clientId });
    }
    this.send('hello', { protocolVersion: PROTOCOL_VERSION, clientId });
  }

  private async onWelcome(welcome: Welcome): Promise<void> {
    await this.db.transaction(
      'rw',
      [this.db.meta, this.db.spaces],
      async () => {
        await this.db.meta.put({ key: 'userId', value: welcome.userId });
        await this.db.spaces.bulkPut(welcome.spaces);
      },
    );
    for (const space of welcome.spaces) {
      await this.pull(space.id);
    }
    this.setStatus({ ...this.connection, online: true });
  }

  private async pull(spaceId: string): Promise<void> {
    const since = (await this.db.syncState.get(spaceId))?.version ?? 0;
    if (this.send('pull', { spaceId, since })) this.pulling.add(spaceId);
  }

  private async onRows(rows: Rows): Promise<void> {
    this.pulling.delete(rows.spaceId);
    await this.storeServerRows(
      rows.spaceId,
      rows.rows,
      rows.version,
      rows.snapshot,
    );
    await this.flush();
  }

  private async onPoke(poke: Poke): Promise<void> {
    const synced = (await this.db.syncState.get(poke.spaceId))?.version ?? 0;
    if (poke.version <= synced) return; // already have it
    if (poke.version === synced + 1) {
      await this.storeServerRows(poke.spaceId, poke.rows, poke.version, false);
    } else if (!this.pulling.has(poke.spaceId)) {
      // Missed something in between: catch up (once; the answer covers this poke too).
      await this.pull(poke.spaceId);
    }
  }

  private async onAck(ack: Ack): Promise<void> {
    this.inFlight.delete(ack.mutationId);
    this.markHealthy();
    await this.db.transaction('rw', this.syncTables(), async () => {
      const entry = await this.db.outbox
        .where('mutationId')
        .equals(ack.mutationId)
        .first();
      if (entry?.seq === undefined) return;
      const synced = (await this.db.syncState.get(entry.spaceId))?.version ?? 0;
      if (synced >= ack.version) {
        await this.db.outbox.delete(entry.seq);
        await this.rebuild(entry.spaceId, touchedBy([entry.mutation]));
      } else {
        // Its rows haven't arrived yet (a poke is missing); it leaves when they do.
        await this.db.outbox.update(entry.seq, { ackedVersion: ack.version });
      }
    });
    this.updateSyncing();
  }

  private async onReject(reject: Reject): Promise<void> {
    this.inFlight.delete(reject.mutationId);
    this.markHealthy();
    await this.db.transaction(
      'rw',
      [...this.syncTables(), this.db.rejections],
      async () => {
        const entry = await this.db.outbox
          .where('mutationId')
          .equals(reject.mutationId)
          .first();
        if (entry?.seq === undefined) return;
        await this.db.outbox.delete(entry.seq);
        // Rolls the change back.
        await this.rebuild(entry.spaceId, touchedBy([entry.mutation]));
        await this.db.rejections.put({
          mutationId: reject.mutationId,
          reason: reject.reason,
          at: this.now(),
        });
      },
    );
    this.updateSyncing();
  }

  /** Pushes outbox entries not yet sent on this connection, in order. */
  private async flush(): Promise<void> {
    if (!this.connection.online) return;
    const pending = (await this.db.outbox.orderBy('seq').toArray()).filter(
      (entry) =>
        entry.ackedVersion === undefined &&
        !this.inFlight.has(entry.mutationId),
    );
    const batch = pending.slice(0, MAX_PUSH_MUTATIONS);
    // The connection may have dropped while reading.
    if (batch.length > 0 && this.connection.online) {
      if (
        this.send('push', { mutations: batch.map((entry) => entry.mutation) })
      ) {
        for (const entry of batch) this.inFlight.add(entry.mutationId);
      }
    }
    this.updateSyncing();
  }

  private markHealthy(): void {
    if (this.healthy) return;
    this.healthy = true;
    this.reconnectDelay = FIRST_RECONNECT_DELAY_MS;
  }

  private updateSyncing(): void {
    const syncing = this.inFlight.size > 0;
    if (syncing !== this.connection.syncing)
      this.setStatus({ ...this.connection, syncing });
  }

  /** Records the leader's connection state for every tab. */
  private setStatus(status: SyncStatus): void {
    this.connection = status;
    const value = JSON.stringify(status);
    void this.enqueue(() => this.db.meta.put({ key: STATUS_KEY, value }));
  }

  // ── Local database ─────────────────────────────────────────────────────────

  private syncTables() {
    return [
      this.db.serverLists,
      this.db.serverItems,
      this.db.serverIncludes,
      this.db.serverRuns,
      this.db.serverRunItems,
      this.db.lists,
      this.db.items,
      this.db.includes,
      this.db.runs,
      this.db.runItems,
      this.db.outbox,
      this.db.syncState,
      this.db.meta,
    ];
  }

  /** Stores server rows, settles confirmed outbox entries and rebases the space. */
  private async storeServerRows(
    spaceId: string,
    rows: RowSet,
    version: number,
    snapshot: boolean,
  ): Promise<void> {
    const syncedAt = this.now();
    await this.db.transaction('rw', this.syncTables(), async () => {
      if (snapshot) {
        await this.db.serverLists.where('spaceId').equals(spaceId).delete();
        await this.db.serverItems.where('spaceId').equals(spaceId).delete();
        await this.db.serverIncludes.where('spaceId').equals(spaceId).delete();
        await this.db.serverRuns.where('spaceId').equals(spaceId).delete();
        await this.db.serverRunItems.where('spaceId').equals(spaceId).delete();
      }
      await this.db.serverLists.bulkPut(rows.lists);
      await this.db.serverItems.bulkPut(rows.items);
      await this.db.serverIncludes.bulkPut(rows.includes);
      await this.db.serverRuns.bulkPut(rows.runs);
      await this.db.serverRunItems.bulkPut(rows.runItems);
      await this.db.syncState.put({ spaceId, version, lastSyncedAt: syncedAt });

      const touched = noneTouched();
      for (const row of rows.lists) touched.lists.add(row.id);
      for (const row of rows.items) touched.items.add(row.id);
      for (const row of rows.includes) touched.includes.add(row.id);
      for (const row of rows.runs) touched.runs.add(row.id);
      for (const row of rows.runItems) touched.runItems.add(row.id);
      for (const entry of await this.db.outbox
        .where('spaceId')
        .equals(spaceId)
        .toArray()) {
        if (entry.ackedVersion === undefined || entry.seq === undefined)
          continue;
        if (entry.ackedVersion <= version) {
          await this.db.outbox.delete(entry.seq); // confirmed: its rows are here
          touchedBy([entry.mutation], touched);
        } else if (snapshot) {
          // The server is behind its own ack (restored database): send it again.
          await this.db.outbox.update(entry.seq, { ackedVersion: undefined });
        }
      }
      // A snapshot replaces everything; otherwise only the rows that changed are rebuilt.
      await this.rebuild(spaceId, snapshot ? undefined : touched);
    });
  }

  /**
   * Rebuilds visible rows: server rows with the pending mutations re-applied in order. With
   * `touched`, only those rows (plus every row a pending mutation touches) are recomputed, so a
   * poke or an ack costs as much as the change, not the whole space. Without it, the whole
   * space is rebuilt (after a snapshot). Runs inside a transaction that includes the sync tables.
   */
  private async rebuild(spaceId: string, touched?: Touched): Promise<void> {
    const pending = (
      await this.db.outbox.where('spaceId').equals(spaceId).sortBy('seq')
    ).flatMap((entry) => {
      const mutation = mutationSchema.safeParse(entry.mutation);
      // An entry the rules now refuse just has no effect here; the server will answer it.
      return mutation.success
        ? [{ mutation: mutation.data, at: entry.createdAt }]
        : [];
    });

    // The include rules read the whole include graph (loops, duplicates), so every include of
    // the space takes part in both paths; there are few of them.
    const serverIncludes = await this.db.serverIncludes
      .where('spaceId')
      .equals(spaceId)
      .toArray();
    let store: MemoryRowStore;
    let lists: Iterable<string>;
    let items: Iterable<string>;
    let includes: Iterable<string>;
    let runs: Iterable<string>;
    let runItems: Iterable<string>;
    if (!touched) {
      store = new MemoryRowStore(
        await this.db.serverLists.where('spaceId').equals(spaceId).toArray(),
        await this.db.serverItems.where('spaceId').equals(spaceId).toArray(),
        serverIncludes,
        await this.db.serverRuns.where('spaceId').equals(spaceId).toArray(),
        await this.db.serverRunItems.where('spaceId').equals(spaceId).toArray(),
      );
      await this.db.lists.where('spaceId').equals(spaceId).delete();
      await this.db.items.where('spaceId').equals(spaceId).delete();
      await this.db.includes.where('spaceId').equals(spaceId).delete();
      await this.db.runs.where('spaceId').equals(spaceId).delete();
      await this.db.runItems.where('spaceId').equals(spaceId).delete();
      lists = [];
      items = [];
      includes = [];
      runs = [];
      runItems = [];
    } else {
      const ids = touchedBy(
        pending.map((p) => p.mutation),
        {
          lists: new Set(touched.lists),
          items: new Set(touched.items),
          includes: new Set(touched.includes),
          runs: new Set(touched.runs),
          runItems: new Set(touched.runItems),
        },
      );
      // Ids are keys across spaces; only this space's rows take part, as in a full rebuild.
      const serverItems = (
        await this.db.serverItems.bulkGet([...ids.items])
      ).filter(inSpaceOf(spaceId));
      // The rules look at an item's list (deleted lists win), and at an include's lists.
      for (const item of serverItems) ids.lists.add(item.listId);
      for (const include of serverIncludes) {
        if (!ids.includes.has(include.id)) continue;
        ids.lists.add(include.parentListId);
        ids.lists.add(include.childListId);
      }
      const serverLists = (
        await this.db.serverLists.bulkGet([...ids.lists])
      ).filter(inSpaceOf(spaceId));
      // The run rules read all items of a run (merging, finishing): load every item of each
      // run concerned, and recompute them all.
      for (const item of (
        await this.db.serverRunItems.bulkGet([...ids.runItems])
      ).filter(inSpaceOf(spaceId))) {
        ids.runs.add(item.runId);
      }
      const serverRunItems = (
        await this.db.serverRunItems
          .where('runId')
          .anyOf([...ids.runs])
          .toArray()
      ).filter(inSpaceOf(spaceId));
      for (const item of serverRunItems) ids.runItems.add(item.id);
      const serverRuns = (
        await this.db.serverRuns.bulkGet([...ids.runs])
      ).filter(inSpaceOf(spaceId));
      store = new MemoryRowStore(
        serverLists,
        serverItems,
        serverIncludes,
        serverRuns,
        serverRunItems,
      );
      lists = ids.lists;
      items = ids.items;
      includes = ids.includes;
      runs = ids.runs;
      runItems = ids.runItems;
    }

    const context = await this.context(spaceId);
    for (const { mutation, at } of pending) {
      applyMutation(store, { ...context, now: at }, mutation);
    }

    const inSpace = inSpaceOf(spaceId);
    if (!touched) {
      await this.db.lists.bulkPut([...store.lists.values()].filter(inSpace));
      await this.db.items.bulkPut([...store.items.values()].filter(inSpace));
      await this.db.includes.bulkPut(
        [...store.includes.values()].filter(inSpace),
      );
      await this.db.runs.bulkPut([...store.runs.values()].filter(inSpace));
      await this.db.runItems.bulkPut(
        [...store.runItems.values()].filter(inSpace),
      );
      return;
    }
    const listIds = [...lists];
    const itemIds = [...items];
    const listChanges = changes(
      spaceId,
      listIds,
      store.lists,
      await this.db.lists.bulkGet(listIds),
    );
    const itemChanges = changes(
      spaceId,
      itemIds,
      store.items,
      await this.db.items.bulkGet(itemIds),
    );
    await this.db.lists.bulkPut(listChanges.put);
    await this.db.lists.bulkDelete(listChanges.gone);
    await this.db.items.bulkPut(itemChanges.put);
    await this.db.items.bulkDelete(itemChanges.gone);
    const includeIds = [...includes];
    const includeChanges = changes(
      spaceId,
      includeIds,
      store.includes,
      await this.db.includes.bulkGet(includeIds),
    );
    await this.db.includes.bulkPut(includeChanges.put);
    await this.db.includes.bulkDelete(includeChanges.gone);
    const runIds = [...runs];
    const runChanges = changes(
      spaceId,
      runIds,
      store.runs,
      await this.db.runs.bulkGet(runIds),
    );
    await this.db.runs.bulkPut(runChanges.put);
    await this.db.runs.bulkDelete(runChanges.gone);
    const runItemIds = [...runItems];
    const runItemChanges = changes(
      spaceId,
      runItemIds,
      store.runItems,
      await this.db.runItems.bulkGet(runItemIds),
    );
    await this.db.runItems.bulkPut(runItemChanges.put);
    await this.db.runItems.bulkDelete(runItemChanges.gone);
  }

  /** Who we are and the version local predictions are based on. */
  private async context(spaceId: string) {
    return {
      spaceId,
      userId: (await this.db.meta.get('userId'))?.value ?? '',
      version: (await this.db.syncState.get(spaceId))?.version ?? 0,
    };
  }

  /** Runs database work one task at a time, in order; failures go to the ErrorHandler. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.catch((error: unknown) =>
      this.errorHandler.handleError(error),
    );
    return result;
  }
}
