import {
  DOCUMENT,
  DestroyRef,
  ErrorHandler,
  Service,
  type Signal,
  computed,
  effect,
  inject,
} from '@angular/core';
import { liveQuery } from 'dexie';
import { USER_STORAGE_KEY } from '@lister/web/data-access-auth';
import { newId } from '@lister/shared/domain';
import {
  type DiagnosticArea,
  type DiagnosticData,
  Diagnostics,
  worthLogging,
} from '@lister/web/util-diagnostics';
import {
  type Ack,
  type ClientToServerEvents,
  MAX_PUSH_BYTES,
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
  SYNC_STATUS_KEY,
  liveQuerySignal,
  valueOf,
} from '@lister/web/data-access-local-db';
import { describeMutation } from './describe-mutation';
import { mutationBytes, nextPushBatch } from './push-batch';
import type { ZodMiniType } from 'zod/mini';
import {
  SYNC_CLOCK,
  SYNC_LEADER_CHANNEL,
  SYNC_LOCKS,
  SYNC_SOCKET_FACTORY,
  type SyncLeaderChannel,
  type SyncLeaderMessage,
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
  includeExceptions: Set<string>;
  runs: Set<string>;
  runItems: Set<string>;
}

const noneTouched = (): Touched => ({
  lists: new Set(),
  items: new Set(),
  includes: new Set(),
  includeExceptions: new Set(),
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
  includeId?: string;
  targetKind?: 'item' | 'list';
  targetId?: string;
  items?: { id: string; from?: string }[];
  includes?: { id: string; from: string }[];
  /** list.import: new lists, each with entries that are items or (with `listId`) includes. */
  lists?: { id: string; entries: { id: string; listId?: string }[] }[];
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
        if (a.listId) into.lists.add(a.listId); // list.sortItems
        // list.duplicate: reads its source and writes copies of the listed rows.
        if (a.sourceListId) into.lists.add(a.sourceListId);
        for (const row of a.items ?? []) {
          into.items.add(row.id);
          if (row.from) into.items.add(row.from);
        }
        for (const row of a.includes ?? [])
          into.includes.add(row.id).add(row.from);
        for (const list of a.lists ?? []) {
          into.lists.add(list.id);
          for (const entry of list.entries)
            (entry.listId ? into.includes : into.items).add(entry.id);
        }
        break;
      case 'item':
        if (a.id) into.items.add(a.id);
        if (a.listId) into.lists.add(a.listId);
        break;
      case 'include':
        if (name === 'include.addException') {
          // Reads its include and target, writes a new exception row.
          if (a.id) into.includeExceptions.add(a.id);
          if (a.includeId) into.includes.add(a.includeId);
          if (a.targetId)
            (a.targetKind === 'item' ? into.items : into.lists).add(a.targetId);
          break;
        }
        if (name === 'include.removeException') {
          // Its exception rows are found by relation in `rebuild()`.
          if (a.includeId) into.includes.add(a.includeId);
          break;
        }
        if (a.id) into.includes.add(a.id);
        if (a.parentListId) into.lists.add(a.parentListId);
        if (a.childListId) into.lists.add(a.childListId);
        break;
      case 'run':
        if (name === 'run.saveAsList') {
          // Reads the run's items and writes a new list with copies of them.
          if (a.runId) into.runs.add(a.runId);
          if (a.listId) into.lists.add(a.listId);
          for (const row of a.items ?? []) {
            into.items.add(row.id);
            if (row.from) into.runItems.add(row.from);
          }
          break;
        }
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

/** The message the server's handshake check refuses with when there is no usable session. */
const SIGN_IN_REFUSAL = 'Sign in first';
const TOO_BIG = 'This change is too big to sync. Make it in smaller steps.';
const LOCK_NAME = 'lister-sync';
/** How often a page that waits for the sync lock checks that the lock is not stuck. */
export const LOCK_CHECK_MS = 3000;
/** How long a visible page waits for the leader to answer a ping before it takes the lock. */
export const PROBE_TIMEOUT_MS = 2000;
const FIRST_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30_000;
/** How many shown errors the error log keeps. */
export const ERROR_LOG_SIZE = 20;
const SYNC_NOW_KEY = 'syncNowRequest';
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
  private readonly openLeaderChannel = inject(SYNC_LEADER_CHANNEL);
  private readonly now = inject(SYNC_CLOCK);
  private readonly errorHandler = inject(ErrorHandler);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;
  private readonly diagnostics = inject(Diagnostics);

  private readonly status = liveQuerySignal(() => async () => {
    const row = await this.db.meta.get(SYNC_STATUS_KEY);
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
  readonly errors: Signal<readonly SyncError[]> = computed(() =>
    this.errorLog().filter((error) => !error.seen),
  );
  /** The recent refused changes, oldest first, also after they were shown and dismissed. */
  readonly errorLog: Signal<readonly SyncError[]> = computed(
    () => valueOf(this.rejections()) ?? [],
  );
  /**
   * The server refused the connection because there is no session (it expired, or the password
   * must be changed). The app keeps working and keeps its pending changes; signing in again
   * resumes syncing.
   */
  readonly signInRequired: Signal<boolean> = computed(
    () => this.currentStatus().signInRequired === true,
  );
  /** The server speaks a newer protocol: the app must reload to update. */
  readonly updateRequired: Signal<boolean> = computed(
    () => this.currentStatus().updateRequired,
  );

  private socket?: SyncSocket;
  /** The id of the current connection: Socket.IO clears `socket.id` before it emits `disconnect`. */
  private connectedSid?: string;
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
  /** `stop()` was called: queued background work is skipped. */
  private stopped = false;
  /** Cancels the watchers, listeners, timers and the socket of `lead()`. */
  private teardown?: () => void;

  /** The pending lock request of this page, until it is granted or cancelled. */
  private lockWait?: {
    abort: AbortController;
    check: ReturnType<typeof setInterval>;
  };
  /** Lets go of the lock this page holds. */
  private releaseLock?: () => void;
  /** The wait looked stuck at the last check (lock pending, held by nobody). */
  private stuckBefore = false;
  /**
   * The page came to the front (visible, or resumed while visible) while it led, and hasn't been
   * hidden since: if its lock turns out stolen, it takes it straight back, once.
   */
  private cameToFront = false;
  /** Where the leader answers pings and a waiting page sends them (absent without support). */
  private leaderChannel?: SyncLeaderChannel;
  /** The ping this page sent and still waits an answer for. */
  private probeWait?: { id: string; timer: ReturnType<typeof setTimeout> };
  /** Removes the page lifecycle listeners (`pagehide`, `pageshow`, `visibilitychange`, `resume`). */
  private removePageListeners?: () => void;

  constructor() {
    // What this tab shows the user. "Offline" is `online === false` in the status the leading tab
    // wrote (or none written yet), so this entry names the exact condition behind the badge.
    effect(() => {
      const loaded = valueOf(this.status()) !== undefined;
      const { online, signInRequired, updateRequired } = this.currentStatus();
      this.log('ui-status', {
        badge:
          signInRequired === true ? 'sign-in' : online ? 'online' : 'offline',
        statusLoaded: loaded,
        online,
        signInRequired: signInRequired === true,
        updateRequired,
        pending: valueOf(this.outboxCount()) ?? 0,
        thisTabLeads: this.diagnostics.leader,
      });
    });
  }

  /** Writes an entry with the socket id, which the API's debug log names too. */
  private log(
    event: string,
    data: DiagnosticData = {},
    area: DiagnosticArea = 'sync',
  ): void {
    this.diagnostics.log(area, event, { sid: this.socket?.id, ...data });
  }

  /** Starts syncing in this tab once it holds the sync lock (one tab at a time). */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.log('start', { locksSupported: this.locks.query !== undefined });
    const unregister = this.diagnostics.registerState('sync', () => ({
      ...this.connection,
      leads: this.diagnostics.leader,
      socketId: this.socket?.id,
      socketConnected: this.socket?.connected === true,
      inFlight: this.inFlight.size,
      pending: this.pendingCount(),
      reconnectDelayMs: this.reconnectDelay,
    }));
    this.destroyRef.onDestroy(() => {
      unregister();
      void this.stop();
    });
    // A page that goes away (also into the back/forward cache) leaves nothing behind: a lock
    // request of a frozen page would block every later page. A restored page leads again.
    const leave = () => this.leave('pagehide');
    const comeBack = (event: PageTransitionEvent) => {
      this.log('pageshow', { persisted: event.persisted }, 'lock');
      if (event.persisted) this.requestLock();
    };
    // A visible page that waits for the lock checks the leader is alive (see `probe`); a page
    // that leads remembers it came to the front (see `cameToFront`).
    const shown = () => {
      if (this.document.visibilityState === 'visible') this.cameForward();
      else {
        this.cameToFront = false;
        this.cancelProbe();
      }
    };
    // A page resumed in the background stays behind: the visible page may be leading.
    const resumed = () => {
      if (this.document.visibilityState === 'visible') this.cameForward();
    };
    this.window?.addEventListener('pagehide', leave);
    this.window?.addEventListener('pageshow', comeBack);
    this.document.addEventListener('visibilitychange', shown);
    this.document.addEventListener('resume', resumed);
    this.leaderChannel = this.openLeaderChannel();
    if (this.leaderChannel)
      this.leaderChannel.onmessage = (event) => this.heard(event.data);
    this.removePageListeners = () => {
      this.cancelProbe();
      this.leaderChannel?.close();
      this.leaderChannel = undefined;
      this.window?.removeEventListener('pagehide', leave);
      this.window?.removeEventListener('pageshow', comeBack);
      this.document.removeEventListener('visibilitychange', shown);
      this.document.removeEventListener('resume', resumed);
    };
    this.requestLock();
    this.probe(); // a page that loads visible gets no `visibilitychange`
  }

  /** Asks for the sync lock; while it waits, a lock that is pending but held by nobody is stolen. */
  private requestLock(steal = false): void {
    if (this.stopped || this.lockWait || this.releaseLock) return;
    const abort = new AbortController();
    const check = setInterval(() => void this.checkStuck(), LOCK_CHECK_MS);
    this.lockWait = { abort, check };
    this.stuckBefore = false;
    let granted: (() => void) | undefined;
    this.log('requested', { name: LOCK_NAME, steal }, 'lock');
    void this.locks
      .query?.(LOCK_NAME)
      .then((state) => this.log('state', { ...state }, 'lock'));
    this.locks
      .request(
        LOCK_NAME,
        () =>
          new Promise<void>((release) => {
            if (this.stopped || abort.signal.aborted) return release();
            this.cancelWait();
            granted = release;
            this.releaseLock = release;
            this.log('acquired', { steal }, 'lock');
            this.lead();
          }),
        // Browsers refuse a steal with a signal; a steal is granted at once, `aborted` guards it.
        steal ? { steal } : { signal: abort.signal },
      )
      .catch((error: unknown) => {
        if (granted) {
          // Stolen: another page leads now. Step back and wait behind it.
          if (this.releaseLock !== granted) return;
          this.log('stolen', { name: errorName(error) }, 'lock');
          // A page that thaws into the front runs `resume` and `visibilitychange` before the
          // queued news of its stolen lock, so it takes the lock back here, once: otherwise it
          // would wait behind a page that is now in the background and may be frozen next.
          const takeBack =
            this.cameToFront && this.document.visibilityState === 'visible';
          this.stepBack();
          granted();
          if (takeBack) this.log('front-steal', {}, 'lock');
          this.requestLock(takeBack);
        } else if (!abort.signal.aborted) {
          // Refused (unexpected): report it, so a page that never leads doesn't fail silently.
          this.log('refused', errorData(error), 'lock');
          this.errorHandler.handleError(error);
          this.cancelWait();
        } else this.log('wait-aborted', {}, 'lock');
      });
  }

  /** The page is visible now: a leader remembers it, a waiting page probes the leader. */
  private cameForward(): void {
    if (this.releaseLock) this.cameToFront = true;
    else this.probe();
  }

  /** Answers a ping while this page leads; takes an answer to its own ping. */
  private heard(message: SyncLeaderMessage): void {
    if (message.type === 'ping') {
      if (this.releaseLock)
        this.leaderChannel?.postMessage({ type: 'pong', id: message.id });
    } else if (message.id === this.probeWait?.id) {
      this.log('probe-answered', {}, 'lock');
      this.cancelProbe();
    }
  }

  /**
   * A visible page that waits for the lock asks the leader whether it is alive. A frozen or gone
   * leader runs no handlers and stays silent: the page then takes the lock. A leader that answers
   * keeps it, so live pages never steal from each other. Only on events (load, visible, resume,
   * "Sync now"), never on a timer, and never while hidden.
   */
  private probe(): void {
    if (
      this.stopped ||
      !this.lockWait ||
      this.releaseLock ||
      this.probeWait ||
      !this.leaderChannel ||
      this.document.visibilityState !== 'visible'
    )
      return;
    const id = newId();
    const timer = setTimeout(() => {
      this.probeWait = undefined;
      if (!this.lockWait || this.document.visibilityState !== 'visible') return;
      this.log('probe-steal', {}, 'lock');
      this.cancelWait();
      this.requestLock(true);
    }, PROBE_TIMEOUT_MS);
    this.probeWait = { id, timer };
    this.log('probe', {}, 'lock');
    this.leaderChannel.postMessage({ type: 'ping', id });
  }

  private cancelProbe(): void {
    if (this.probeWait) clearTimeout(this.probeWait.timer);
    this.probeWait = undefined;
  }

  private cancelWait(): void {
    if (!this.lockWait) return;
    clearInterval(this.lockWait.check);
    this.cancelProbe();
    this.lockWait.abort.abort();
    this.lockWait = undefined;
  }

  /**
   * Requests of pages that are gone or frozen can leave the lock pending with no holder, so
   * nobody is ever granted it. Seen twice in a row, the wait takes the lock. Never while another
   * page holds it, so live tabs don't steal from each other.
   */
  private async checkStuck(): Promise<void> {
    const wait = this.lockWait;
    const state = await this.locks.query?.(LOCK_NAME);
    if (!state || this.lockWait !== wait) return;
    const stuck = state.held === 0 && state.pending > 0;
    if (stuck && this.stuckBefore) {
      this.log('stuck-steal', { ...state }, 'lock');
      this.cancelWait();
      this.requestLock(true);
    } else this.stuckBefore = stuck;
  }

  /** The page goes away: drops the request or the lock, and closes the socket and watchers. */
  private leave(why: string): void {
    if (this.lockWait || this.releaseLock)
      this.log(
        'released',
        { why, held: this.releaseLock !== undefined },
        'lock',
      );
    this.cancelWait();
    const release = this.releaseLock;
    this.stepBack();
    release?.();
  }

  /** Stops leading: closes the socket and watchers and forgets the lock. */
  private stepBack(): void {
    this.diagnostics.leader = false;
    this.cameToFront = false;
    this.teardown?.();
    this.teardown = undefined;
    this.releaseLock = undefined;
  }

  /**
   * Stops syncing: cancels the watchers, listeners, timers and the socket, skips queued background
   * work (pokes, pushes, status writes) and resolves once the remaining queued work (mutations) is
   * done. The engine itself touches the database no more, so it can be closed unless the app
   * still calls mutate() or the other public methods. Final: a stopped engine does not start again
   * (unlike a page that is hidden and shown again).
   */
  async stop(): Promise<void> {
    this.stopped = true;
    this.removePageListeners?.();
    this.removePageListeners = undefined;
    this.leave('stop');
    await this.whenIdle();
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
    // A push over the server's message cap would drop the connection again and again.
    if (mutationBytes(mutation) > MAX_PUSH_BYTES)
      return Promise.resolve({ ok: false, reason: TOO_BIG });

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
            await this.db.includeExceptions
              .where('spaceId')
              .equals(spaceId)
              .toArray(),
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

  /**
   * Marks a reported rejection as shown (in every tab). It stays in `errorLog`, which keeps the
   * latest `ERROR_LOG_SIZE`.
   */
  async dismissError(mutationId: string): Promise<void> {
    await this.db.transaction('rw', this.db.rejections, async () => {
      await this.db.rejections.update(mutationId, { seen: true });
      const all = await this.db.rejections.orderBy('at').toArray();
      const surplus = all.length - ERROR_LOG_SIZE;
      if (surplus <= 0) return;
      const old = all.filter((error) => error.seen).slice(0, surplus);
      await this.db.rejections.bulkDelete(old.map((e) => e.mutationId));
    });
  }

  /** Empties the error log (every tab). */
  async clearErrorLog(): Promise<void> {
    await this.db.rejections.clear();
  }

  /**
   * "Sync now": asks the syncing tab (this one, or another) to push the outbox and pull every
   * space now, or, when offline, to reconnect at once instead of waiting out the backoff.
   */
  async syncNow(): Promise<void> {
    // A fresh value every time, so every request is a change.
    this.log('sync-now-requested');
    this.probe();
    await this.db.meta.put({ key: SYNC_NOW_KEY, value: newId() });
  }

  private syncNowAsLeader(socket: SyncSocket): void {
    this.log('sync-now', {
      socketConnected: socket.connected,
      online: this.connection.online,
      updateRequired: this.connection.updateRequired,
    });
    if (this.connection.updateRequired) return;
    // Connected but not welcomed yet: the welcome pulls every space it names. Pulling the spaces
    // this device knew before could ask for one the user has left, which the server answers by
    // dropping the connection.
    if (socket.connected && !this.connection.online) return;
    if (this.connection.online) {
      this.background(async () => {
        for (const id of await this.db.spaces.toCollection().primaryKeys())
          await this.pull(id);
        await this.flush();
      });
      return;
    }
    clearTimeout(this.reconnectTimer);
    this.reconnectDelay = FIRST_RECONNECT_DELAY_MS;
    socket.disconnect();
    socket.connect();
  }

  // ── Leader: the connection ─────────────────────────────────────────────────

  private lead(): void {
    const socket = this.createSocket();
    this.socket = socket;
    // A new leadership is a new connection: it starts without the old back-off.
    this.reconnectDelay = FIRST_RECONNECT_DELAY_MS;
    this.diagnostics.leader = true;
    this.log('lead');
    this.setStatus(OFFLINE, 'started leading: not connected yet');
    this.logConnection(socket);

    socket.on('connect', () => {
      this.healthy = false;
      this.connectedSid = socket.id;
      this.diagnostics.endRepeating();
      this.log(
        'connect',
        {
          transport: socket.io.engine?.transport.name,
          engineId: socket.io.engine?.id,
          recovered: socket.recovered,
        },
        'socket',
      );
      this.background(() => this.hello());
    });
    socket.on('disconnect', (reason, details) =>
      this.onDisconnect(reason, details),
    );
    // A refused handshake is not retried by Socket.IO. Going online again, or coming back to the
    // tab (after signing in in another one), tries again.
    socket.on('connect_error', (error) => {
      // Socket.IO retries every few seconds for as long as it fails: repeats are collapsed, and
      // an HTTP probe tells a refused handshake (Origin, proxy) from an unreachable server.
      this.diagnostics.logRepeating('socket', 'connect_error', {
        ...errorData(error),
        transport: socket.io.engine?.transport.name,
        willRetry: error.message !== SIGN_IN_REFUSAL,
        navigatorOnLine: this.window?.navigator.onLine,
      });
      if (error.message === SIGN_IN_REFUSAL) {
        this.setStatus(
          {
            ...this.connection,
            online: false,
            syncing: false,
            signInRequired: true,
          },
          'connect_error: the server refused the handshake (no usable session)',
        );
      }
    });
    this.listen('welcome', welcomeSchema, (m) => this.onWelcome(m));
    this.listen('rows', rowsSchema, (m) => this.onRows(m));
    this.listen('poke', pokeSchema, (m) => this.onPoke(m));
    this.listen('ack', ackSchema, (m) => this.onAck(m));
    this.listen('reject', rejectSchema, (m) => this.onReject(m));
    socket.on('updateRequired', () =>
      this.setStatus(
        { ...this.connection, updateRequired: true },
        'updateRequired: the server speaks a newer protocol',
      ),
    );

    // The browser knows about lost networks long before Socket.IO's ping timeout (up to 45 s).
    // Closing only the transport keeps Socket.IO's own reconnect loop running, so a false
    // `offline` (VPN adapters, flapping networks) heals by itself even if `online` never comes.
    const goOffline = () => {
      this.log('browser-offline', {
        engineOpen: socket.io.engine !== undefined,
      });
      socket.io.engine?.close();
    };
    const goOnline = () => {
      const skip = socket.connected || this.connection.updateRequired;
      this.log('browser-online', {
        socketConnected: socket.connected,
        updateRequired: this.connection.updateRequired,
        action: skip ? 'none' : 'reconnect-now',
      });
      if (skip) return;
      // While Socket.IO waits between reconnect attempts, connect() does nothing; restarting
      // the connection skips the remaining backoff now that the network is back.
      socket.disconnect();
      socket.connect();
    };
    const retrySignIn = () => {
      if (this.connection.signInRequired) {
        this.log('retry-sign-in');
        goOnline();
      }
    };
    // Signing in in another tab stores the user there; this tab may hold the sync lock.
    const retryAfterSignIn = (event: StorageEvent) => {
      if (event.key === USER_STORAGE_KEY) retrySignIn();
    };
    this.window?.addEventListener('offline', goOffline);
    this.window?.addEventListener('online', goOnline);
    this.window?.addEventListener('focus', retrySignIn);
    this.window?.addEventListener('storage', retryAfterSignIn);

    // Push whatever any tab adds to the outbox.
    const outbox = liveQuery(() => this.db.outbox.count()).subscribe(() =>
      this.background(() => this.flush()),
    );
    // A "Sync now" from any tab. The request that is there when we start is an old one, and
    // only a new request id counts (the query also re-runs for unrelated writes).
    let lastRequest: string | undefined | null = null;
    const syncNow = liveQuery(() => this.db.meta.get(SYNC_NOW_KEY)).subscribe(
      (row) => {
        const request = row?.value;
        const old = lastRequest;
        lastRequest = request;
        if (old !== null && request !== undefined && request !== old)
          this.syncNowAsLeader(socket);
      },
    );
    this.teardown = () => {
      syncNow.unsubscribe();
      this.window?.removeEventListener('offline', goOffline);
      this.window?.removeEventListener('online', goOnline);
      this.window?.removeEventListener('focus', retrySignIn);
      this.window?.removeEventListener('storage', retryAfterSignIn);
      outbox.unsubscribe();
      clearTimeout(this.reconnectTimer);
      socket.disconnect();
    };

    socket.connect();
  }

  /**
   * Handles a server message after checking it with its (tolerant) schema: unknown fields from a
   * newer server are dropped, and a malformed message is reported and ignored.
   */
  private listen<T>(
    event: 'welcome' | 'rows' | 'poke' | 'ack' | 'reject',
    schema: ZodMiniType<T>,
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
        this.log('invalid-message', {
          event,
          issues: parsed.error.issues.length,
        });
        this.errorHandler.handleError(
          new Error(
            `Ignored an invalid "${event}" message: ${parsed.error.message}`,
          ),
        );
        return;
      }
      this.background(() => handle(parsed.data));
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

  /** Logs the connection manager's own events: every attempt, its backoff and its outcome. */
  private logConnection(socket: SyncSocket): void {
    const manager = socket.io;
    const log = (event: string, data?: DiagnosticData) =>
      this.log(event, data, 'socket');
    manager.on('open', () =>
      log('open', {
        transport: manager.engine?.transport.name,
        engineId: manager.engine?.id,
      }),
    );
    // While not connected, the socket's `connect_error` reports the same error.
    manager.on('error', (error) => {
      if (socket.connected) log('manager-error', errorData(error));
    });
    manager.on('close', (reason, description) =>
      log('close', { reason, description: describe(description) }),
    );
    // A loop that retries every few seconds would push its own beginning out of the log. Its
    // failures are `connect_error` entries (the same error as `reconnect_error`).
    manager.on('reconnect_attempt', (attempt) => {
      if (worthLogging(attempt)) log('reconnect_attempt', { attempt });
    });
    manager.on('reconnect_failed', () => log('reconnect_failed'));
    manager.on('reconnect', (attempt) => log('reconnect', { attempt }));
  }

  private onDisconnect(reason: string, description?: unknown): void {
    this.log(
      'disconnect',
      {
        sid: this.connectedSid,
        reason,
        description: describe(description),
        inFlight: this.inFlight.size,
        navigatorOnLine: this.window?.navigator.onLine,
      },
      'socket',
    );
    this.connectedSid = undefined;
    this.inFlight.clear();
    this.pulling.clear();
    this.setStatus(
      { ...this.connection, online: false, syncing: false },
      `disconnect: ${reason}`,
    );
    // Socket.IO reconnects by itself unless the server closed the connection (design §4.2).
    if (reason === 'io server disconnect' && !this.connection.updateRequired) {
      this.log('reconnect-scheduled', {
        delayMs: this.reconnectDelay,
        by: 'engine (server closed the connection)',
      });
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => {
        this.log('reconnect-now', {}, 'socket');
        this.socket?.connect();
      }, this.reconnectDelay);
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
    const sent = this.send('hello', {
      protocolVersion: PROTOCOL_VERSION,
      clientId,
    });
    this.log('hello', { protocolVersion: PROTOCOL_VERSION, clientId, sent });
  }

  private async onWelcome(welcome: Welcome): Promise<void> {
    this.log('welcome', {
      userId: welcome.userId,
      spaces: welcome.spaces.length,
      spaceIds: welcome.spaces.map((space) => space.id).join(','),
    });
    const current = new Set(welcome.spaces.map((space) => space.id));
    await this.db.transaction(
      'rw',
      [...this.syncTables(), this.db.spaces, this.db.rejections],
      async () => {
        // Whoever signs in on this device normally finds it wiped already (`AuthSession`). If
        // the connection came back with somebody else's session first, nothing of the previous
        // user may stay or be sent under the new one: not even pending changes to a space both
        // share.
        const holder = (await this.db.meta.get('userId'))?.value;
        const otherUser = holder !== undefined && holder !== welcome.userId;
        await this.db.meta.put({ key: 'userId', value: welcome.userId });
        if (otherUser) await this.db.rejections.clear();
        // A space missing from the welcome is one the user left, was removed from, or that was
        // deleted: stop syncing it and drop what this device holds of it.
        for (const known of await this.db.spaces.toCollection().primaryKeys()) {
          if (otherUser || !current.has(known)) await this.dropSpace(known);
        }
        await this.db.spaces.bulkPut(welcome.spaces);
      },
    );
    for (const space of welcome.spaces) {
      await this.pull(space.id);
    }
    this.setStatus(
      { ...this.connection, online: true, signInRequired: false },
      'welcome received and every space pulled',
    );
  }

  /**
   * Forgets a space completely: its rows (server copy and visible), sync position and pending
   * changes (the server would refuse them now). Runs inside a transaction over `syncTables()`
   * and `spaces`.
   */
  private async dropSpace(spaceId: string): Promise<void> {
    this.pulling.delete(spaceId);
    for (const table of [
      this.db.serverLists,
      this.db.serverItems,
      this.db.serverIncludes,
      this.db.serverIncludeExceptions,
      this.db.serverRuns,
      this.db.serverRunItems,
      this.db.lists,
      this.db.items,
      this.db.includes,
      this.db.includeExceptions,
      this.db.runs,
      this.db.runItems,
      this.db.outbox,
    ]) {
      await table.where('spaceId').equals(spaceId).delete();
    }
    await this.db.syncState.delete(spaceId);
    await this.db.spaces.delete(spaceId);
  }

  private async pull(spaceId: string): Promise<void> {
    const state = await this.db.syncState.get(spaceId);
    const since = state?.version ?? 0;
    const timeline = state?.timeline ?? '';
    const sent = this.send('pull', { spaceId, since, timeline });
    if (sent) this.pulling.add(spaceId);
    this.log('pull', { spaceId, since, timeline, sent });
  }

  private async onRows(rows: Rows): Promise<void> {
    this.log('rows', {
      spaceId: rows.spaceId,
      version: rows.version,
      snapshot: rows.snapshot,
      timeline: rows.timeline,
      lists: rows.rows.lists.length,
      items: rows.rows.items.length,
      includes: rows.rows.includes.length,
      includeExceptions: rows.rows.includeExceptions.length,
      runs: rows.rows.runs.length,
      runItems: rows.rows.runItems.length,
    });
    this.pulling.delete(rows.spaceId);
    await this.storeServerRows(
      rows.spaceId,
      rows.rows,
      rows.version,
      rows.snapshot,
      rows.timeline,
    );
    await this.flush();
  }

  private async onPoke(poke: Poke): Promise<void> {
    const synced = (await this.db.syncState.get(poke.spaceId))?.version ?? 0;
    const action =
      poke.version <= synced
        ? 'already-had-it'
        : poke.version === synced + 1
          ? 'applied'
          : this.pulling.has(poke.spaceId)
            ? 'gap-pull-pending'
            : 'gap-pull';
    this.log('poke', {
      spaceId: poke.spaceId,
      version: poke.version,
      synced,
      action,
    });
    if (poke.version <= synced) return; // already have it
    if (poke.version === synced + 1) {
      await this.storeServerRows(poke.spaceId, poke.rows, poke.version, false);
    } else if (!this.pulling.has(poke.spaceId)) {
      // Missed something in between: catch up (once; the answer covers this poke too).
      await this.pull(poke.spaceId);
    }
  }

  private async onAck(ack: Ack): Promise<void> {
    this.log('ack', { mutationId: ack.mutationId, version: ack.version });
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
    // The reason can quote a title; `Diagnostics` scrubs quoted text.
    this.log('reject', {
      mutationId: reject.mutationId,
      reason: reject.reason,
    });
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
        // Described before the rollback, while the rows it names are still there: by the
        // titles the server last sent (what the user sees again after the rollback), or the
        // local ones for rows that exist only here so far.
        const db = this.db;
        const description = await describeMutation(entry.mutation, {
          list: async (id) =>
            ((await db.serverLists.get(id)) ?? (await db.lists.get(id)))?.title,
          item: async (id) =>
            ((await db.serverItems.get(id)) ?? (await db.items.get(id)))?.title,
          run: async (id) =>
            ((await db.serverRuns.get(id)) ?? (await db.runs.get(id)))?.title,
          runItem: async (id) =>
            ((await db.serverRunItems.get(id)) ?? (await db.runItems.get(id)))
              ?.title,
          include: async (id) =>
            (await db.serverIncludes.get(id)) ?? (await db.includes.get(id)),
        });
        await this.db.outbox.delete(entry.seq);
        // Rolls the change back.
        await this.rebuild(entry.spaceId, touchedBy([entry.mutation]));
        await this.db.rejections.put({
          mutationId: reject.mutationId,
          reason: reject.reason,
          description,
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
    const batch = nextPushBatch(pending);
    // The connection may have dropped while reading.
    if (batch.length > 0 && this.connection.online) {
      const sent = this.send('push', {
        mutations: batch.map((entry) => entry.mutation),
      });
      this.log('push', {
        sent,
        mutations: batch.length,
        names: batch.map((entry) => entry.mutation.name).join(','),
        ids: batch.map((entry) => entry.mutationId).join(','),
        outbox: pending.length,
      });
      if (sent) {
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
      this.setStatus(
        { ...this.connection, syncing },
        `${this.inFlight.size} push(es) unanswered`,
      );
  }

  /** Records the leader's connection state for every tab. */
  private setStatus(status: SyncStatus, reason: string): void {
    const before = this.connection;
    this.log('status', {
      reason,
      online: status.online,
      syncing: status.syncing,
      signInRequired: status.signInRequired === true,
      updateRequired: status.updateRequired,
      wasOnline: before.online,
      wasSyncing: before.syncing,
    });
    this.connection = status;
    const value = JSON.stringify(status);
    this.background(() => this.db.meta.put({ key: SYNC_STATUS_KEY, value }));
  }

  // ── Local database ─────────────────────────────────────────────────────────

  private syncTables() {
    return [
      this.db.serverLists,
      this.db.serverItems,
      this.db.serverIncludes,
      this.db.serverIncludeExceptions,
      this.db.serverRuns,
      this.db.serverRunItems,
      this.db.lists,
      this.db.items,
      this.db.includes,
      this.db.includeExceptions,
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
    /** The space's timeline; a poke doesn't carry it, so the stored one stays. */
    timeline?: string,
  ): Promise<void> {
    const syncedAt = this.now();
    await this.db.transaction('rw', this.syncTables(), async () => {
      if (snapshot) {
        await this.db.serverLists.where('spaceId').equals(spaceId).delete();
        await this.db.serverItems.where('spaceId').equals(spaceId).delete();
        await this.db.serverIncludes.where('spaceId').equals(spaceId).delete();
        await this.db.serverIncludeExceptions
          .where('spaceId')
          .equals(spaceId)
          .delete();
        await this.db.serverRuns.where('spaceId').equals(spaceId).delete();
        await this.db.serverRunItems.where('spaceId').equals(spaceId).delete();
      }
      await this.db.serverLists.bulkPut(rows.lists);
      await this.db.serverItems.bulkPut(rows.items);
      await this.db.serverIncludes.bulkPut(rows.includes);
      await this.db.serverIncludeExceptions.bulkPut(rows.includeExceptions);
      await this.db.serverRuns.bulkPut(rows.runs);
      await this.db.serverRunItems.bulkPut(rows.runItems);
      const held = (await this.db.syncState.get(spaceId))?.timeline ?? '';
      // A restore started a new timeline: acks from the old one confirm nothing here.
      const restored =
        timeline !== undefined && held !== '' && timeline !== held;
      await this.db.syncState.put({
        spaceId,
        version,
        timeline: timeline ?? held,
        lastSyncedAt: syncedAt,
      });

      const touched = noneTouched();
      for (const row of rows.lists) touched.lists.add(row.id);
      for (const row of rows.items) touched.items.add(row.id);
      for (const row of rows.includes) touched.includes.add(row.id);
      for (const row of rows.includeExceptions)
        touched.includeExceptions.add(row.id);
      for (const row of rows.runs) touched.runs.add(row.id);
      for (const row of rows.runItems) touched.runItems.add(row.id);
      for (const entry of await this.db.outbox
        .where('spaceId')
        .equals(spaceId)
        .toArray()) {
        if (entry.ackedVersion === undefined || entry.seq === undefined)
          continue;
        if (restored) {
          // Acked on the lost timeline: the restored server may not have it, so send it again
          // (a server that has it answers the retry from its record).
          await this.db.outbox.update(entry.seq, { ackedVersion: undefined });
        } else if (entry.ackedVersion <= version) {
          await this.db.outbox.delete(entry.seq); // confirmed: its rows are here
          touchedBy([entry.mutation], touched);
        } else if (snapshot) {
          // The server is behind its own ack (reset database): send it again.
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
    const serverExceptions = await this.db.serverIncludeExceptions
      .where('spaceId')
      .equals(spaceId)
      .toArray();
    let store: MemoryRowStore;
    let lists: Iterable<string>;
    let items: Iterable<string>;
    let includes: Iterable<string>;
    let includeExceptions: Iterable<string>;
    let runs: Iterable<string>;
    let runItems: Iterable<string>;
    if (!touched) {
      store = new MemoryRowStore(
        await this.db.serverLists.where('spaceId').equals(spaceId).toArray(),
        await this.db.serverItems.where('spaceId').equals(spaceId).toArray(),
        serverIncludes,
        await this.db.serverRuns.where('spaceId').equals(spaceId).toArray(),
        await this.db.serverRunItems.where('spaceId').equals(spaceId).toArray(),
        serverExceptions,
      );
      await this.db.lists.where('spaceId').equals(spaceId).delete();
      await this.db.items.where('spaceId').equals(spaceId).delete();
      await this.db.includes.where('spaceId').equals(spaceId).delete();
      await this.db.includeExceptions.where('spaceId').equals(spaceId).delete();
      await this.db.runs.where('spaceId').equals(spaceId).delete();
      await this.db.runItems.where('spaceId').equals(spaceId).delete();
      lists = [];
      items = [];
      includes = [];
      includeExceptions = [];
      runs = [];
      runItems = [];
    } else {
      const ids = touchedBy(
        pending.map((p) => p.mutation),
        {
          lists: new Set(touched.lists),
          items: new Set(touched.items),
          includes: new Set(touched.includes),
          includeExceptions: new Set(touched.includeExceptions),
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
      // An exception follows its include: removing one finds its rows by relation.
      for (const row of serverExceptions) {
        if (ids.includes.has(row.includeId)) ids.includeExceptions.add(row.id);
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
        serverExceptions,
      );
      lists = ids.lists;
      items = ids.items;
      includes = ids.includes;
      includeExceptions = ids.includeExceptions;
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
      await this.db.includeExceptions.bulkPut(
        [...store.includeExceptions.values()].filter(inSpace),
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
    const exceptionIds = [...includeExceptions];
    const exceptionChanges = changes(
      spaceId,
      exceptionIds,
      store.includeExceptions,
      await this.db.includeExceptions.bulkGet(exceptionIds),
    );
    await this.db.includeExceptions.bulkPut(exceptionChanges.put);
    await this.db.includeExceptions.bulkDelete(exceptionChanges.gone);
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

  /** Queues work nobody waits for; it is skipped once the engine is stopped. */
  private background(task: () => Promise<unknown>): void {
    void this.enqueue(async () => {
      if (!this.stopped) await task();
    });
  }

  /** Runs database work one task at a time, in order; failures go to the ErrorHandler. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.catch((error: unknown) => {
      this.log('task-failed', errorData(error));
      this.errorHandler.handleError(error);
    });
    return result;
  }
}

/** Name and message of anything thrown, for the log (no stacks, no payloads). */
function errorData(error: unknown): DiagnosticData {
  const detail = error as {
    type?: unknown;
    description?: unknown;
    data?: unknown;
  };
  return {
    name: errorName(error),
    message: error instanceof Error ? error.message : undefined,
    type: typeof detail?.type === 'string' ? detail.type : undefined,
    description: describe(detail?.description),
  };
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

/** A short text for a socket error's `description`, which may be a string, a status or an event. */
function describe(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string' || typeof value === 'number')
    return String(value);
  const event = value as {
    type?: unknown;
    message?: unknown;
    description?: unknown;
  };
  if (typeof event.message === 'string') return event.message;
  if (event.description !== undefined) return describe(event.description);
  return typeof event.type === 'string' ? `${event.type} event` : typeof value;
}
