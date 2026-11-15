import {
  EnvironmentInjector,
  ErrorHandler,
  createEnvironmentInjector,
} from '@angular/core';
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
import { USER_STORAGE_KEY } from '@lister/web/data-access-auth';
import { LOCAL_DB, LocalDb } from '@lister/web/data-access-local-db';
import { ERROR_LOG_SIZE, SyncEngine } from './sync-engine';
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
  /** Like Socket.IO between reconnect attempts: connect() does nothing until disconnect(). */
  backingOff = false;
  /** Whom the session cookie belongs to: the user the welcome names. */
  userId = USER;
  /** When true, a hello is recorded but not welcomed until `welcome()` (a slow handshake). */
  holdWelcome = false;
  private readonly handlers = new Map<
    string,
    ((payload?: unknown) => void)[]
  >();
  private readonly unanswered: MutationInput[] = [];

  readonly socket = ((server: FakeServer) => ({
    get connected() {
      return server.connected;
    },
    io: { engine: { close: () => server.drop('transport close') } },
    connect: () => {
      this.connectCalls++;
      if (this.backingOff) return;
      this.connected = true;
      this.fire('connect');
    },
    disconnect: () => {
      this.backingOff = false; // cancels the pending reconnect attempt
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
  }))(this) as unknown as SyncSocket;

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

  welcome() {
    this.fire('welcome', {
      userId: this.userId,
      spaces: [{ id: SPACE, name: 'Home', version: this.version, members: [] }],
    });
  }

  private handle(event: string, payload: unknown) {
    if (event === 'hello') {
      if (this.holdWelcome) return;
      this.fire('welcome', {
        userId: this.userId,
        spaces: [
          { id: SPACE, name: 'Home', version: this.version, members: [] },
        ],
      });
    } else if (event === 'pull') {
      const { since, spaceId } = payload as { since: number; spaceId: string };
      if (spaceId !== SPACE) {
        // Any other space is at version 3 with nothing new.
        this.fire('rows', {
          spaceId,
          version: 3,
          snapshot: false,
          rows: { lists: [], items: [], includes: [], runs: [], runItems: [] },
        });
        return;
      }
      const snapshot = since === 0 || since > this.version;
      const from = snapshot ? 0 : since;
      this.fire('rows', {
        spaceId: SPACE,
        version: this.version,
        snapshot,
        rows: {
          lists: [...this.store.lists.values()].filter((r) => r.version > from),
          items: [...this.store.items.values()].filter((r) => r.version > from),
          includes: [...this.store.includes.values()].filter(
            (r) => r.version > from,
          ),
          runs: [...this.store.runs.values()].filter((r) => r.version > from),
          runItems: [...this.store.runItems.values()].filter(
            (r) => r.version > from,
          ),
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
        includes: result.includes.flatMap(
          (id) => this.store.includes.get(id) ?? [],
        ),
        runs: result.runs.flatMap((id) => this.store.runs.get(id) ?? []),
        runItems: result.runItems.flatMap(
          (id) => this.store.runItems.get(id) ?? [],
        ),
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

function setup(options: { leader?: boolean; database?: LocalDb } = {}) {
  db = options.database ?? new LocalDb(`test-${newId()}`);
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

/** Waits until `check` passes (signals fed by the local database update asynchronously). */
async function eventually(check: () => void) {
  await vi.waitFor(() => {
    TestBed.tick();
    check();
  });
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
        reason: 'A title is required',
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
        ).mutations.map((m) => (m.args as { id: string }).id),
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
      await eventually(() =>
        expect(engine.errors()).toEqual([
          {
            mutationId: expect.any(String),
            reason: "This list doesn't exist",
            at: 42,
          },
        ]),
      );
      await engine.dismissError(engine.errors()[0].mutationId);
      await eventually(() => expect(engine.errors()).toEqual([]));
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

  describe('rebuilding only what changed', () => {
    it('keeps a pending change on one list while a poke updates another', async () => {
      setup();
      engine.start();
      await settle();
      const mine = await createList('Camping');
      await settle();
      server.autoAnswer = false;

      await engine.mutate({
        spaceId: SPACE,
        name: 'list.update',
        args: { id: mine, patch: { title: 'Mine' } },
      });
      const theirs = newId();
      server.otherClient('list.create', { id: theirs, title: 'From Ben' });
      await settle();

      expect(await visibleList(mine)).toMatchObject({ title: 'Mine' });
      expect(await visibleList(theirs)).toMatchObject({ title: 'From Ben' });
    });

    it("leaves another space's rows alone when an id appears in two spaces", async () => {
      setup({ leader: false });
      engine.start();
      const id = await createList('Mine');
      const mine = await visibleList(id);
      if (!mine) throw new Error('not created');
      const other = { ...mine, id: newId(), spaceId: newId() };
      await db.serverLists.put(other);
      await db.lists.put(other);

      // A pending change in this space names the other space's id.
      const mutationId = newId();
      await db.outbox.add({
        mutationId,
        spaceId: SPACE,
        mutation: {
          mutationId,
          spaceId: SPACE,
          name: 'list.update',
          args: { id: other.id, patch: { title: 'Wrong space' } },
        },
        createdAt: 1,
      });
      await engine.mutate({
        spaceId: SPACE,
        name: 'list.update',
        args: { id, patch: { title: 'Renamed' } },
      });

      expect(await visibleList(other.id)).toEqual(other);
      expect(await visibleList(id)).toMatchObject({ title: 'Renamed' });
    });

    it('removes an item whose create the server rejects', async () => {
      setup();
      engine.start();
      await settle();
      const listId = await createList();
      await settle();
      server.autoAnswer = false;

      const id = newId();
      await engine.mutate({
        spaceId: SPACE,
        name: 'item.create',
        args: { id, listId, title: 'Tent', position: 'a0' },
      });
      expect(await db.items.get(id)).toMatchObject({ title: 'Tent' });
      await settle();
      server.store.lists.delete(listId); // makes the server reject the create
      server.answerPushes();
      await settle();

      expect(await db.items.get(id)).toBeUndefined();
      expect(await visibleList(listId)).toMatchObject({ title: 'Camping' });
    });
  });

  describe('includes', () => {
    const include = (parentListId: string, childListId: string) => ({
      spaceId: SPACE,
      name: 'include.create' as const,
      args: { id: newId(), parentListId, childListId, position: 'a1' },
    });

    it('includes a list locally, syncs it, and removes it again', async () => {
      setup();
      engine.start();
      await settle();
      const trip = await createList('Trip');
      const camping = await createList('Camping');
      const create = include(trip, camping);

      expect(await engine.mutate(create)).toEqual({ ok: true });
      expect(await db.includes.get(create.args.id)).toMatchObject({
        parentListId: trip,
        childListId: camping,
      });
      await settle();
      expect(await db.serverIncludes.get(create.args.id)).toBeDefined();

      // The prediction store has the include, so removing it isn't refused locally.
      expect(
        await engine.mutate({
          spaceId: SPACE,
          name: 'include.delete',
          args: { id: create.args.id },
        }),
      ).toEqual({ ok: true });
      expect(await db.includes.get(create.args.id)).toMatchObject({
        deletedAt: expect.any(Number),
      });
      await settle();
      expect(await outbox()).toEqual([]);
    });

    it('refuses a loop locally', async () => {
      setup({ leader: false });
      engine.start();
      const a = await createList('A');
      const b = await createList('B');
      await engine.mutate(include(a, b));

      expect(await engine.mutate(include(b, a))).toEqual({
        ok: false,
        reason: 'That would make a loop: “A” already contains “B”',
      });
    });

    it('rolls back an offline half of a loop when the other half wins on the server', async () => {
      setup();
      engine.start();
      await settle();
      const a = await createList('A');
      const b = await createList('B');
      await settle();
      server.autoAnswer = false;

      const mine = include(a, b);
      await engine.mutate(mine);
      // Ben's half reaches the server first; the poke makes my pending half a loop.
      const theirs = include(b, a).args;
      server.otherClient('include.create', theirs);
      await settle();
      expect(await db.includes.get(theirs.id)).toBeDefined();
      expect(await db.includes.get(mine.args.id)).toBeUndefined();

      server.answerPushes();
      await settle();
      expect(await db.includes.get(mine.args.id)).toBeUndefined();
      await eventually(() =>
        expect(engine.errors()).toEqual([
          expect.objectContaining({
            reason: 'That would make a loop: “B” already contains “A”',
          }),
        ]),
      );
    });

    it('rebuilds an include when a poke changes its list', async () => {
      setup();
      engine.start();
      await settle();
      const a = await createList('A');
      const b = await createList('B');
      const create = include(a, b);
      await engine.mutate(create);
      await settle();
      server.autoAnswer = false;
      await engine.mutate({
        spaceId: SPACE,
        name: 'include.move',
        args: { id: create.args.id, position: 'a5' },
      });

      server.otherClient('list.delete', { id: a });
      await settle();
      // My pending move on an include of a deleted list has no effect (delete wins).
      expect(await db.includes.get(create.args.id)).toMatchObject({
        position: 'a1',
      });
    });
  });

  describe('list.duplicate', () => {
    it('shows the whole copy at once and keeps it through a poke for the source', async () => {
      setup();
      engine.start();
      await settle();
      const source = await createList('Camping');
      const tent = newId();
      await engine.mutate({
        spaceId: SPACE,
        name: 'item.create',
        args: { id: tent, listId: source, title: 'Tent', position: 'a0' },
      });
      await settle();
      server.autoAnswer = false;

      const copy = newId();
      const tentCopy = newId();
      expect(
        await engine.mutate({
          spaceId: SPACE,
          name: 'list.duplicate',
          args: {
            id: copy,
            sourceListId: source,
            title: 'Copy of Camping',
            items: [{ from: tent, id: tentCopy }],
            includes: [],
          },
        }),
      ).toEqual({ ok: true });
      expect(await visibleList(copy)).toMatchObject({
        title: 'Copy of Camping',
      });
      expect(await db.items.get(tentCopy)).toMatchObject({
        listId: copy,
        title: 'Tent',
      });
      expect(await outbox()).toHaveLength(1); // one change, not one per row

      // Someone renames the source's Tent meanwhile: the pending copy is rebuilt from it.
      server.otherClient('item.update', {
        id: tent,
        patch: { title: 'Big tent' },
      });
      await settle();
      expect(await db.items.get(tentCopy)).toMatchObject({ title: 'Big tent' });

      server.answerPushes();
      await settle();
      expect(await outbox()).toEqual([]);
      expect(await db.serverItems.get(tentCopy)).toMatchObject({
        listId: copy,
        title: 'Big tent',
      });
    });
  });

  describe('runs', () => {
    async function startRun(titles: string[]) {
      const runId = newId();
      const items = titles.map((title) => ({ id: newId(), title }));
      expect(
        await engine.mutate({
          spaceId: SPACE,
          name: 'run.start',
          args: { id: runId, title: 'Shop', items },
        }),
      ).toEqual({ ok: true });
      return { runId, ids: items.map((i) => i.id) };
    }

    it('starts a run offline and shows its merged items at once', async () => {
      setup({ leader: false });
      engine.start();
      const runId = newId();
      await engine.mutate({
        spaceId: SPACE,
        name: 'run.start',
        args: {
          id: runId,
          title: 'Shop',
          items: [
            { id: newId(), title: 'Milk' },
            { id: newId(), title: 'milk', quantity: '2' },
          ],
        },
      });

      expect(await db.runs.get(runId)).toMatchObject({ title: 'Shop' });
      const items = (
        await db.runItems.where('runId').equals(runId).toArray()
      ).filter((i) => i.deletedAt === null); // not the merged-away alias
      expect(items.map((i) => [i.title, i.quantity])).toEqual([['Milk', '2']]);
      expect(await outbox()).toHaveLength(1);
    });

    it("finishes a run locally when another person's check of the last item arrives", async () => {
      setup();
      engine.start();
      await settle();
      const { runId, ids } = await startRun(['Milk', 'Bread']);
      await settle();
      server.autoAnswer = false;
      // My check is still pending when Ben checks the other item.
      await engine.mutate({
        spaceId: SPACE,
        name: 'runItem.setState',
        args: { id: ids[0], state: 'checked' },
      });
      expect((await db.runs.get(runId))?.finishedAt).toBeNull();

      server.otherClient('runItem.setState', { id: ids[1], state: 'checked' });
      await settle();
      // Rebased: Ben's check (server) plus mine (pending) finish the run here already.
      expect((await db.runs.get(runId))?.finishedAt).not.toBeNull();

      server.answerPushes();
      await settle();
      expect((await db.serverRuns.get(runId))?.finishedAt).not.toBeNull();
      expect(await outbox()).toEqual([]);
    });

    it('keeps a run open while an item nobody touched is still unchecked', async () => {
      setup();
      engine.start();
      await settle();
      const { runId, ids } = await startRun(['Milk', 'Bread', 'Eggs']);
      await settle();
      server.autoAnswer = false;
      await engine.mutate({
        spaceId: SPACE,
        name: 'runItem.setState',
        args: { id: ids[0], state: 'checked' },
      });

      // Ben checks Bread; Eggs is touched by nobody and still unchecked.
      server.otherClient('runItem.setState', { id: ids[1], state: 'checked' });
      await settle();

      // Only a rebuild that loads all of the run's items sees Eggs and keeps the run open.
      expect((await db.runs.get(runId))?.finishedAt).toBeNull();
    });

    it('shows a run saved as a list at once and keeps it through a poke for the run item', async () => {
      setup();
      engine.start();
      await settle();
      const { runId, ids } = await startRun(['Milk', 'Bread']);
      await settle();
      server.autoAnswer = false;

      const listId = newId();
      const [milkCopy, breadCopy] = [newId(), newId()];
      expect(
        await engine.mutate({
          spaceId: SPACE,
          name: 'run.saveAsList',
          args: {
            runId,
            listId,
            title: 'Shopping',
            items: [
              { from: ids[1], id: breadCopy },
              { from: ids[0], id: milkCopy },
            ],
          },
        }),
      ).toEqual({ ok: true });
      expect(await visibleList(listId)).toMatchObject({ title: 'Shopping' });
      expect(await db.items.get(breadCopy)).toMatchObject({
        listId,
        title: 'Bread',
      });

      // Someone renames the run's Milk meanwhile: the pending copy is rebuilt from it.
      server.otherClient('runItem.update', {
        id: ids[0],
        patch: { title: 'Oat milk' },
      });
      await settle();
      expect(await db.items.get(milkCopy)).toMatchObject({ title: 'Oat milk' });

      server.answerPushes();
      await settle();
      expect(await outbox()).toEqual([]);
      expect(await db.serverItems.get(milkCopy)).toMatchObject({ listId });
    });

    it('reopens when an item is added to a finished run', async () => {
      setup({ leader: false });
      engine.start();
      const { runId, ids } = await startRun(['Milk']);
      await engine.mutate({
        spaceId: SPACE,
        name: 'runItem.setState',
        args: { id: ids[0], state: 'checked' },
      });
      expect((await db.runs.get(runId))?.finishedAt).not.toBeNull();

      await engine.mutate({
        spaceId: SPACE,
        name: 'run.addItems',
        args: { runId, items: [{ id: newId(), title: 'Eggs' }] },
      });
      expect((await db.runs.get(runId))?.finishedAt).toBeNull();
    });
  });

  describe('connection trouble', () => {
    it('queues changes while offline and flushes them on reconnect', async () => {
      setup();
      engine.start();
      await settle();
      server.drop();
      await eventually(() => expect(engine.online()).toBe(false));

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

    it('goes offline and back with the browser, without waiting for a timeout', async () => {
      setup();
      engine.start();
      await settle();
      const drops: string[] = [];
      server.socket.on('disconnect', (reason: string) => drops.push(reason));

      window.dispatchEvent(new Event('offline'));
      await settle();
      // Only the transport closes, so Socket.IO's own reconnect loop keeps going.
      expect(drops).toEqual(['transport close']);
      await eventually(() => expect(engine.online()).toBe(false));

      // Socket.IO is waiting out its backoff, where connect() alone would do nothing.
      server.backingOff = true;
      window.dispatchEvent(new Event('online'));
      await settle();
      expect(server.connected).toBe(true);
      expect(server.connectCalls).toBe(2);
      await eventually(() => expect(engine.online()).toBe(true));
    });

    describe('a refused sign-in', () => {
      const refuse = () => {
        server.connected = false;
        server.fire('connect_error', new Error('Sign in first'));
      };

      it('asks for sign-in, keeps the pending changes and keeps working offline', async () => {
        setup();
        engine.start();
        await settle();
        refuse();
        await settle();
        await eventually(() => {
          expect(engine.signInRequired()).toBe(true);
          expect(engine.online()).toBe(false);
        });

        const id = await createList('Written while signed out');
        await eventually(() => expect(engine.pendingCount()).toBe(1));

        expect((await visibleList(id))?.title).toBe('Written while signed out');
      });

      it('does not mistake another connection error for a missing session', async () => {
        setup();
        engine.start();
        await settle();
        server.connected = false;
        server.fire('connect_error', new Error('websocket error'));
        await settle();

        await eventually(() => expect(engine.signInRequired()).toBe(false));
      });

      it('tries again when the browser comes online, and sends what it kept once signed in', async () => {
        setup();
        engine.start();
        await settle();
        refuse();
        await createList('Kept');
        await settle();

        window.dispatchEvent(new Event('online'));
        await settle();

        await eventually(() => {
          expect(engine.signInRequired()).toBe(false);
          expect(engine.online()).toBe(true);
          expect(engine.pendingCount()).toBe(0);
        });
        expect(server.version).toBe(1);
      });

      it('tries again when the tab is focused, e.g. after signing in in another tab', async () => {
        setup();
        engine.start();
        await settle();
        refuse();
        await settle();

        window.dispatchEvent(new Event('focus'));
        await settle();

        await eventually(() => expect(engine.online()).toBe(true));
      });

      it('tries again when another tab signs in, without waiting for this tab to be focused', async () => {
        setup();
        engine.start();
        await settle();
        refuse();
        await createList('Kept');
        await settle();

        window.dispatchEvent(
          new StorageEvent('storage', {
            key: USER_STORAGE_KEY,
            newValue: '{"id":"someone"}',
          }),
        );
        await settle();

        await eventually(() => {
          expect(engine.online()).toBe(true);
          expect(engine.pendingCount()).toBe(0);
        });
      });

      it('ignores storage changes that are not a sign-in', async () => {
        setup();
        engine.start();
        await settle();
        refuse();
        await settle();

        window.dispatchEvent(
          new StorageEvent('storage', {
            key: 'lister.theme',
            newValue: 'dark',
          }),
        );
        await settle();

        expect(server.connectCalls).toBe(1);
      });

      it('does not reconnect on focus while nothing was refused', async () => {
        setup();
        engine.start();
        await settle();

        window.dispatchEvent(new Event('focus'));
        await settle();

        expect(server.connectCalls).toBe(1);
      });
    });

    it('does not reconnect on "online" after the server asked for an update', async () => {
      setup();
      engine.start();
      await settle();
      server.fire('updateRequired', { protocolVersion: PROTOCOL_VERSION + 1 });
      server.drop('io server disconnect');

      window.dispatchEvent(new Event('online'));
      await settle();

      expect(server.connectCalls).toBe(1);
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
      expect(server.connectCalls).toBe(1);

      vi.useRealTimers();
      await settle();
      await eventually(() => expect(engine.updateRequired()).toBe(true));
    });

    it('keeps backing off while the server welcomes but drops every push', async () => {
      setup();
      engine.start();
      await settle();
      vi.useFakeTimers();

      // Each reconnect gets a welcome, then the server drops the connection again.
      for (const delay of [1000, 2000, 4000]) {
        server.fire('welcome', { userId: USER, spaces: [] });
        server.drop('io server disconnect');
        const before = server.connectCalls;
        vi.advanceTimersByTime(delay - 1);
        expect(server.connectCalls).toBe(before);
        vi.advanceTimersByTime(1);
        expect(server.connectCalls).toBe(before + 1);
      }
    });
  });

  describe('spaces', () => {
    it('drops a space the server no longer welcomes, with its rows, sync position and pending changes', async () => {
      setup();
      engine.start();
      await settle();
      const synced = await createList('Synced');
      await settle();
      const other = newId();
      await db.spaces.put({
        id: other,
        name: 'Other',
        version: 0,
        members: [],
      });
      await db.lists.put({
        id: newId(),
        spaceId: other,
        title: 'Elsewhere',
      } as never);
      await db.syncState.put({ spaceId: other, version: 3, lastSyncedAt: 1 });
      server.autoAnswer = false;
      const pending = await createList('Pending');

      // The user was removed from SPACE: the next welcome lists only the other space.
      server.fire('welcome', {
        userId: USER,
        spaces: [{ id: other, name: 'Other', version: 3, members: [] }],
      });
      await settle();

      expect(await db.spaces.toArray()).toEqual([
        expect.objectContaining({ id: other }),
      ]);
      expect(await visibleList(synced)).toBeUndefined();
      expect(await serverList(synced)).toBeUndefined();
      expect(await visibleList(pending)).toBeUndefined();
      expect(await db.syncState.get(SPACE)).toBeUndefined();
      expect(await outbox()).toEqual([]);
      expect(await db.lists.where('spaceId').equals(other).count()).toBe(1);
    });

    it("wipes the previous user's data, pending changes included, when somebody else is welcomed", async () => {
      setup();
      engine.start();
      await settle();
      const synced = await createList('Anna’s');
      await settle();
      server.autoAnswer = false;
      await createList('Anna’s, not synced');
      await settle();
      server.drop();
      await settle();
      const pushesBefore = server.sent('push').length;

      // Somebody else signed in on this device, and the connection came back with their session
      // before the sign-in page wiped the device. Both are members of SPACE.
      server.userId = newId();
      server.autoAnswer = true;
      server.socket.connect();
      await settle();

      await eventually(() => expect(engine.online()).toBe(true));
      expect(await outbox()).toEqual([]);
      expect(server.sent('push')).toHaveLength(pushesBefore);
      expect(await db.meta.get('userId')).toEqual({
        key: 'userId',
        value: server.userId,
      });
      // The space is synced afresh for the new user.
      expect(await visibleList(synced)).toEqual(
        expect.objectContaining({ title: 'Anna’s' }),
      );
    });

    it('syncs every space the server welcomes', async () => {
      setup();
      engine.start();
      await settle();
      const second = newId();

      server.fire('welcome', {
        userId: USER,
        spaces: [
          { id: SPACE, name: 'Home', version: 0, members: [] },
          { id: second, name: 'Trips', version: 0, members: [] },
        ],
      });
      await settle();

      expect(
        (await db.spaces.toArray()).map((space) => space.id).sort(),
      ).toEqual([SPACE, second].sort());
      expect(
        server
          .sent('pull')
          .map((pull) => (pull as { spaceId: string }).spaceId),
      ).toContain(second);
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
      const mutationId = newId();
      await db.outbox.add({
        mutationId,
        spaceId: SPACE,
        mutation: {
          mutationId,
          spaceId: SPACE,
          name: 'list.create',
          args: { id, title: 'From tab 2' },
        },
        createdAt: 1,
      });
      await settle();

      expect(server.sent('push')).toHaveLength(1);
      expect(await outbox()).toEqual([]);
      expect(await serverList(id)).toMatchObject({ title: 'From tab 2' });
    });

    it('shows every tab the same status, rejections and last sync', async () => {
      setup();
      engine.start();
      await settle();
      const leader = engine;
      const id = await createList();
      await settle();

      // A second tab: its own engine on the same database, without the lock.
      const otherTab = createEnvironmentInjector(
        [
          { provide: SyncEngine, useClass: SyncEngine },
          { provide: SYNC_LOCKS, useValue: { request: () => undefined } },
        ],
        TestBed.inject(EnvironmentInjector),
      ).get(SyncEngine);
      otherTab.start();
      expect(otherTab).not.toBe(leader);
      engine = otherTab;

      await eventually(() => {
        expect(engine.online()).toBe(true);
        expect(engine.lastSyncedAt()).toBe(42);
      });
      await db.rejections.put({
        mutationId: newId(),
        reason: 'Refused',
        at: 1,
      });
      await eventually(() =>
        expect(engine.errors().map((e) => e.reason)).toEqual(['Refused']),
      );
      expect(await visibleList(id)).toBeDefined();
    });
  });

  describe('error log', () => {
    it('keeps a dismissed refusal in the log, and trims it to the latest ones', async () => {
      setup();
      engine.start();
      await settle();
      for (let i = 0; i < ERROR_LOG_SIZE + 3; i++)
        await db.rejections.put({
          mutationId: `m${i}`,
          reason: `R${i}`,
          at: i,
        });

      await eventually(() =>
        expect(engine.errors()).toHaveLength(ERROR_LOG_SIZE + 3),
      );
      for (let i = 0; i < ERROR_LOG_SIZE + 3; i++)
        await engine.dismissError(`m${i}`);

      await eventually(() => expect(engine.errors()).toEqual([]));
      expect(engine.errorLog().map((e) => e.reason)).toEqual(
        Array.from({ length: ERROR_LOG_SIZE }, (_, i) => `R${i + 3}`),
      );
    });

    it('keeps every dismissed refusal while the log holds fewer than the limit', async () => {
      setup();
      engine.start();
      await settle();
      const count = ERROR_LOG_SIZE - 5;
      for (let i = 0; i < count; i++)
        await db.rejections.put({
          mutationId: `m${i}`,
          reason: `R${i}`,
          at: i,
          seen: true,
        });
      await db.rejections.put({ mutationId: 'new', reason: 'New', at: 100 });

      await engine.dismissError('new');

      await eventually(() => expect(engine.errors()).toEqual([]));
      expect(engine.errorLog()).toHaveLength(count + 1);
    });

    it('clears the log', async () => {
      setup();
      engine.start();
      await settle();
      await db.rejections.put({ mutationId: 'a', reason: 'R', at: 1 });
      await eventually(() => expect(engine.errorLog()).toHaveLength(1));

      await engine.clearErrorLog();

      await eventually(() => expect(engine.errorLog()).toEqual([]));
    });
  });

  describe('sync now', () => {
    it('pulls the space again and pushes pending changes when online', async () => {
      setup();
      engine.start();
      await settle();
      const pulls = () =>
        server.received.filter(([event]) => event === 'pull').length;
      const before = pulls();

      await engine.syncNow();

      await eventually(() => expect(pulls()).toBe(before + 1));
    });

    it('does not pull again for unrelated database changes', async () => {
      setup();
      engine.start();
      await settle();
      const pulls = () =>
        server.received.filter(([event]) => event === 'pull').length;
      const before = pulls();

      await db.meta.put({ key: 'other', value: '1' });
      await createList('Something');
      await settle();

      expect(pulls()).toBe(before);
    });

    it('reconnects at once when offline, skipping the backoff', async () => {
      setup();
      engine.start();
      await settle();
      server.drop('io server disconnect');
      server.backingOff = true;
      expect(server.connectCalls).toBe(1);

      await engine.syncNow();
      await settle();
      expect(server.connectCalls).toBe(2);

      await eventually(() => {
        expect(server.connectCalls).toBe(2);
        expect(engine.online()).toBe(true);
      });
    });

    it('works from a tab that does not hold the sync lock', async () => {
      setup();
      engine.start();
      await settle();
      const otherTab = createEnvironmentInjector(
        [
          { provide: SyncEngine, useClass: SyncEngine },
          { provide: SYNC_LOCKS, useValue: { request: () => undefined } },
        ],
        TestBed.inject(EnvironmentInjector),
      ).get(SyncEngine);
      const pulls = () =>
        server.received.filter(([event]) => event === 'pull').length;
      const before = pulls();

      await otherTab.syncNow();

      await eventually(() => expect(pulls()).toBe(before + 1));
    });

    it('leaves the pulls to the welcome while the handshake runs', async () => {
      setup();
      engine.start();
      await settle();
      // A space this device knew, which the user has left in the meantime.
      await db.spaces.put({ id: 'gone', name: 'Old', version: 0, members: [] });
      server.drop('transport close');
      server.holdWelcome = true;
      server.socket.connect();
      await settle();
      const pullsBefore = server.sent('pull').length;

      await engine.syncNow();
      await settle();
      expect(server.sent('pull')).toHaveLength(pullsBefore);

      server.welcome();
      await settle();
      expect(server.sent('pull').slice(pullsBefore)).toEqual([
        { spaceId: SPACE, since: expect.any(Number) },
      ]);
    });

    it('does nothing once an update is required', async () => {
      setup();
      engine.start();
      await settle();
      server.fire('updateRequired', { protocolVersion: PROTOCOL_VERSION + 1 });
      server.drop('io server disconnect');
      await eventually(() => expect(engine.updateRequired()).toBe(true));

      await engine.syncNow();
      await settle();

      expect(server.connectCalls).toBe(1);
    });
  });

  describe('ordering edge cases', () => {
    it('keeps an acked change until its rows arrive, then drops it', async () => {
      setup();
      engine.start();
      await settle();
      server.otherClient('list.create', { id: newId(), title: 'Seen' });
      await settle();

      // The poke for our own change goes missing; only the ack arrives.
      server.connected = false;
      const id = await createList('Mine');
      server.connected = true;
      const push = server.sent('push').at(-1) as
        { mutations: MutationInput[] } | undefined;
      expect(push).toBeUndefined(); // offline: nothing pushed yet
      server.autoAnswer = false;
      server.socket.connect();
      await settle();
      server.connected = false; // swallow the poke…
      server.answerPushes();
      server.connected = true; // …but the ack still arrives
      await settle();

      const [entry] = await outbox();
      expect(entry).toMatchObject({ ackedVersion: 2 });
      await vi.waitFor(() => expect(engine.pendingCount()).toBe(1));

      // A later poke (version 3) reveals the gap; the pull brings version 2 and settles it.
      server.otherClient('list.create', { id: newId(), title: 'Later' });
      await settle();

      expect(await outbox()).toEqual([]);
      expect(await serverList(id)).toMatchObject({ title: 'Mine', version: 2 });
    });

    it('pulls only once while a gap is being filled', async () => {
      setup();
      engine.start();
      await settle();
      server.autoAnswer = true;
      const pullsBefore = server.sent('pull').length;
      // Pokes far ahead, with the pull still unanswered.
      const socket = server.socket as unknown as {
        emit: (event: string, payload: unknown) => void;
      };
      const original = socket.emit;
      const held: unknown[] = [];
      socket.emit = (event, payload) => {
        if (event === 'pull') held.push(payload);
        else original(event, payload);
      };
      for (const version of [5, 6, 7]) {
        server.fire('poke', {
          spaceId: SPACE,
          version,
          rows: { lists: [], items: [] },
        });
      }
      await settle();

      expect(held).toHaveLength(1);
      expect(server.sent('pull')).toHaveLength(pullsBefore);
    });

    it('ignores a malformed server message', async () => {
      const { createSocket } = setup();
      const handleError = vi.fn();
      TestBed.inject(ErrorHandler).handleError = handleError;
      engine.start();
      await settle();
      expect(createSocket).toHaveBeenCalled();

      server.fire('rows', { spaceId: 'not-an-id', version: -1 });
      await settle();

      expect(handleError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('invalid "rows"'),
        }),
      );
      expect(await db.syncState.get(SPACE)).toMatchObject({ version: 0 });
    });

    it('drops fields a newer server adds before storing rows', async () => {
      setup();
      engine.start();
      await settle();
      const id = newId();
      server.otherClient('list.create', { id, title: 'Camping' });
      await settle();
      const row = await serverList(id);

      server.fire('poke', {
        spaceId: SPACE,
        version: 2,
        rows: {
          lists: [{ ...row, version: 2, icon: 'tent' }],
          items: [],
          includes: [],
        },
      });
      await settle();

      expect(await serverList(id)).not.toHaveProperty('icon');
      expect(await visibleList(id)).toMatchObject({ version: 2 });
    });

    it('sends a change again when a snapshot shows the server lost it (restored database)', async () => {
      setup();
      engine.start();
      await settle();
      const mutationId = newId();
      await db.outbox.add({
        mutationId,
        spaceId: SPACE,
        mutation: {
          mutationId,
          spaceId: SPACE,
          name: 'list.create',
          args: { id: newId(), title: 'Lost' },
        },
        createdAt: 1,
        ackedVersion: 9,
      });

      server.fire('rows', {
        spaceId: SPACE,
        version: 0,
        snapshot: true,
        rows: { lists: [], items: [] },
      });
      await settle();

      expect(server.sent('push').at(-1)).toMatchObject({
        mutations: [{ mutationId }],
      });
    });
  });
});
