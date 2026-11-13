import { eq } from 'drizzle-orm';
import { schema } from '@lister/api/data-access-db';
import {
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
import {
  createAccount,
  send,
  sessionCookieOf,
  signIn,
} from '../testing/auth-client';
import { type TestApp, createTestApp } from '../testing/create-test-app';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
type Event = keyof ServerToClientEvents;
type Payload<E extends Event> = Parameters<ServerToClientEvents[E]>[0];

type Who = 'anna' | 'ben' | 'carl';

let api: TestApp;
const clients: Client[] = [];
/** Anna's and Ben's shared space "Home"; Carl belongs to neither it nor their personal spaces. */
let spaceId: string;
let cookies: Record<Who, string>;
let ids: Record<Who, string>;

beforeEach(async () => {
  api = await createTestApp();
  const anna = await createAccount(api, 'anna');
  const ben = await createAccount(api, 'ben');
  const carl = await createAccount(api, 'carl');
  ids = { anna: anna.id, ben: ben.id, carl: carl.id };
  cookies = {
    anna: await signIn(api, 'anna'),
    ben: await signIn(api, 'ben'),
    carl: await signIn(api, 'carl'),
  };
  const home = (await (
    await send(api, 'POST', '/spaces', {
      cookie: cookies.anna,
      body: { name: 'Home' },
    })
  ).json()) as { id: string };
  spaceId = home.id;
  await send(api, 'POST', `/spaces/${spaceId}/members`, {
    cookie: cookies.anna,
    body: { username: 'ben' },
  });
});
afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  await api.close();
});

