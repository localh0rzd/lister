import { eq } from 'drizzle-orm';
import { schema } from '@lister/api/data-access-db';
import type { CurrentUser, SpaceSummary } from '@lister/shared/api-contracts';
import { createAccount, send, signIn } from '../testing/auth-client';
import { type TestApp, createTestApp } from '../testing/create-test-app';

const UNKNOWN = '0197f000-0000-7000-8000-000000000000';

describe('spaces and memberships', () => {
  let api: TestApp;
  let anna: CurrentUser;
  let ben: CurrentUser;
  let annaCookie: string;
  let benCookie: string;

  beforeEach(async () => {
    api = await createTestApp();
    anna = await createAccount(api, 'anna');
    ben = await createAccount(api, 'ben');
    annaCookie = await signIn(api, 'anna');
    benCookie = await signIn(api, 'ben');
  });
  afterEach(() => api.close());

  const list = async (cookie: string) =>
    (await (
      await send(api, 'GET', '/spaces', { cookie })
    ).json()) as SpaceSummary[];

  const createShared = async (cookie = annaCookie, name = 'Family') =>
    (await (
      await send(api, 'POST', '/spaces', { cookie, body: { name } })
    ).json()) as SpaceSummary;

  describe('GET /api/spaces', () => {
    it("lists the user's personal space, with its members' display names", async () => {
      const spaces = await list(annaCookie);

      expect(spaces).toEqual([
        {
          id: expect.any(String),
          name: 'anna display',
          personal: true,
          role: 'owner',
          members: [
            { userId: anna.id, displayName: 'anna display', role: 'owner' },
          ],
        },
      ]);
    });

    it('lists only spaces the user belongs to, the personal one first', async () => {
      await createShared(annaCookie, 'Aardvarks');
      await createShared(benCookie, 'Ben only');

      const names = (await list(annaCookie)).map((space) => space.name);

      expect(names).toEqual(['anna display', 'Aardvarks']);
    });

    it('is 401 without a session', async () => {
      expect((await send(api, 'GET', '/spaces')).status).toBe(401);
    });
  });

  describe('POST /api/spaces', () => {
    it('creates a shared space owned by the caller', async () => {
      const response = await send(api, 'POST', '/spaces', {
        cookie: annaCookie,
        body: { name: '  Family ' },
      });

      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({
        name: 'Family',
        personal: false,
        role: 'owner',
        members: [{ userId: anna.id, role: 'owner' }],
      });
    });

    it.each([
      ['an empty name', { name: ' ' }],
      ['a long name', { name: 'x'.repeat(101) }],
      ['no name', {}],
      ['a non-string name', { name: 5 }],
    ])('is 400 for %s', async (_label, body) => {
      const response = await send(api, 'POST', '/spaces', {
        cookie: annaCookie,
        body,
      });
      expect(response.status).toBe(400);
    });

    it('is 401 without a session', async () => {
      const response = await send(api, 'POST', '/spaces', {
        body: { name: 'x' },
      });
      expect(response.status).toBe(401);
    });
  });

  describe('PATCH /api/spaces/:id', () => {
    it('lets the owner rename it', async () => {
      const space = await createShared();

      const response = await send(api, 'PATCH', `/spaces/${space.id}`, {
        cookie: annaCookie,
        body: { name: 'Home crew' },
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ name: 'Home crew' });
    });

    it('is 400 for a bad name or id, 401 signed out, 403 for a member, 404 for a stranger or unknown space', async () => {
      const space = await createShared();
      await send(api, 'POST', `/spaces/${space.id}/members`, {
        cookie: annaCookie,
        body: { username: 'ben' },
      });
      const rename = (id: string, cookie: string | null, name = 'New') =>
        send(api, 'PATCH', `/spaces/${id}`, { cookie, body: { name } });
      const carl = await createAccount(api, 'carl');
      expect(carl).toBeDefined();
      const carlCookie = await signIn(api, 'carl');

      expect((await rename(space.id, annaCookie, '')).status).toBe(400);
      expect((await rename('not-a-uuid', annaCookie)).status).toBe(400);
      expect((await rename(space.id, null)).status).toBe(401);
      expect((await rename(space.id, benCookie)).status).toBe(403);
      expect((await rename(space.id, carlCookie)).status).toBe(404);
      expect((await rename(UNKNOWN, annaCookie)).status).toBe(404);
    });

    it('lets the owner rename their personal space', async () => {
      const [personal] = await list(annaCookie);

      const response = await send(api, 'PATCH', `/spaces/${personal.id}`, {
        cookie: annaCookie,
        body: { name: 'Mine' },
      });

      expect(response.status).toBe(200);
    });
  });

  describe('DELETE /api/spaces/:id', () => {
    it('deletes the space with its content and memberships', async () => {
      const space = await createShared();
      await send(api, 'POST', `/spaces/${space.id}/members`, {
        cookie: annaCookie,
        body: { username: 'ben' },
      });
      api.database.db
        .insert(schema.lists)
        .values({
          id: '0197f000-0000-7000-8000-000000000001',
          spaceId: space.id,
          version: 1,
          createdBy: anna.id,
          updatedBy: anna.id,
          createdAt: 1,
          updatedAt: 1,
          title: 'Tent',
        })
        .run();

      const response = await send(api, 'DELETE', `/spaces/${space.id}`, {
        cookie: annaCookie,
      });

      expect(response.status).toBe(204);
      expect(await list(annaCookie)).toHaveLength(1);
      expect(await list(benCookie)).toHaveLength(1);
      expect(api.database.db.select().from(schema.lists).all()).toEqual([]);
      expect(
        api.database.db
          .select()
          .from(schema.memberships)
          .where(eq(schema.memberships.spaceId, space.id))
          .all(),
      ).toEqual([]);
    });

    it('is 409 for a personal space', async () => {
      const [personal] = await list(annaCookie);

      const response = await send(api, 'DELETE', `/spaces/${personal.id}`, {
        cookie: annaCookie,
      });

      expect(response.status).toBe(409);
      expect(await list(annaCookie)).toHaveLength(1);
    });

    it('is 400 for a bad id, 401 signed out, 403 for a member, 404 for a stranger', async () => {
      const space = await createShared();
      await send(api, 'POST', `/spaces/${space.id}/members`, {
        cookie: annaCookie,
        body: { username: 'ben' },
      });
      await createAccount(api, 'carl');
      const carlCookie = await signIn(api, 'carl');
      const remove = (id: string, cookie: string | null) =>
        send(api, 'DELETE', `/spaces/${id}`, { cookie });

      expect((await remove('nope', annaCookie)).status).toBe(400);
      expect((await remove(space.id, null)).status).toBe(401);
      expect((await remove(space.id, benCookie)).status).toBe(403);
      expect((await remove(space.id, carlCookie)).status).toBe(404);
      expect(await list(annaCookie)).toHaveLength(2);
    });
  });

  describe('POST /api/spaces/:id/members', () => {
    it('adds an existing user by username, ignoring case', async () => {
      const space = await createShared();

      const response = await send(api, 'POST', `/spaces/${space.id}/members`, {
        cookie: annaCookie,
        body: { username: ' BEN ' },
      });

      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({
        members: [
          { userId: anna.id, role: 'owner' },
          { userId: ben.id, displayName: 'ben display', role: 'member' },
        ],
      });
      expect(await list(benCookie)).toHaveLength(2);
    });

    it('is 400 for a bad body, 401 signed out, 403 for a member, 404 for a stranger, an unknown space or user, and 409 for a member or a personal space', async () => {
      const space = await createShared();
      await send(api, 'POST', `/spaces/${space.id}/members`, {
        cookie: annaCookie,
        body: { username: 'ben' },
      });
      await createAccount(api, 'carl');
      const carlCookie = await signIn(api, 'carl');
      const [personal] = await list(annaCookie);
      const add = (id: string, cookie: string | null, username: unknown) =>
        send(api, 'POST', `/spaces/${id}/members`, {
          cookie,
          body: { username },
        });

      expect((await add(space.id, annaCookie, '')).status).toBe(400);
      expect((await add(space.id, annaCookie, undefined)).status).toBe(400);
      expect((await add('nope', annaCookie, 'carl')).status).toBe(400);
      expect((await add(space.id, null, 'carl')).status).toBe(401);
      expect((await add(space.id, benCookie, 'carl')).status).toBe(403);
      expect((await add(space.id, carlCookie, 'carl')).status).toBe(404);
      expect((await add(UNKNOWN, annaCookie, 'carl')).status).toBe(404);
      expect((await add(space.id, annaCookie, 'nobody')).status).toBe(404);
      expect((await add(space.id, annaCookie, 'ben')).status).toBe(409);
      expect((await add(personal.id, annaCookie, 'carl')).status).toBe(409);
    });
  });

  describe('DELETE /api/spaces/:id/members/:userId', () => {
    let space: SpaceSummary;
    beforeEach(async () => {
      space = await createShared();
      await send(api, 'POST', `/spaces/${space.id}/members`, {
        cookie: annaCookie,
        body: { username: 'ben' },
      });
    });
    const remove = (id: string, userId: string, cookie: string | null) =>
      send(api, 'DELETE', `/spaces/${id}/members/${userId}`, { cookie });

    it('lets the owner remove a member, who loses access at once', async () => {
      const response = await remove(space.id, ben.id, annaCookie);

      expect(response.status).toBe(204);
      expect(await list(benCookie)).toHaveLength(1);
      expect(
        (
          await send(api, 'PATCH', `/spaces/${space.id}`, {
            cookie: benCookie,
            body: { name: 'x' },
          })
        ).status,
      ).toBe(404);
    });

    it('is 400, 401, 403, 404 and 409 where they apply', async () => {
      await createAccount(api, 'carl');
      const carlCookie = await signIn(api, 'carl');

      expect((await remove(space.id, 'nope', annaCookie)).status).toBe(400);
      expect((await remove(space.id, ben.id, null)).status).toBe(401);
      expect((await remove(space.id, anna.id, benCookie)).status).toBe(403);
      expect((await remove(space.id, ben.id, carlCookie)).status).toBe(404);
      expect((await remove(space.id, UNKNOWN, annaCookie)).status).toBe(404);
      expect((await remove(UNKNOWN, ben.id, annaCookie)).status).toBe(404);
      expect((await remove(space.id, anna.id, annaCookie)).status).toBe(409);
    });
  });

  describe('POST /api/spaces/:id/leave', () => {
    let space: SpaceSummary;
    beforeEach(async () => {
      space = await createShared();
      await send(api, 'POST', `/spaces/${space.id}/members`, {
        cookie: annaCookie,
        body: { username: 'ben' },
      });
    });
    const leave = (id: string, cookie: string | null) =>
      send(api, 'POST', `/spaces/${id}/leave`, { cookie });

    it('lets a member leave; the space stays for the others', async () => {
      const response = await leave(space.id, benCookie);

      expect(response.status).toBe(204);
      expect(await list(benCookie)).toHaveLength(1);
      expect((await list(annaCookie))[1].members).toHaveLength(1);
    });

    it('is 400, 401, 404 and 409 where they apply', async () => {
      await createAccount(api, 'carl');
      const carlCookie = await signIn(api, 'carl');
      const [personal] = await list(annaCookie);

      expect((await leave('nope', benCookie)).status).toBe(400);
      expect((await leave(space.id, null)).status).toBe(401);
      expect((await leave(space.id, carlCookie)).status).toBe(404);
      expect((await leave(UNKNOWN, benCookie)).status).toBe(404);
      // The owner can't leave their shared or their personal space.
      expect((await leave(space.id, annaCookie)).status).toBe(409);
      const personalLeave = await leave(personal.id, annaCookie);
      expect(personalLeave.status).toBe(409);
      expect(await personalLeave.json()).toMatchObject({
        message: "You can't leave your personal space",
      });
    });
  });

  it('refuses a cross-site write', async () => {
    const response = await send(api, 'POST', '/spaces', {
      cookie: annaCookie,
      body: { name: 'x' },
      headers: { Origin: 'https://evil.example' },
    });
    expect(response.status).toBe(403);
  });
});
