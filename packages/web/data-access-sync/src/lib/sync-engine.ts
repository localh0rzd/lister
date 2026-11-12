import {
  DestroyRef,
  ErrorHandler,
  Service,
  type Signal,
  computed,
  inject,
  signal,
} from '@angular/core';
import { liveQuery } from 'dexie';
import { newId } from '@lister/shared/domain';
import {
  type Ack,
  MAX_PUSH_MUTATIONS,
  MemoryRowStore,
  type MutationInput,
  PROTOCOL_VERSION,
  type Poke,
  type Reject,
  type RowSet,
  type Rows,
  type Welcome,
  applyMutation,
  mutationSchema,
  parseMutation,
} from '@lister/shared/sync-protocol';
import {
  LOCAL_DB,
  type LocalDb,
  liveQuerySignal,
  valueOf,
} from '@lister/web/data-access-local-db';
import {
  SYNC_CLOCK,
  SYNC_LOCKS,
  SYNC_SOCKET_FACTORY,
  type SyncSocket,
} from './tokens';

/** A change the server refused; the UI shows `reason` (T-029). */
export interface SyncError {
  mutationId: string;
  reason: string;
  at: number;
}

/** What `mutate` answers: queued (applied locally), or refused before queueing. */
export type MutateResult = { ok: true } | { ok: false; reason: string };

/** A mutation as the UI asks for it: the engine adds the mutation id. */
export type MutationRequest = Omit<MutationInput, 'mutationId'>;

const LOCK_NAME = 'lister-sync';
const FIRST_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30_000;

/**
 * The client half of the sync protocol (design §4.2):
 *
 * - `mutate()` predicts the change with the shared rules, queues it in the outbox and rebuilds
 *   the space's visible rows, so the UI updates at once, also offline.
 * - One tab (the Web Locks leader) runs the socket: hello → pull per space → push the outbox in
 *   order. Pokes are applied in version order; a gap triggers a pull. An ack removes a mutation
 *   from the outbox once this device has the space's rows up to its version; a reject drops it,
 *   rolls back by rebuilding from the server copy, and is reported in `errors`.
 * - Rebase: whenever server rows arrive, the visible rows are rebuilt as server rows plus the
 *   pending mutations, so local changes stay on top until the server confirms them.
 *
 * Other tabs only write the local database; the leader notices new outbox entries and pushes
 * them. All database work runs one task at a time, in arrival order.
 */
@Service()
export class SyncEngine {
  private readonly db: LocalDb = inject(LOCAL_DB);
  private readonly createSocket = inject(SYNC_SOCKET_FACTORY);
  private readonly locks = inject(SYNC_LOCKS);
  private readonly now = inject(SYNC_CLOCK);
  private readonly errorHandler = inject(ErrorHandler);
  private readonly destroyRef = inject(DestroyRef);

  private readonly onlineState = signal(false);
  private readonly syncingState = signal(false);
  private readonly lastSyncedAtState = signal<number | null>(null);
  private readonly errorsState = signal<readonly SyncError[]>([]);
  private readonly updateRequiredState = signal(false);
  private readonly outboxCount = liveQuerySignal(
    () => () => this.db.outbox.count(),
  );

  /** This tab is connected and welcomed by the server. */
  readonly online = this.onlineState.asReadonly();
  /** Changes are on their way to the server. */
  readonly syncing = this.syncingState.asReadonly();
  /** Changes made on this device that the server hasn't confirmed yet (all tabs). */
  readonly pendingCount: Signal<number> = computed(
    () => valueOf(this.outboxCount()) ?? 0,
  );
  readonly lastSyncedAt = this.lastSyncedAtState.asReadonly();
  /** Changes the server refused, newest last. */
  readonly errors = this.errorsState.asReadonly();
  /** The server speaks a newer protocol: the app must reload to update. */
  readonly updateRequired = this.updateRequiredState.asReadonly();

