import { eq } from 'drizzle-orm';
import { schema } from '@lister/api/data-access-db';
import {
  DEV_SPACE_ID,
  DEV_WEB_ORIGIN,
  MutationService,
  SyncReader,
} from '@lister/api/feature-sync';
import { newId } from '@lister/shared/domain';
import {
  type ClientToServerEvents,
  PROTOCOL_VERSION,
  type ServerToClientEvents,
  type MutationInput,
} from '@lister/shared/sync-protocol';
import { type Socket, io } from 'socket.io-client';
import { type TestApp, createTestApp } from '../testing/create-test-app';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
type Event = keyof ServerToClientEvents;
type Payload<E extends Event> = Parameters<ServerToClientEvents[E]>[0];

let api: TestApp;
const clients: Client[] = [];

beforeEach(async () => {
  api = await createTestApp();
});
afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  await api.close();
});

/** A socket like the browser's: WebSocket only, with an Origin header. */
function connect(origin: string | null = DEV_WEB_ORIGIN): Client {
  const client: Client = io(api.url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    ...(origin ? { extraHeaders: { origin } } : {}),
  });
  clients.push(client);
  return client;
}

/** The next `event` this client receives. */
function next<E extends Event>(client: Client, event: E): Promise<Payload<E>> {
  return new Promise((resolve) =>
    (client.once as (e: string, l: (p: Payload<E>) => void) => void)(
      event,
      resolve,
    ),
  );
}

/** Collects every `event` this client receives. */
function collect<E extends Event>(client: Client, event: E): Payload<E>[] {
  const seen: Payload<E>[] = [];
  (client.on as (e: string, l: (p: Payload<E>) => void) => void)(event, (p) =>
    seen.push(p),
  );
  return seen;
}

async function helloed(origin?: string) {
  const client = connect(origin);
  const welcome = next(client, 'welcome');
  client.emit('hello', {
    protocolVersion: PROTOCOL_VERSION,
    clientId: newId(),
  });
  return { client, welcome: await welcome };
}

const mutation = (
  name: MutationInput['name'],
  args: Record<string, unknown>,
): MutationInput =>
  ({ mutationId: newId(), spaceId: DEV_SPACE_ID, name, args }) as MutationInput;

