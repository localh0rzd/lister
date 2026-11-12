import { TestBed } from '@angular/core/testing';
import { newId } from '@lister/shared/domain';
import {
  MemoryRowStore,
  type MutationInput,
  PROTOCOL_VERSION,
  type RowSet,
  applyMutation,
  parseMutation,
} from '@lister/shared/sync-protocol';
import { LOCAL_DB, LocalDb } from '@lister/web/data-access-local-db';
import { SyncEngine } from './sync-engine';
import {
  SYNC_CLOCK,
  SYNC_LOCKS,
  SYNC_SOCKET_FACTORY,
  type SyncSocket,
} from './tokens';

const SPACE = newId();
const USER = newId();

/**
 * A socket whose other end is a tiny in-memory server that applies the same shared rules as the
 * real one. Tests decide when it answers (`deliver`) and can drop the connection.
 */
class FakeServer {
  readonly store = new MemoryRowStore();
  version = 0;
  /** What the client sent, in order. */
  readonly received: [string, unknown][] = [];
  connected = false;
  connectCalls = 0;
  /** When false, pushes are recorded but not answered until `answerPushes()`. */
  autoAnswer = true;
  private readonly handlers = new Map<
    string,
    ((payload?: unknown) => void)[]
  >();
  private readonly unanswered: MutationInput[] = [];

  readonly socket = {
    connect: () => {
      this.connectCalls++;
      this.connected = true;
      this.fire('connect');
    },
    disconnect: () => {
      if (!this.connected) return;
      this.connected = false;
      this.fire('disconnect', 'io client disconnect');
    },
    on: (event: string, handler: (payload?: unknown) => void) => {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    },
    emit: (event: string, payload: unknown) => {
      this.received.push([event, payload]);
      this.handle(event, payload);
    },
  } as unknown as SyncSocket;

  fire(event: string, payload?: unknown) {
    for (const handler of this.handlers.get(event) ?? []) handler(payload);
  }

  /** The connection drops (network); the client may reconnect by itself. */
  drop(reason = 'transport close') {
    this.connected = false;
    this.fire('disconnect', reason);
  }

  sent(event: string) {
    return this.received.filter(([e]) => e === event).map(([, p]) => p);
  }

  /** A change made by another client: applied here and poked. */
  otherClient(name: string, args: object) {
    const result = this.apply({
      mutationId: newId(),
      spaceId: SPACE,
      name,
      args,
    } as MutationInput);
    return result;
  }

  answerPushes() {
    for (const mutation of this.unanswered.splice(0)) this.answer(mutation);
  }

  private handle(event: string, payload: unknown) {
    if (event === 'hello') {
      this.fire('welcome', {
        userId: USER,
        spaces: [
          { id: SPACE, name: 'Home', version: this.version, members: [] },
        ],
      });
    } else if (event === 'pull') {
      const { since } = payload as { since: number };
      const snapshot = since === 0 || since > this.version;
      const from = snapshot ? 0 : since;
      this.fire('rows', {
        spaceId: SPACE,
        version: this.version,
        snapshot,
        rows: {
          lists: [...this.store.lists.values()].filter((r) => r.version > from),
          items: [...this.store.items.values()].filter((r) => r.version > from),
        },
      });
    } else if (event === 'push') {
      for (const mutation of (payload as { mutations: MutationInput[] })
        .mutations) {
        if (this.autoAnswer) this.answer(mutation);
        else this.unanswered.push(mutation);
      }
    }
  }

  private answer(mutation: MutationInput) {
    const result = this.apply(mutation);
    if (result.kind === 'rejected') {
      this.fire('reject', {
        mutationId: mutation.mutationId,
        reason: result.reason,
      });
    } else {
      this.fire('ack', {
        mutationId: mutation.mutationId,
        version: this.version,
      });
    }
  }