/** A socket like the browser's: WebSocket only, with an Origin header and the session cookie. */
function connect(
  options: { origin?: string | null; cookie?: string | null } = {},
): Client {
  const { origin = DEV_WEB_ORIGIN, cookie = cookies.anna } = options;
  const headers: Record<string, string> = {};
  if (origin) headers['origin'] = origin;
  if (cookie) headers['cookie'] = cookie;
  const client: Client = io(api.url, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    extraHeaders: headers,
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

async function helloed(who: Who = 'anna') {
  const client = connect({ cookie: cookies[who] });
  const welcome = next(client, 'welcome');
  client.emit('hello', {
    protocolVersion: PROTOCOL_VERSION,
    clientId: newId(),
  });
  return { client, welcome: await welcome };
}

/** A mutation for the dev space, typed by its name. */
const mutation = <N extends MutationInput['name']>(
  name: N,
  args: Extract<MutationInput, { name: N }>['args'],
) =>
  ({ mutationId: newId(), spaceId: spaceId, name, args }) as Extract<
    MutationInput,
    { name: N }
  >;

describe('sync gateway', () => {
  describe('handshake', () => {
    it("welcomes a client with the user's spaces and their members", async () => {
      const { welcome } = await helloed('ben');

      expect(welcome.userId).toBe(ids.ben);
      expect(welcome.spaces).toEqual([
        expect.objectContaining({ name: 'ben display', version: 0 }),
        {
          id: spaceId,
          name: 'Home',
          version: 0,
          members: [
            { userId: ids.anna, displayName: 'anna display' },
            { userId: ids.ben, displayName: 'ben display' },
          ],
        },
      ]);
      expect(welcome.spaces[0].members).toEqual([
        { userId: ids.ben, displayName: 'ben display' },
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
      const client = connect({ origin });

      const error = await new Promise<Error>((resolve) =>
        client.once('connect_error', resolve),
      );

      expect(error).toBeInstanceOf(Error);
      expect(client.connected).toBe(false);
    });

    it.each([
      ['no session cookie', null],
      ['an unknown session', 'lister_session=not-a-session'],
      ['someone else’s cookie name', 'session=abc'],
    ])('refuses a connection with %s', async (_, cookie) => {
      const client = connect({ cookie });

      const error = await new Promise<Error>((resolve) =>
        client.once('connect_error', resolve),
      );

      expect(error.message).toBe('Sign in first');
      expect(client.connected).toBe(false);
    });

    it('refuses a session that has ended, and a user who must change their password first', async () => {
      await send(api, 'POST', '/auth/logout', { cookie: cookies.carl });
      await createAccount(api, 'dora', { mustChangePassword: true });
      const dora = sessionCookieOf(
        await send(api, 'POST', '/auth/login', {
          body: { username: 'dora', password: 'correct horse battery' },
        }),
      );

      for (const cookie of [cookies.carl, dora]) {
        const client = connect({ cookie });
        const error = await new Promise<Error>((resolve) =>
          client.once('connect_error', resolve),
        );
        expect(error.message).toBe('Sign in first');
      }
    });

    it.each([
      ['pulls before hello', 'pull', { spaceId: spaceId, since: 0 }],
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
      const b = await helloed('ben');
      const pokeToA = next(a.client, 'poke');
      const pokeToB = next(b.client, 'poke');
      const ack = next(a.client, 'ack');
      const create = mutation('list.create', { id: newId(), title: 'Camping' });

      a.client.emit('push', { mutations: [create] });

      expect(await ack).toEqual({ mutationId: create.mutationId, version: 1 });
      const poke = await pokeToB;
      expect(poke).toMatchObject({ spaceId: spaceId, version: 1 });
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
          .where(eq(schema.spaces.id, spaceId))
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

  describe('authorization', () => {
    const disconnected = (client: Client) =>
      new Promise<string>((resolve) => client.once('disconnect', resolve));

    /** Carl's own space, which neither Anna nor Ben belongs to. */
    const carlsSpace = () =>
      api.database.db
        .select()
        .from(schema.memberships)
        .where(eq(schema.memberships.userId, ids.carl))
        .get()?.spaceId as string;

    it('stamps rows with the signed-in user', async () => {
      const { client } = await helloed('ben');
      const acked = next(client, 'ack');
      const create = mutation('list.create', { id: newId(), title: 'Camping' });

      client.emit('push', { mutations: [create] });
      await acked;

      expect(api.database.db.select().from(schema.lists).get()).toMatchObject({
        createdBy: ids.ben,
        updatedBy: ids.ben,
      });
    });

    it('does not let a non-member change a space, and changes nothing', async () => {
      const { client, welcome } = await helloed('carl');
      const reject = next(client, 'reject');
      const foreign = mutation('list.create', { id: newId(), title: 'Marker' });

      client.emit('push', { mutations: [foreign] });

      expect(welcome.spaces.map((space) => space.id)).not.toContain(spaceId);
      expect(await reject).toEqual({
        mutationId: foreign.mutationId,
        reason: "You can't change this space",
      });
      expect(api.database.db.select().from(schema.lists).all()).toEqual([]);
      expect(
        api.database.db
          .select()
          .from(schema.spaces)
          .where(eq(schema.spaces.id, spaceId))
          .get()?.version,
      ).toBe(0);
    });

    it('does not let a non-member pull a space', async () => {
      const member = await helloed('anna');
      const acked = next(member.client, 'ack');
      member.client.emit('push', {
        mutations: [mutation('list.create', { id: newId(), title: 'Secret' })],
      });
      await acked;
      const { client } = await helloed('carl');
      const rows = collect(client, 'rows');
      const gone = disconnected(client);

      client.emit('pull', { spaceId, since: 0 });

      expect(await gone).toBe('io server disconnect');
      expect(rows).toEqual([]);
    });

    it('does not poke a non-member', async () => {
      const anna = await helloed('anna');
      const carl = await helloed('carl');
      const ben = await helloed('ben');
      const carlPokes = collect(carl.client, 'poke');
      const poked = next(ben.client, 'poke');

      anna.client.emit('push', {
        mutations: [mutation('list.create', { id: newId(), title: 'Camping' })],
      });
      await poked;
      // Pokes are emitted together: had Carl been in the room he would have it by now.
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(carlPokes).toEqual([]);
    });

    it("keeps one user's space out of another's pull, push and poke alike (a space they own, not Anna's)", async () => {
      const mine = carlsSpace();
      const anna = await helloed('anna');
      const rejected = next(anna.client, 'reject');
      const foreign = {
        ...mutation('list.create', { id: newId(), title: 'Marker' }),
        spaceId: mine,
      };

      anna.client.emit('push', { mutations: [foreign] });

      expect((await rejected).reason).toBe("You can't change this space");
      expect(anna.welcome.spaces.map((space) => space.id)).not.toContain(mine);
    });

    it("takes a removed member's client out of the space at once, and stops its pokes", async () => {
      const anna = await helloed('anna');
      const ben = await helloed('ben');
      const benPokes = collect(ben.client, 'poke');
      const newWelcome = next(ben.client, 'welcome');

      const removed = await send(
        api,
        'DELETE',
        `/spaces/${spaceId}/members/${ids.ben}`,
        { cookie: cookies.anna },
      );
      expect(removed.status).toBe(204);

      // Ben's client hears which spaces it still has, and the others see the new member list.
      expect((await newWelcome).spaces.map((s) => s.id)).not.toContain(spaceId);
      const poked = next(anna.client, 'poke');
      anna.client.emit('push', {
        mutations: [mutation('list.create', { id: newId(), title: 'After' })],
      });
      await poked;
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(benPokes).toEqual([]);

      // And nothing else works for the space: pull is refused, push is rejected.
      const rejected = next(ben.client, 'reject');
      const stale = mutation('list.create', { id: newId(), title: 'Stale' });
      ben.client.emit('push', { mutations: [stale] });
      expect((await rejected).reason).toBe("You can't change this space");
      const gone = disconnected(ben.client);
      ben.client.emit('pull', { spaceId, since: 0 });
      expect(await gone).toBe('io server disconnect');
    });

    it('gives a client the new space at once when it is added, and when someone leaves it', async () => {
      const anna = await helloed('anna');
      const carl = await helloed('carl');
      const welcomed = next(carl.client, 'welcome');

      await send(api, 'POST', `/spaces/${spaceId}/members`, {
        cookie: cookies.anna,
        body: { username: 'carl' },
      });

      const welcome = await welcomed;
      expect(welcome.spaces.find((s) => s.id === spaceId)?.members).toEqual([
        { userId: ids.anna, displayName: 'anna display' },
        { userId: ids.ben, displayName: 'ben display' },
        { userId: ids.carl, displayName: 'carl display' },
      ]);
      const poke = next(carl.client, 'poke');
      anna.client.emit('push', {
        mutations: [mutation('list.create', { id: newId(), title: 'Hi' })],
      });
      expect(await poke).toMatchObject({ spaceId, version: 1 });

      const left = next(anna.client, 'welcome');
      await send(api, 'POST', `/spaces/${spaceId}/leave`, {
        cookie: cookies.carl,
      });
      expect(
        (await left).spaces
          .find((s) => s.id === spaceId)
          ?.members.map((m) => m.userId),
      ).toEqual([ids.anna, ids.ben]);
    });

    it('gives every member a welcome with the new name when a space is renamed', async () => {
      const anna = await helloed('anna');
      const ben = await helloed('ben');
      const annaWelcome = next(anna.client, 'welcome');
      const benWelcome = next(ben.client, 'welcome');

      const renamed = await send(api, 'PATCH', `/spaces/${spaceId}`, {
        cookie: cookies.anna,
        body: { name: 'Crew' },
      });
      expect(renamed.status).toBe(200);

      for (const welcome of [await annaWelcome, await benWelcome]) {
        expect(welcome.spaces.find((s) => s.id === spaceId)?.name).toBe('Crew');
      }
    });

    it('takes every member out of a space that is deleted, and stops its pokes', async () => {
      const anna = await helloed('anna');
      const ben = await helloed('ben');
      const annaPokes = collect(anna.client, 'poke');
      const benPokes = collect(ben.client, 'poke');
      const annaWelcome = next(anna.client, 'welcome');
      const benWelcome = next(ben.client, 'welcome');

      const deleted = await send(api, 'DELETE', `/spaces/${spaceId}`, {
        cookie: cookies.anna,
      });
      expect(deleted.status).toBe(204);

      for (const welcome of [await annaWelcome, await benWelcome]) {
        expect(welcome.spaces.map((s) => s.id)).not.toContain(spaceId);
      }
      expect(annaPokes).toEqual([]);
      expect(benPokes).toEqual([]);
      // Their clients are out of the room: a later push is rejected, not poked.
      const rejected = next(ben.client, 'reject');
      ben.client.emit('push', {
        mutations: [mutation('list.create', { id: newId(), title: 'Late' })],
      });
      expect((await rejected).reason).toBe("You can't change this space");
    });

    it('ends a connection whose session has ended, on its next message', async () => {
      const { client } = await helloed('ben');
      const gone = disconnected(client);

      await send(api, 'POST', '/auth/logout', { cookie: cookies.ben });
      client.emit('pull', { spaceId, since: 0 });

      expect(await gone).toBe('io server disconnect');
    });

    describe('when a connected client’s session ends', () => {
      /** An admin, for the user administration routes. */
      const admin = async () => {
        await createAccount(api, 'root', { isAdmin: true });
        return signIn(api, 'root');
      };

      it.each([
        [
          'it signs out',
          () => send(api, 'POST', '/auth/logout', { cookie: cookies.ben }),
        ],
        [
          'it changes its password on another device',
          async () => {
            const other = await signIn(api, 'ben');
            return send(api, 'POST', '/auth/password', {
              cookie: other,
              body: {
                currentPassword: 'correct horse battery',
                newPassword: 'a new long password',
              },
            });
          },
        ],
        [
          'an admin resets its password',
          async () =>
            send(api, 'POST', `/users/${ids.ben}/password`, {
              cookie: await admin(),
              body: { temporaryPassword: 'a temporary password' },
            }),
        ],
        [
          'an admin deletes the account',
          async () =>
            send(api, 'DELETE', `/users/${ids.ben}`, {
              cookie: await admin(),
            }),
        ],
      ])('disconnects it at once when %s', async (_, end) => {
        const ben = await helloed('ben');
        const gone = disconnected(ben.client);

        const response = await end();

        expect(response.ok).toBe(true);
        expect(await gone).toBe('io server disconnect');
      });

      it('keeps the other connections of the user, and pokes nobody signed out', async () => {
        const anna = await helloed('anna');
        const ben = await helloed('ben');
        const benPokes = collect(ben.client, 'poke');
        const gone = disconnected(ben.client);
        const otherCookie = await signIn(api, 'anna');
        const annaOther = connect({ cookie: otherCookie });
        const otherWelcome = next(annaOther, 'welcome');
        annaOther.emit('hello', {
          protocolVersion: PROTOCOL_VERSION,
          clientId: newId(),
        });
        await otherWelcome;

        await send(api, 'POST', '/auth/logout', { cookie: otherCookie });
        await send(api, 'POST', '/auth/logout', { cookie: cookies.ben });
        await gone;

        const poked = next(anna.client, 'poke');
        anna.client.emit('push', {
          mutations: [mutation('list.create', { id: newId(), title: 'Hi' })],
        });
        await poked;
        expect(anna.client.connected).toBe(true);
        expect(annaOther.connected).toBe(false);
        expect(benPokes).toEqual([]);
      });

      it('disconnects a client whose session expired instead of poking it', async () => {
        const anna = await helloed('anna');
        const ben = await helloed('ben');
        const benPokes = collect(ben.client, 'poke');
        const gone = disconnected(ben.client);
        // Expiry announces nothing: the poke finds out.
        api.database.db
          .update(schema.sessions)
          .set({ expiresAt: 1 })
          .where(eq(schema.sessions.userId, ids.ben))
          .run();

        const poked = next(anna.client, 'poke');
        anna.client.emit('push', {
          mutations: [mutation('list.create', { id: newId(), title: 'Hi' })],
        });

        expect(await poked).toMatchObject({ spaceId, version: 1 });
        expect(await gone).toBe('io server disconnect');
        expect(benPokes).toEqual([]);
      });
    });

    it('gives the other members a fresh welcome when an account is deleted or renamed', async () => {
      await createAccount(api, 'root', { isAdmin: true });
      const root = await signIn(api, 'root');
      const ben = await helloed('ben');
      const members = async () =>
        (await next(ben.client, 'welcome')).spaces
          .find((s) => s.id === spaceId)
          ?.members.map((m) => m.displayName);

      const renamed = members();
      await send(api, 'PATCH', `/users/${ids.anna}`, {
        cookie: root,
        body: { displayName: 'Anna B.' },
      });
      expect(await renamed).toEqual(['Anna B.', 'ben display']);

      // Anna owned "Home": Ben takes it over, as its only member.
      const deleted = members();
      await send(api, 'DELETE', `/users/${ids.anna}`, { cookie: root });
      expect(await deleted).toEqual(['ben display']);
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

      client.emit('pull', { spaceId: spaceId, since: 0 });

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
      client.emit('pull', { spaceId: spaceId, since: 57 });

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
      client.emit('pull', { spaceId: spaceId, since: 0 });

      expect(await rows).toMatchObject({
        spaceId: spaceId,
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
      const b = await helloed('ben');
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
      back.client.emit('pull', { spaceId: spaceId, since: lastSeenByB });

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

  describe('runs', () => {
    function answerFor(client: Client, sent: MutationInput) {
      return new Promise<Payload<'ack'> | Payload<'reject'>>((resolve) => {
        const mine = (payload: Payload<'ack'> | Payload<'reject'>) =>
          payload.mutationId === sent.mutationId && resolve(payload);
        client.on('ack', mine);
        client.on('reject', mine);
      });
    }
    async function push(client: Client, ...mutations: MutationInput[]) {
      const answers = mutations.map((m) => answerFor(client, m));
      client.emit('push', { mutations });
      return Promise.all(answers);
    }

    it('starts a run with merged items and pokes it to the other member', async () => {
      const anna = await helloed();
      const ben = await helloed('ben');
      const pokes = collect(ben.client, 'poke');
      const runId = newId();
      const [basic, camping] = [newId(), newId()];
      await push(
        anna.client,
        mutation('list.create', { id: basic, title: 'Basic' }),
        mutation('list.create', { id: camping, title: 'Camping' }),
      );
      await vi.waitFor(() => expect(pokes).toHaveLength(2));
      pokes.splice(0);

      const [answer] = await push(
        anna.client,
        mutation('run.start', {
          id: runId,
          title: 'Alps',
          sourceListId: basic,
          items: [
            { id: newId(), title: 'Headlamp', sources: [basic] },
            {
              id: newId(),
              title: 'headlamp',
              quantity: '2',
              sources: [camping],
            },
            { id: newId(), title: 'Map', sources: [basic] },
          ],
        }),
      );

      expect(answer).toMatchObject({ version: 3 });
      await vi.waitFor(() => expect(pokes).toHaveLength(1));
      expect(pokes[0].rows.runs).toEqual([
        expect.objectContaining({ id: runId, title: 'Alps', finishedAt: null }),
      ]);
      expect(
        pokes[0].rows.runItems
          .filter((item) => item.deletedAt === null) // not the merged-away alias
          .map((item) => [item.title, item.quantity, item.sources]),
      ).toEqual([
        ['Headlamp', '2', [basic, camping]],
        ['Map', '', [basic]],
      ]);
    });

    it('finishes when the last item is checked, in the same change, and reopens on uncheck', async () => {
      const { client } = await helloed();
      const runId = newId();
      const [a, b] = [newId(), newId()];
      await push(
        client,
        mutation('run.start', {
          id: runId,
          title: 'Shop',
          items: [
            { id: a, title: 'Milk' },
            { id: b, title: 'Bread' },
          ],
        }),
      );
      const pokes = collect((await helloed()).client, 'poke');

      await push(
        client,
        mutation('runItem.setState', { id: a, state: 'checked' }),
      );
      await push(
        client,
        mutation('runItem.setState', { id: b, state: 'skipped' }),
      );
      await vi.waitFor(() => expect(pokes).toHaveLength(2));
      // The last check carries the finished run in the same poke (same version).
      expect(pokes[1].rows.runItems.map((i) => i.id)).toEqual([b]);
      expect(pokes[1].rows.runs).toEqual([
        expect.objectContaining({
          id: runId,
          finishedAt: expect.any(Number),
          version: 3,
        }),
      ]);

      await push(
        client,
        mutation('runItem.setState', { id: a, state: 'unchecked' }),
      );
      await vi.waitFor(() => expect(pokes).toHaveLength(3));
      expect(pokes[2].rows.runs).toEqual([
        expect.objectContaining({ id: runId, finishedAt: null }),
      ]);
    });

    it('two people finishing and reopening at the same time end in one consistent state', async () => {
      const anna = await helloed();
      const ben = await helloed('ben');
      const runId = newId();
      const [a, b] = [newId(), newId()];
      await push(
        anna.client,
        mutation('run.start', {
          id: runId,
          title: 'Shop',
          items: [
            { id: a, title: 'Milk' },
            { id: b, title: 'Bread' },
          ],
        }),
      );
      await push(
        anna.client,
        mutation('runItem.setState', { id: a, state: 'checked' }),
      );

      // At the same moment: Anna checks the last item (finishing the run) while Ben, who hasn't
      // seen it yet, unchecks the other one (reopening it).
      const [annaAnswer, benAnswer] = await Promise.all([
        push(
          anna.client,
          mutation('runItem.setState', { id: b, state: 'checked' }),
        ),
        push(
          ben.client,
          mutation('runItem.setState', { id: a, state: 'unchecked' }),
        ),
      ]);
      expect(annaAnswer[0]).toHaveProperty('version');
      expect(benAnswer[0]).toHaveProperty('version');

      // Whatever the order, the stored run agrees with its items.
      const rows = next(ben.client, 'rows');
      ben.client.emit('pull', { spaceId: spaceId, since: 0 });
      const snapshot = await rows;
      const items = snapshot.rows.runItems.filter((i) => i.runId === runId);
      const run = snapshot.rows.runs.find((r) => r.id === runId);
      const allDone = items.every((i) => i.state !== 'unchecked');
      expect(run?.finishedAt !== null).toBe(allDone);
      expect(items.find((i) => i.id === a)?.state).toBe('unchecked');
      expect(run?.finishedAt).toBeNull();
    });

    it("applies an offline check to the item another member's identical item became", async () => {
      const anna = await helloed();
      const ben = await helloed('ben');
      const runId = newId();
      await push(
        anna.client,
        mutation('run.start', { id: runId, title: 'Groceries' }),
      );
      // Ben adds Milk; Anna, offline, added Milk too and checked it.
      const bens = newId();
      await push(
        ben.client,
        mutation('run.addItems', {
          runId,
          items: [{ id: bens, title: 'Milk' }],
        }),
      );
      const annas = newId();
      const answers = await push(
        anna.client,
        mutation('run.addItems', {
          runId,
          items: [{ id: annas, title: 'milk' }],
        }),
        mutation('runItem.setState', { id: annas, state: 'checked' }),
      );

      expect(answers.every((a) => 'version' in a)).toBe(true);
      const rows = next(ben.client, 'rows');
      ben.client.emit('pull', { spaceId: spaceId, since: 0 });
      const items = (await rows).rows.runItems.filter((i) => i.runId === runId);
      expect(items.find((i) => i.id === bens)).toMatchObject({
        state: 'checked',
        deletedAt: null,
      });
      expect(items.find((i) => i.id === annas)).toMatchObject({
        mergedInto: bens,
        deletedAt: expect.any(Number),
      });
    });

    it('saves a run as a list in one change, poked to the other member, leaving the run unchanged', async () => {
      const anna = await helloed();
      const ben = await helloed('ben');
      const pokes = collect(ben.client, 'poke');
      const runId = newId();
      const [tent, milk] = [newId(), newId()];
      await push(
        anna.client,
        mutation('run.start', {
          id: runId,
          title: 'Alps',
          sourceListId: null,
          items: [
            { id: tent, title: 'Tent', quantity: '2', note: 'big' },
            { id: milk, title: 'Milk' },
          ],
        }),
        mutation('runItem.setState', { id: milk, state: 'checked' }),
      );
      await vi.waitFor(() => expect(pokes).toHaveLength(2));

      const listId = newId();
      const save = mutation('run.saveAsList', {
        runId,
        listId,
        title: 'Alps gear',
        items: [
          { from: milk, id: newId() },
          { from: tent, id: newId() },
        ],
      });
      const [answer] = await push(anna.client, save);

      expect(answer).toEqual({ mutationId: save.mutationId, version: 3 });
      await vi.waitFor(() => expect(pokes).toHaveLength(3));
      const poke = pokes[2];
      expect(poke.rows.lists).toEqual([
        expect.objectContaining({ id: listId, title: 'Alps gear' }),
      ]);
      expect(
        poke.rows.items.map((item) => [
          item.listId,
          item.title,
          item.quantity,
          item.note,
        ]),
      ).toEqual([
        [listId, 'Milk', '', ''],
        [listId, 'Tent', '2', 'big'],
      ]);
      expect(poke.rows.runs).toEqual([]);
      expect(poke.rows.runItems).toEqual([]);

      // A retry is answered without a second copy.
      const [again] = await push(anna.client, save);
      expect(again).toEqual({ mutationId: save.mutationId, version: 3 });
    });

    it('refuses saving a run that does not exist as a list, or one in another space', async () => {
      const { client } = await helloed();
      const save = () =>
        mutation('run.saveAsList', {
          runId: newId(),
          listId: newId(),
          title: 'Gear',
          items: [],
        });
      const [unknown, foreign] = await push(client, save(), {
        ...save(),
        spaceId: newId(),
      });

      expect(unknown).toMatchObject({ reason: "This run doesn't exist" });
      expect(foreign).toMatchObject({ reason: "You can't change this space" });
    });

    it('refuses changes to items of a run that does not exist', async () => {
      const { client } = await helloed();
      const [answer] = await push(
        client,
        mutation('run.addItems', {
          runId: newId(),
          items: [{ id: newId(), title: 'Milk' }],
        }),
      );
      expect(answer).toMatchObject({ reason: "This run doesn't exist" });
    });
  });

  describe('restore', () => {
    /** The ack or reject this client gets for `sent`. */
    function answerTo(client: Client, sent: MutationInput) {
      return new Promise<Payload<'ack'> | Payload<'reject'>>((resolve) => {
        const mine = (payload: Payload<'ack'> | Payload<'reject'>) =>
          payload.mutationId === sent.mutationId && resolve(payload);
        client.on('ack', mine);
        client.on('reject', mine);
      });
    }

    it('restores a list with its items and an item, poking the other member', async () => {
      const anna = await helloed();
      const ben = await helloed('ben');
      const pokes = collect(ben.client, 'poke');
      const listId = newId();
      const tentId = newId();
      const mapId = newId();
      const steps = [
        mutation('list.create', { id: listId, title: 'Camping' }),
        mutation('item.create', {
          id: tentId,
          listId,
          title: 'Tent',
          position: 'a0',
        }),
        mutation('item.create', {
          id: mapId,
          listId,
          title: 'Map',
          position: 'a1',
        }),
        mutation('item.delete', { id: mapId }),
        mutation('list.delete', { id: listId }),
        // While the list is deleted, restoring one of its items changes nothing.
        mutation('item.restore', { id: mapId }),
        mutation('list.restore', { id: listId }),
        mutation('item.restore', { id: mapId }),
      ];
      const answers = steps.map((step) => answerTo(anna.client, step));
      anna.client.emit('push', { mutations: steps });
      const versions = (await Promise.all(answers)).map((a) =>
        'version' in a ? a.version : a.reason,
      );

      expect(versions).toEqual([1, 2, 3, 4, 5, 5, 6, 7]);
      await vi.waitFor(() => expect(pokes).toHaveLength(7));
      expect(pokes[5].rows.lists).toEqual([
        expect.objectContaining({ id: listId, deletedAt: null, version: 6 }),
      ]);
      expect(pokes[6].rows.items).toEqual([
        expect.objectContaining({ id: mapId, deletedAt: null, version: 7 }),
      ]);

      // The list's own items were never touched: Tent is still live, as before.
      const rows = next(ben.client, 'rows');
      ben.client.emit('pull', { spaceId: spaceId, since: 0 });
      const snapshot = await rows;
      expect(
        snapshot.rows.items
          .filter((item) => item.listId === listId)
          .map((item) => [item.title, item.deletedAt]),
      ).toEqual(
        expect.arrayContaining([
          ['Tent', null],
          ['Map', null],
        ]),
      );
    });

    it('duplicates a list in one change, poked to the other member at once', async () => {
      const anna = await helloed();
      const ben = await helloed('ben');
      const pokes = collect(ben.client, 'poke');
      const source = newId();
      const tent = newId();
      const stove = newId();
      const setup = [
        mutation('list.create', { id: source, title: 'Camping' }),
        mutation('item.create', {
          id: tent,
          listId: source,
          title: 'Tent',
          position: 'a0',
        }),
        mutation('item.create', {
          id: stove,
          listId: source,
          title: 'Stove',
          position: 'a1',
        }),
      ];
      const ready = answerTo(anna.client, setup[2]);
      anna.client.emit('push', { mutations: setup });
      await ready;
      await vi.waitFor(() => expect(pokes).toHaveLength(3));

      const copy = newId();
      const duplicate = mutation('list.duplicate', {
        id: copy,
        sourceListId: source,
        title: 'Copy of Camping',
        items: [
          { from: tent, id: newId() },
          { from: stove, id: newId() },
        ],
        includes: [],
      });
      const answer = answerTo(anna.client, duplicate);
      anna.client.emit('push', { mutations: [duplicate] });

      expect(await answer).toEqual({
        mutationId: duplicate.mutationId,
        version: 4,
      });
      await vi.waitFor(() => expect(pokes).toHaveLength(4));
      const poke = pokes[3];
      expect(poke.rows.lists).toEqual([
        expect.objectContaining({ id: copy, title: 'Copy of Camping' }),
      ]);
      expect(
        poke.rows.items.map((item) => [item.listId, item.title, item.position]),
      ).toEqual([
        [copy, 'Tent', 'a0'],
        [copy, 'Stove', 'a1'],
      ]);

      // A retry is answered without a second copy.
      const again = answerTo(anna.client, duplicate);
      anna.client.emit('push', { mutations: [duplicate] });
      expect(await again).toEqual({
        mutationId: duplicate.mutationId,
        version: 4,
      });
    });

    it("refuses restoring a list or an item that doesn't exist", async () => {
      const { client } = await helloed();
      const list = mutation('list.restore', { id: newId() });
      const item = mutation('item.restore', { id: newId() });
      const answers = [answerTo(client, list), answerTo(client, item)];
      client.emit('push', { mutations: [list, item] });

      expect(await Promise.all(answers)).toEqual([
        { mutationId: list.mutationId, reason: "This list doesn't exist" },
        { mutationId: item.mutationId, reason: "This item doesn't exist" },
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
      const ben = await helloed('ben');
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
      const ben = await helloed('ben');
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
      ben.client.emit('pull', { spaceId: spaceId, since: 0 });
      const snapshot = await rows;
      expect(snapshot.version).toBe(3);
      expect(snapshot.rows.includes.map((row) => row.id)).toEqual([
        annas.args.id,
      ]);
    });
  });
});