  private socket?: SyncSocket;
  private started = false;
  /** Mutation ids pushed on the current connection and not yet answered. */
  private readonly inFlight = new Set<string>();
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
        [
          this.db.lists,
          this.db.items,
          this.db.serverLists,
          this.db.serverItems,
          this.db.outbox,
          this.db.syncState,
          this.db.meta,
        ],
        async () => {
          const store = new MemoryRowStore(
            await this.db.lists.where('spaceId').equals(spaceId).toArray(),
            await this.db.items.where('spaceId').equals(spaceId).toArray(),
          );
          const outcome = applyMutation(
            store,
            await this.context(spaceId, this.now()),
            parsed.mutation,
          );
          if (outcome.kind === 'rejected') return outcome.reason;
          await this.db.outbox.add({
            mutationId: mutation.mutationId,
            spaceId,
            mutation,
            createdAt: this.now(),
          });
          await this.rebuild(spaceId);
          return undefined;
        },
      );
      return rejection === undefined
        ? { ok: true }
        : { ok: false, reason: rejection };
    });
  }

  /** Clears a reported error once the UI has shown it. */
  dismissError(mutationId: string): void {
    this.errorsState.update((errors) =>
      errors.filter((e) => e.mutationId !== mutationId),
    );
  }

  // ── Leader: the connection ─────────────────────────────────────────────────

  private lead(): void {
    const socket = this.createSocket();
    this.socket = socket;

    socket.on('connect', () => void this.enqueue(() => this.hello()));
    socket.on('disconnect', (reason) => this.onDisconnect(reason));
    socket.on(
      'welcome',
      (welcome) => void this.enqueue(() => this.onWelcome(welcome)),
    );
    socket.on('rows', (rows) => void this.enqueue(() => this.onRows(rows)));
    socket.on('poke', (poke) => void this.enqueue(() => this.onPoke(poke)));
    socket.on('ack', (ack) => void this.enqueue(() => this.onAck(ack)));
    socket.on(
      'reject',
      (reject) => void this.enqueue(() => this.onReject(reject)),
    );
    socket.on('updateRequired', () => this.updateRequiredState.set(true));

    // Push whatever any tab adds to the outbox.
    const outbox = liveQuery(() => this.db.outbox.count()).subscribe(
      () => void this.enqueue(() => this.flush()),
    );
    this.destroyRef.onDestroy(() => {
      outbox.unsubscribe();
      clearTimeout(this.reconnectTimer);
      socket.disconnect();
    });

    socket.connect();
  }

  private onDisconnect(reason: string): void {
    this.onlineState.set(false);
    this.syncingState.set(false);
    this.inFlight.clear();
    // Socket.IO reconnects by itself unless the server closed the connection (design §4.2).
    if (reason === 'io server disconnect' && !this.updateRequiredState()) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(
        () => this.socket?.connect(),
        this.reconnectDelay,
      );
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
    this.socket?.emit('hello', { protocolVersion: PROTOCOL_VERSION, clientId });
  }

  private async onWelcome(welcome: Welcome): Promise<void> {
    this.reconnectDelay = FIRST_RECONNECT_DELAY_MS;
    await this.db.transaction(
      'rw',
      [this.db.meta, this.db.spaces],
      async () => {
        await this.db.meta.put({ key: 'userId', value: welcome.userId });
        await this.db.spaces.bulkPut(welcome.spaces);
      },
    );
    for (const space of welcome.spaces) {
      const since = (await this.db.syncState.get(space.id))?.version ?? 0;
      this.socket?.emit('pull', { spaceId: space.id, since });
    }
    this.onlineState.set(true);
  }

  private async onRows(rows: Rows): Promise<void> {
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
    } else {
      // Missed something in between: catch up first.
      this.socket?.emit('pull', { spaceId: poke.spaceId, since: synced });
    }
  }

  private async onAck(ack: Ack): Promise<void> {
    this.inFlight.delete(ack.mutationId);
    await this.db.transaction(
      'rw',
      [
        this.db.outbox,
        this.db.syncState,
        this.db.lists,
        this.db.items,
        this.db.serverLists,
        this.db.serverItems,
        this.db.meta,
      ],
      async () => {
        const entry = await this.db.outbox
          .where('mutationId')
          .equals(ack.mutationId)
          .first();
        if (!entry?.seq) return;
        const synced =
          (await this.db.syncState.get(entry.spaceId))?.version ?? 0;
        if (synced >= ack.version) {
          await this.db.outbox.delete(entry.seq);
          await this.rebuild(entry.spaceId);
        } else {
          await this.db.outbox.update(entry.seq, { ackedVersion: ack.version });
        }
      },
    );
    this.updateSyncing();
  }

  private async onReject(reject: Reject): Promise<void> {
    this.inFlight.delete(reject.mutationId);
    await this.db.transaction(
      'rw',
      [
        this.db.outbox,
        this.db.syncState,
        this.db.lists,
        this.db.items,
        this.db.serverLists,
        this.db.serverItems,
        this.db.meta,
      ],
      async () => {
        const entry = await this.db.outbox
          .where('mutationId')
          .equals(reject.mutationId)
          .first();
        if (!entry?.seq) return;
        await this.db.outbox.delete(entry.seq);
        await this.rebuild(entry.spaceId); // rolls the change back
      },
    );
    this.errorsState.update((errors) => [
      ...errors,
      { mutationId: reject.mutationId, reason: reject.reason, at: this.now() },
    ]);
    this.updateSyncing();
  }

  /** Pushes outbox entries not yet sent on this connection, in order. */
  private async flush(): Promise<void> {
    if (!this.onlineState() || !this.socket) return;
    const pending = (await this.db.outbox.orderBy('seq').toArray()).filter(
      (entry) =>
        entry.ackedVersion === undefined &&
        !this.inFlight.has(entry.mutationId),
    );
    const batch = pending.slice(0, MAX_PUSH_MUTATIONS);
    if (batch.length > 0) {
      for (const entry of batch) this.inFlight.add(entry.mutationId);
      this.socket.emit('push', {
        mutations: batch.map((entry) => entry.mutation),
      });
    }
    this.updateSyncing();
  }

  private updateSyncing(): void {
    this.syncingState.set(this.inFlight.size > 0);
  }

  // ── Local database ─────────────────────────────────────────────────────────

  /** Stores server rows, drops confirmed outbox entries and rebases the space. */
  private async storeServerRows(
    spaceId: string,
    rows: RowSet,
    version: number,
    snapshot: boolean,
  ): Promise<void> {
    const syncedAt = this.now();
    await this.db.transaction(
      'rw',
      [
        this.db.serverLists,
        this.db.serverItems,
        this.db.lists,
        this.db.items,
        this.db.outbox,
        this.db.syncState,
        this.db.meta,
      ],
      async () => {
        if (snapshot) {
          await this.db.serverLists.where('spaceId').equals(spaceId).delete();
          await this.db.serverItems.where('spaceId').equals(spaceId).delete();
        }
        await this.db.serverLists.bulkPut(rows.lists);
        await this.db.serverItems.bulkPut(rows.items);
        await this.db.syncState.put({
          spaceId,
          version,
          lastSyncedAt: syncedAt,
        });
        const confirmed = (
          await this.db.outbox.where('spaceId').equals(spaceId).toArray()
        )
          .filter(
            (entry) =>
              entry.ackedVersion !== undefined && entry.ackedVersion <= version,
          )
          .map((entry) => entry.seq as number);
        await this.db.outbox.bulkDelete(confirmed);
        await this.rebuild(spaceId);
      },
    );
    this.lastSyncedAtState.set(syncedAt);
  }

  /**
   * Rebuilds a space's visible rows: its server rows with the pending mutations re-applied in
   * order. Runs inside a transaction that includes the tables it touches.
   */
  private async rebuild(spaceId: string): Promise<void> {
    const store = new MemoryRowStore(
      await this.db.serverLists.where('spaceId').equals(spaceId).toArray(),
      await this.db.serverItems.where('spaceId').equals(spaceId).toArray(),
    );
    const pending = await this.db.outbox
      .where('spaceId')
      .equals(spaceId)
      .sortBy('seq');
    for (const entry of pending) {
      const mutation = mutationSchema.safeParse(entry.mutation);
      // An entry the rules now refuse just has no effect here; the server will answer it.
      if (mutation.success) {
        applyMutation(
          store,
          await this.context(spaceId, entry.createdAt),
          mutation.data,
        );
      }
    }
    await this.db.lists.where('spaceId').equals(spaceId).delete();
    await this.db.items.where('spaceId').equals(spaceId).delete();
    await this.db.lists.bulkPut(
      [...store.lists.values()].filter((l) => l.spaceId === spaceId),
    );
    await this.db.items.bulkPut(
      [...store.items.values()].filter((i) => i.spaceId === spaceId),
    );
  }

  /** Context for local predictions: who we are and the version the rows are based on. */
  private async context(spaceId: string, now: number) {
    return {
      spaceId,
      userId: (await this.db.meta.get('userId'))?.value ?? '',
      now,
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
