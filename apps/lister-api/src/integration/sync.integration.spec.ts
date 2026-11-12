import { eq } from 'drizzle-orm';
import { schema } from '@lister/api/data-access-db';
import { DEV_SPACE_ID, DEV_WEB_ORIGIN } from '@lister/api/feature-sync';
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

    it('disconnects a client that pulls or pushes before hello', async () => {
      const client = connect();
      await new Promise<void>((resolve) =>
        client.once('connect', () => resolve()),
      );
      const gone = new Promise((resolve) => client.once('disconnect', resolve));

      client.emit('pull', { spaceId: DEV_SPACE_ID, since: 0 });

      await gone;
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

  describe('pull', () => {
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
});