  private apply(mutation: MutationInput) {
    const parsed = parseMutation(mutation);
    if (!parsed.ok) return { kind: 'rejected' as const, reason: parsed.reason };
    const result = applyMutation(
      this.store,
      { spaceId: SPACE, userId: USER, now: 1, version: this.version + 1 },
      parsed.mutation,
    );
    if (result.kind === 'changed') {
      this.version++;
      const rows: RowSet = {
        lists: result.lists.flatMap((id) => this.store.lists.get(id) ?? []),
        items: result.items.flatMap((id) => this.store.items.get(id) ?? []),
      };
      if (this.connected)
        this.fire('poke', { spaceId: SPACE, version: this.version, rows });
    }
    return result;
  }
}

let db: LocalDb;
let server: FakeServer;
let engine: SyncEngine;

function setup(options: { leader?: boolean } = {}) {
  db = new LocalDb(`test-${newId()}`);
  server = new FakeServer();
  const createSocket = vi.fn(() => server.socket);
  TestBed.configureTestingModule({
    providers: [
      { provide: LOCAL_DB, useValue: db },
      { provide: SYNC_SOCKET_FACTORY, useValue: createSocket },
      {
        provide: SYNC_LOCKS,
        useValue: {
          request: (_: string, hold: () => Promise<void>) => {
            if (options.leader !== false) void hold();
          },
        },
      },
      { provide: SYNC_CLOCK, useValue: () => 42 },
    ],
  });
  engine = TestBed.inject(SyncEngine);
  return { createSocket };
}

afterEach(async () => {
  vi.useRealTimers();
  TestBed.resetTestingModule();
  await db.delete();
});