describe('sync gateway', () => {
  describe('handshake', () => {
    it('welcomes a client with its spaces', async () => {
      const { welcome } = await helloed();

      expect(welcome.spaces).toEqual([
        expect.objectContaining({ id: DEV_SPACE_ID, name: 'Home', version: 0 }),
      ]);
    });

    it('asks an outdated client to update, then disconnects it', async () => {
      const client = connect();
      const answer = next(client, 'updateRequired');
      const gone = new Promise((resolve) => client.once('disconnect', resolve));

      client.emit('hello', {
        protocolVersion: PROTOCOL_VERSION + 1,
        clientId: newId(),
      });

      expect(await answer).toEqual({ protocolVersion: PROTOCOL_VERSION });
      await gone;
    });

    it.each([
      ['a foreign origin', 'https://evil.example'],
      ['no origin', null],
    ])('refuses %s', async (_, origin) => {
      const client = connect(origin);

      const error = await new Promise<Error>((resolve) =>
        client.once('connect_error', resolve),
      );

      expect(error).toBeInstanceOf(Error);
      expect(client.connected).toBe(false);
    });

    it.each([
      ['pulls before hello', 'pull', { spaceId: DEV_SPACE_ID, since: 0 }],
      ['pushes before hello', 'push', { mutations: [] }],
      ['sends an invalid hello', 'hello', { protocolVersion: 'one' }],
    ] as const)('disconnects a client that %s', async (_, event, body) => {
      const client = connect();
      await new Promise<void>((resolve) =>
        client.once('connect', () => resolve()),
      );
      const reason = new Promise<string>((resolve) =>
        client.once('disconnect', resolve),
      );

      (client.emit as (e: string, b: unknown) => void)(event, body);

      expect(await reason).toBe('io server disconnect');
    });

    it('does not serve the Socket.IO browser bundle', async () => {
      const response = await fetch(`${api.url}/socket.io/socket.io.js`);

      expect(response.status).not.toBe(200);
    });
  });

  describe('push and poke', () => {
    it('acks a mutation and pokes the changed rows to everyone in the space', async () => {
      const a = await helloed();
      const b = await helloed();
      const pokeToA = next(a.client, 'poke');
      const pokeToB = next(b.client, 'poke');
      const ack = next(a.client, 'ack');
      const create = mutation('list.create', { id: newId(), title: 'Camping' });

      a.client.emit('push', { mutations: [create] });

      expect(await ack).toEqual({ mutationId: create.mutationId, version: 1 });
      const poke = await pokeToB;
      expect(poke).toMatchObject({ spaceId: DEV_SPACE_ID, version: 1 });
      expect(poke.rows.lists).toEqual([
        expect.objectContaining({
          id: create.args.id,
          title: 'Camping',
          version: 1,
        }),
      ]);
      expect(await pokeToA).toEqual(poke);
    });

    it('answers each mutation in order, rejecting an invalid one by id', async () => {
      const { client } = await helloed();
      const acks = collect(client, 'ack');
      const rejects = collect(client, 'reject');
      const listId = newId();
      const batch = [
        mutation('list.create', { id: listId, title: 'Camping' }),
        mutation('list.update', { id: listId, patch: { title: ' ' } }),
        mutation('item.create', {
          id: newId(),
          listId,
          title: 'Tent',
          position: 'a0',
        }),
      ];
      const lastAck = new Promise<void>((resolve) =>
        client.on(
          'ack',
          (a) => a.mutationId === batch[2].mutationId && resolve(),
        ),
      );

      client.emit('push', { mutations: batch });
      await lastAck;

      expect(acks).toEqual([
        { mutationId: batch[0].mutationId, version: 1 },
        { mutationId: batch[2].mutationId, version: 2 },
      ]);
      expect(rejects).toEqual([
        {
          mutationId: batch[1].mutationId,
          reason: 'A title is required (args.patch.title)',
        },
      ]);
    });

    it('does not apply a resent mutation twice', async () => {
      const { client } = await helloed();
      const pokes = collect(client, 'poke');
      const create = mutation('list.create', { id: newId(), title: 'Camping' });

      const first = next(client, 'ack');
      client.emit('push', { mutations: [create] });
      expect(await first).toEqual({
        mutationId: create.mutationId,
        version: 1,
      });

      const again = next(client, 'ack');
      client.emit('push', { mutations: [create] });
      expect(await again).toEqual({
        mutationId: create.mutationId,
        version: 1,
      });

      expect(pokes).toHaveLength(1);
      expect(
        api.database.db
          .select()
          .from(schema.spaces)
          .where(eq(schema.spaces.id, DEV_SPACE_ID))
          .get()?.version,
      ).toBe(1);
    });

    it('rejects mutations for a space the client is not in', async () => {
      const { client } = await helloed();
      const reject = next(client, 'reject');
      const foreign = {
        ...mutation('list.delete', { id: newId() }),
        spaceId: newId(),
      };

      client.emit('push', { mutations: [foreign] });

      expect(await reject).toEqual({
        mutationId: foreign.mutationId,
        reason: "You can't change this space",
      });
    });
  });

  describe('failures', () => {
    const disconnected = (client: Client) =>
      new Promise<string>((resolve) => client.once('disconnect', resolve));

    it.each([
      ['an empty push', { mutations: [] }],
      [
        'a push with too many mutations',
        {
          mutations: Array.from({ length: 101 }, () =>
            mutation('list.delete', { id: newId() }),
          ),
        },
      ],
      ['a push without mutation ids', { mutations: [{ name: 'list.delete' }] }],
    ])('disconnects on %s', async (_, body) => {
      const { client } = await helloed();
      const reason = disconnected(client);

      (client.emit as (e: string, b: unknown) => void)('push', body);

      expect(await reason).toBe('io server disconnect');
    });

    it('disconnects on a pull for a space the client is not in', async () => {
      const { client } = await helloed();
      const reason = disconnected(client);

      client.emit('pull', { spaceId: newId(), since: 0 });

      expect(await reason).toBe('io server disconnect');
    });

    it('keeps a mutation (no reject) when storage fails, so the client retries it', async () => {
      const { client } = await helloed();
      const service = api.app.get(MutationService);
      const real = service.apply.bind(service);
      vi.spyOn(service, 'apply')
        .mockImplementationOnce(real)
        .mockImplementationOnce(() => {
          throw new Error('SQLITE_BUSY: database is locked');
        });
      const acks = collect(client, 'ack');
      const rejects = collect(client, 'reject');
      const reason = disconnected(client);
      const batch = [
        mutation('list.create', { id: newId(), title: 'Camping' }),
        mutation('list.create', { id: newId(), title: 'Hiking' }),
        mutation('list.create', { id: newId(), title: 'Biking' }),
      ];

      client.emit('push', { mutations: batch });

      expect(await reason).toBe('io server disconnect');
      expect(acks.map((a) => a.mutationId)).toEqual([batch[0].mutationId]);
      expect(rejects).toEqual([]);
      const recorded = api.database.db
        .select({ id: schema.processedMutations.mutationId })
        .from(schema.processedMutations)
        .all()
        .map((r) => r.id);
      expect(recorded).toEqual([batch[0].mutationId]);
    });

    it('disconnects instead of leaving the client waiting when a pull fails', async () => {
      const { client } = await helloed();
      vi.spyOn(api.app.get(SyncReader), 'rowsSince').mockImplementation(() => {
        throw new Error('disk I/O error');
      });
      const reason = disconnected(client);

      client.emit('pull', { spaceId: DEV_SPACE_ID, since: 0 });

      expect(await reason).toBe('io server disconnect');
    });
  });

  describe('pull', () => {
    it('sends a snapshot to a client ahead of the server (restored database)', async () => {
      const { client } = await helloed();
      const acked = next(client, 'ack');
      client.emit('push', {
        mutations: [mutation('list.create', { id: newId(), title: 'Camping' })],
      });
      await acked;

      const rows = next(client, 'rows');
      client.emit('pull', { spaceId: DEV_SPACE_ID, since: 57 });

      expect(await rows).toMatchObject({ version: 1, snapshot: true });
      expect((await rows).rows.lists).toHaveLength(1);
    });

    it('sends a full snapshot from version 0, tombstones included', async () => {
      const { client } = await helloed();
      const listId = newId();
      const itemId = newId();
      const done = new Promise<void>((resolve) => {
        let n = 0;
        client.on('ack', () => ++n === 3 && resolve());
      });
      client.emit('push', {
        mutations: [
          mutation('list.create', { id: listId, title: 'Camping' }),
          mutation('item.create', {
            id: itemId,
            listId,
            title: 'Tent',
            position: 'a0',
          }),
          mutation('item.delete', { id: itemId }),
        ],
      });
      await done;

      const rows = next(client, 'rows');
      client.emit('pull', { spaceId: DEV_SPACE_ID, since: 0 });

      expect(await rows).toMatchObject({
        spaceId: DEV_SPACE_ID,
        version: 3,
        snapshot: true,
      });
      expect((await rows).rows.items).toEqual([
        expect.objectContaining({
          id: itemId,
          deletedAt: expect.any(Number),
          version: 3,
        }),
      ]);
    });

    it('lets a client that missed changes catch up by pulling', async () => {
      const a = await helloed();
      const b = await helloed();
      const first = mutation('list.create', { id: newId(), title: 'Camping' });
      const seen = next(b.client, 'poke');
      a.client.emit('push', { mutations: [first] });
      const lastSeenByB = (await seen).version;

      b.client.disconnect();
      const missedA = mutation('list.create', { id: newId(), title: 'Hiking' });
      const missedB = mutation('list.update', {
        id: first.args.id,
        patch: { title: 'Camping 2' },
      });
      const acked = new Promise<void>((resolve) =>
        a.client.on(
          'ack',
          (ack) => ack.mutationId === missedB.mutationId && resolve(),
        ),
      );
      a.client.emit('push', { mutations: [missedA, missedB] });
      await acked;

      const back = await helloed();
      const rows = next(back.client, 'rows');
      back.client.emit('pull', { spaceId: DEV_SPACE_ID, since: lastSeenByB });

      const caughtUp = await rows;
      expect(caughtUp).toMatchObject({ version: 3, snapshot: false });
      expect(
        caughtUp.rows.lists.map((l) => [l.title, l.version]).sort(),
      ).toEqual([
        ['Camping 2', 3],
        ['Hiking', 2],
      ]);
    });
  });

  describe('includes', () => {
    /** The ack or reject this client gets for `sent`. */
    function answer(client: Client, sent: MutationInput) {
      return new Promise<Payload<'ack'> | Payload<'reject'>>((resolve) => {
        const mine = (payload: Payload<'ack'> | Payload<'reject'>) =>
          payload.mutationId === sent.mutationId && resolve(payload);
        client.on('ack', mine);
        client.on('reject', mine);
      });
    }
    const include = (parentListId: string, childListId: string) =>
      mutation('include.create', {
        id: newId(),
        parentListId,
        childListId,
        position: 'a1',
      });

    it('moves, removes and restores an include, poking the other member each time', async () => {
      const anna = await helloed();
      const ben = await helloed();
      const pokes = collect(ben.client, 'poke');
      const trip = mutation('list.create', { id: newId(), title: 'Trip' });
      const camping = mutation('list.create', {
        id: newId(),
        title: 'Camping',
      });
      const create = include(trip.args.id, camping.args.id);
      const id = create.args.id;
      const steps = [
        trip,
        camping,
        create,
        mutation('include.move', { id, position: 'a5' }),
        mutation('include.delete', { id }),
        mutation('include.move', { id, position: 'a9' }), // delete wins: no change
        mutation('include.restore', { id }),
      ];
      const answers = steps.map((step) => answer(anna.client, step));
      anna.client.emit('push', { mutations: steps });
      const versions = (await Promise.all(answers)).map((a) =>
        'version' in a ? a.version : a.reason,
      );

      expect(versions).toEqual([1, 2, 3, 4, 5, 5, 6]);
      await vi.waitFor(() => expect(pokes).toHaveLength(6));
      const includeRows = pokes.flatMap((poke) => poke.rows.includes);
      expect(
        includeRows.map((row) => [
          row.version,
          row.position,
          row.deletedAt === null,
        ]),
      ).toEqual([
        [3, 'a1', true],
        [4, 'a5', true],
        [5, 'a5', false],
        [6, 'a5', true],
      ]);

      // A retried create is answered again without a change.
      const again = answer(anna.client, create);
      anna.client.emit('push', { mutations: [create] });
      expect(await again).toEqual({
        mutationId: create.mutationId,
        version: 3,
      });
      expect(pokes).toHaveLength(6);
    });

    it('rejects the second half of a loop two offline clients each made', async () => {
      const anna = await helloed();
      const ben = await helloed();
      const camping = mutation('list.create', {
        id: newId(),
        title: 'Camping',
      });
      const hiking = mutation('list.create', { id: newId(), title: 'Hiking' });
      const created = answer(anna.client, hiking);
      anna.client.emit('push', { mutations: [camping, hiking] });
      await created;

      // Offline, each adds one half: Camping → Hiking, and Hiking → Camping.
      const annas = include(camping.args.id, hiking.args.id);
      const bens = include(hiking.args.id, camping.args.id);
      // Pokes to Ben may still include the lists' creation; wait for the include's.
      const benSeesAnna = new Promise<Payload<'poke'>>((resolve) =>
        ben.client.on(
          'poke',
          (poke) => poke.rows.includes.length > 0 && resolve(poke),
        ),
      );
      const annaAck = answer(anna.client, annas);
      anna.client.emit('push', { mutations: [annas] });
      expect(await annaAck).toEqual({
        mutationId: annas.mutationId,
        version: 3,
      });
      expect((await benSeesAnna).rows.includes).toEqual([
        expect.objectContaining({
          id: annas.args.id,
          parentListId: camping.args.id,
          childListId: hiking.args.id,
        }),
      ]);

      const benAnswer = answer(ben.client, bens);
      ben.client.emit('push', { mutations: [bens] });
      expect(await benAnswer).toEqual({
        mutationId: bens.mutationId,
        reason: 'That would make a loop: “Camping” already contains “Hiking”',
      });

      // Only Anna's half exists.
      const rows = next(ben.client, 'rows');
      ben.client.emit('pull', { spaceId: DEV_SPACE_ID, since: 0 });
      const snapshot = await rows;
      expect(snapshot.version).toBe(3);
      expect(snapshot.rows.includes.map((row) => row.id)).toEqual([
        annas.args.id,
      ]);
    });
  });
});