/** Waits for the engine's queued work (and the outbox watcher it triggers) to settle. */
async function settle() {
  for (let i = 0; i < 5; i++) {
    await engine.whenIdle();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await engine.whenIdle();
}

const visibleList = (id: string) => db.lists.get(id);
const serverList = (id: string) => db.serverLists.get(id);
const outbox = () => db.outbox.toArray();

async function createList(title = 'Camping') {
  const id = newId();
  expect(
    await engine.mutate({
      spaceId: SPACE,
      name: 'list.create',
      args: { id, title },
    }),
  ).toEqual({ ok: true });
  return id;
}

describe('SyncEngine', () => {
  describe('offline', () => {
    it('applies a change locally at once and queues it', async () => {
      setup();

      const id = await createList();

      expect(await visibleList(id)).toMatchObject({
        title: 'Camping',
        spaceId: SPACE,
      });
      expect(await serverList(id)).toBeUndefined();
      expect((await outbox()).map((e) => e.mutation.name)).toEqual([
        'list.create',
      ]);
      await vi.waitFor(() => {
        TestBed.tick();
        expect(engine.pendingCount()).toBe(1);
      });
      expect(server.received).toEqual([]);
      expect(engine.online()).toBe(false);
    });

    it('refuses a change the shared rules reject, without queueing it', async () => {
      setup();

      const result = await engine.mutate({
        spaceId: SPACE,
        name: 'list.update',
        args: { id: newId(), patch: { title: 'x' } },
      });

      expect(result).toEqual({ ok: false, reason: "This list doesn't exist" });
      expect(await outbox()).toEqual([]);
    });

    it('refuses invalid input with the schema reason', async () => {
      setup();

      const result = await engine.mutate({
        spaceId: SPACE,
        name: 'list.create',
        args: { id: newId(), title: ' ' },
      } as never);

      expect(result).toEqual({
        ok: false,
        reason: 'A title is required (args.title)',
      });
    });
  });

  describe('connecting', () => {
    it('says hello, pulls, then flushes the outbox in order', async () => {
      setup();
      const first = await createList('One');
      const second = await createList('Two');

      engine.start();
      await settle();

      expect(server.received.map(([event]) => event)).toEqual([
        'hello',
        'pull',
        'push',
      ]);
      expect(server.sent('hello')[0]).toMatchObject({
        protocolVersion: PROTOCOL_VERSION,
      });
      expect(server.sent('pull')[0]).toEqual({ spaceId: SPACE, since: 0 });
      expect(
        (
          server.sent('push')[0] as { mutations: MutationInput[] }
        ).mutations.map((m) => m.args.id),
      ).toEqual([first, second]);
      expect(engine.online()).toBe(true);
    });

    it('drops confirmed changes from the outbox and keeps the server copy', async () => {
      setup();
      const id = await createList();

      engine.start();
      await settle();

      expect(await outbox()).toEqual([]);
      expect(await serverList(id)).toMatchObject({
        title: 'Camping',
        version: 1,
      });
      expect(await visibleList(id)).toEqual(await serverList(id));
      expect(await db.syncState.get(SPACE)).toMatchObject({ version: 1 });
      expect(engine.syncing()).toBe(false);
      TestBed.tick();
      await vi.waitFor(() => {
        TestBed.tick();
        expect(engine.pendingCount()).toBe(0);
      });
      expect(engine.lastSyncedAt()).toBe(42);
    });

    it('keeps the same client id across connections', async () => {
      setup();
      engine.start();
      await settle();
      server.drop();
      server.socket.connect();
      await settle();

      const [first, second] = server.sent('hello') as { clientId: string }[];
      expect(second.clientId).toBe(first.clientId);
    });
  });

  describe('while online', () => {
    it('pushes a new change right away and confirms it', async () => {
      setup();
      engine.start();
      await settle();

      const id = await createList();
      await settle();

      expect(server.sent('push')).toHaveLength(1);
      expect(await outbox()).toEqual([]);
      expect(await serverList(id)).toMatchObject({ version: 1 });
    });

    it('applies pokes from other clients', async () => {
      setup();
      engine.start();
      await settle();

      const id = newId();
      server.otherClient('list.create', { id, title: 'From Ben' });
      await settle();

      expect(await visibleList(id)).toMatchObject({ title: 'From Ben' });
      expect(await db.syncState.get(SPACE)).toMatchObject({ version: 1 });
    });

    it('pulls when a poke reveals a gap', async () => {
      setup();
      engine.start();
      await settle();
      server.otherClient('list.create', { id: newId(), title: 'Seen' });
      await settle();

      // Two changes happen; the client only hears about the second one.
      server.connected = false;
      const missed = newId();
      server.otherClient('list.create', { id: missed, title: 'Missed' });
      server.connected = true;
      server.otherClient('list.create', { id: newId(), title: 'Later' });
      await settle();

      expect(server.sent('pull').at(-1)).toEqual({ spaceId: SPACE, since: 1 });
      expect(await visibleList(missed)).toMatchObject({ title: 'Missed' });
      expect(await db.syncState.get(SPACE)).toMatchObject({ version: 3 });
    });

    it('rolls a rejected change back and reports why', async () => {
      setup();
      engine.start();
      await settle();
      const id = await createList();
      await settle();
      // The server refuses whatever comes next.
      server.otherClient('list.delete', { id });
      await settle();
      server.autoAnswer = false;

      await engine.mutate({
        spaceId: SPACE,
        name: 'list.restore',
        args: { id },
      });
      expect(await visibleList(id)).toMatchObject({ deletedAt: null });
      await settle(); // the push goes out
      server.store.lists.delete(id); // makes the server reject the restore
      server.answerPushes();
      await settle();

      expect(await visibleList(id)).toMatchObject({ deletedAt: 1 });
      expect(await outbox()).toEqual([]);
      expect(engine.errors()).toEqual([
        {
          mutationId: expect.any(String),
          reason: "This list doesn't exist",
          at: 42,
        },
      ]);
      engine.dismissError(engine.errors()[0].mutationId);
      expect(engine.errors()).toEqual([]);
    });

    it('rebases pending changes on top of incoming server rows', async () => {
      setup();
      engine.start();
      await settle();
      const id = await createList('Camping');
      await settle();
      server.autoAnswer = false;

      await engine.mutate({
        spaceId: SPACE,
        name: 'list.update',
        args: { id, patch: { title: 'Mine' } },
      });
      server.otherClient('list.update', {
        id,
        patch: { description: 'From Ben' },
      });
      await settle();

      expect(await serverList(id)).toMatchObject({
        title: 'Camping',
        description: 'From Ben',
      });
      expect(await visibleList(id)).toMatchObject({
        title: 'Mine',
        description: 'From Ben',
      });

      server.answerPushes();
      await settle();
      expect(await visibleList(id)).toMatchObject({
        title: 'Mine',
        description: 'From Ben',
      });
      expect(await outbox()).toEqual([]);
    });
  });

  describe('connection trouble', () => {
    it('queues changes while offline and flushes them on reconnect', async () => {
      setup();
      engine.start();
      await settle();
      server.drop();
      expect(engine.online()).toBe(false);

      const id = await createList();
      await settle();
      expect(server.sent('push')).toHaveLength(0);

      server.socket.connect();
      await settle();

      expect(server.sent('push')).toHaveLength(1);
      expect(server.sent('pull').at(-1)).toEqual({ spaceId: SPACE, since: 0 });
      expect(await serverList(id)).toMatchObject({ title: 'Camping' });
      expect(await outbox()).toEqual([]);
    });

    it('resends an unanswered change after reconnecting; the server applies it once', async () => {
      setup();
      engine.start();
      await settle();
      server.autoAnswer = false;
      await createList();
      await settle();
      expect(server.sent('push')).toHaveLength(1);

      server.drop();
      server.autoAnswer = true;
      server.socket.connect();
      await settle();

      const pushes = server.sent('push') as { mutations: MutationInput[] }[];
      expect(pushes).toHaveLength(2);
      expect(pushes[1].mutations[0].mutationId).toBe(
        pushes[0].mutations[0].mutationId,
      );
      expect(server.version).toBe(1);
      expect(await outbox()).toEqual([]);
    });

    it('reconnects with backoff after the server disconnects it', async () => {
      setup();
      engine.start();
      await settle();
      vi.useFakeTimers();

      server.drop('io server disconnect');
      expect(server.connectCalls).toBe(1);
      vi.advanceTimersByTime(999);
      expect(server.connectCalls).toBe(1);
      vi.advanceTimersByTime(1);
      expect(server.connectCalls).toBe(2);

      server.drop('io server disconnect');
      vi.advanceTimersByTime(1999);
      expect(server.connectCalls).toBe(2);
      vi.advanceTimersByTime(1);
      expect(server.connectCalls).toBe(3);
    });

    it('stops after updateRequired and says so', async () => {
      setup();
      engine.start();
      await settle();
      vi.useFakeTimers();

      server.fire('updateRequired', { protocolVersion: PROTOCOL_VERSION + 1 });
      server.drop('io server disconnect');
      vi.advanceTimersByTime(60_000);

      expect(engine.updateRequired()).toBe(true);
      expect(server.connectCalls).toBe(1);
    });
  });

  describe('tabs', () => {
    it('does not connect without the sync lock (another tab syncs)', async () => {
      const { createSocket } = setup({ leader: false });

      engine.start();
      const id = await createList();

      expect(createSocket).not.toHaveBeenCalled();
      expect(await visibleList(id)).toBeDefined();
      expect(await outbox()).toHaveLength(1);
    });

    it('pushes changes another tab put in the outbox', async () => {
      setup();
      engine.start();
      await settle();
      const id = newId();

      // Another tab's write: straight into the shared database.
      await db.outbox.add({
        mutationId: newId(),
        spaceId: SPACE,
        mutation: {
          mutationId: newId(),
          spaceId: SPACE,
          name: 'list.create',
          args: { id, title: 'From tab 2' },
        },
        createdAt: 1,
      });
      await settle();

      expect(server.sent('push')).toHaveLength(1);
    });
  });
});
