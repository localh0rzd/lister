import { eq } from 'drizzle-orm';
import { schema } from '@lister/api/data-access-db';
import type { CurrentUser } from '@lister/shared/api-contracts';
import { PASSWORD, createAccount, send, signIn } from '../testing/auth-client';
import { type TestApp, createTestApp } from '../testing/create-test-app';

const UNKNOWN = '0197f000-0000-7000-8000-000000000000';

describe('user administration', () => {
  let api: TestApp;
  let admin: CurrentUser;
  let adminCookie: string;

  beforeEach(async () => {
    api = await createTestApp();
    admin = await createAccount(api, 'boss', { isAdmin: true });
    adminCookie = await signIn(api, 'boss');
  });
  afterEach(() => api.close());

  const sessionsOf = (id: string) =>
    api.database.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, id))
      .all();

  describe('GET /api/users', () => {
    it('lists all users for an admin', async () => {
      await createAccount(api, 'anna');

      const response = await send(api, 'GET', '/users', {
        cookie: adminCookie,
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as CurrentUser[];
      expect(body.map((u) => u.username)).toEqual(['anna', 'boss']);
      expect(JSON.stringify(body)).not.toContain('argon2');
    });

    it('is 401 without a session and 403 for a non-admin', async () => {
      await createAccount(api, 'anna');
      const annaCookie = await signIn(api, 'anna');

      expect((await send(api, 'GET', '/users')).status).toBe(401);
      expect(
        (await send(api, 'GET', '/users', { cookie: annaCookie })).status,
      ).toBe(403);
    });
  });

  describe('POST /api/users', () => {
    it('creates a user who signs in with the temporary password and must change it', async () => {
      const response = await send(api, 'POST', '/users', {
        cookie: adminCookie,
        body: {
          username: ' Anna ',
          displayName: 'Anna A',
          temporaryPassword: 'temporary one',
        },
      });

      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({
        username: 'Anna',
        displayName: 'Anna A',
        isAdmin: false,
        mustChangePassword: true,
      });
      const cookie = await signIn(api, 'anna', 'temporary one');
      expect((await send(api, 'GET', '/auth/me', { cookie })).status).toBe(200);
      expect((await send(api, 'GET', '/users', { cookie })).status).toBe(403);
    });

    it.each([
      ['a non-ASCII username', { username: 'jürgen' }],
      ['an empty username', { username: '' }],
      ['an empty display name', { displayName: ' ' }],
      ['a short password', { temporaryPassword: 'short' }],
    ])('is 400 for %s', async (_name, override) => {
      const response = await send(api, 'POST', '/users', {
        cookie: adminCookie,
        body: {
          username: 'anna',
          displayName: 'Anna',
          temporaryPassword: 'temporary one',
          ...override,
        },
      });

      expect(response.status).toBe(400);
    });

    it('ignores an isAdmin field: new users are never admins', async () => {
      const response = await send(api, 'POST', '/users', {
        cookie: adminCookie,
        body: {
          username: 'anna',
          displayName: 'Anna',
          temporaryPassword: 'temporary one',
          isAdmin: true,
        },
      });

      expect(response.status).toBe(201);
      expect(((await response.json()) as CurrentUser).isAdmin).toBe(false);
    });

    it('is 409 for a taken username, ignoring case', async () => {
      const response = await send(api, 'POST', '/users', {
        cookie: adminCookie,
        body: {
          username: 'BOSS',
          displayName: 'Other',
          temporaryPassword: 'temporary one',
        },
      });

      expect(response.status).toBe(409);
    });

    it('is 401 without a session and 403 for a non-admin', async () => {
      await createAccount(api, 'anna');
      const body = {
        username: 'bob',
        displayName: 'Bob',
        temporaryPassword: 'temporary one',
      };

      expect((await send(api, 'POST', '/users', { body })).status).toBe(401);
      expect(
        (
          await send(api, 'POST', '/users', {
            body,
            cookie: await signIn(api, 'anna'),
          })
        ).status,
      ).toBe(403);
    });
  });

  describe('PATCH /api/users/:id', () => {
    it('edits the display name and username', async () => {
      const anna = await createAccount(api, 'anna');

      const response = await send(api, 'PATCH', `/users/${anna.id}`, {
        cookie: adminCookie,
        body: { username: 'annabel', displayName: 'Annabel' },
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        id: anna.id,
        username: 'annabel',
        displayName: 'Annabel',
      });
      await signIn(api, 'annabel');
    });

    it('grants and revokes admin', async () => {
      const anna = await createAccount(api, 'anna');

      const granted = await send(api, 'PATCH', `/users/${anna.id}`, {
        cookie: adminCookie,
        body: { isAdmin: true },
      });
      expect(((await granted.json()) as CurrentUser).isAdmin).toBe(true);
      const annaCookie = await signIn(api, 'anna');
      expect(
        (await send(api, 'GET', '/users', { cookie: annaCookie })).status,
      ).toBe(200);

      const revoked = await send(api, 'PATCH', `/users/${anna.id}`, {
        cookie: adminCookie,
        body: { isAdmin: false },
      });
      expect(((await revoked.json()) as CurrentUser).isAdmin).toBe(false);
      expect(
        (await send(api, 'GET', '/users', { cookie: annaCookie })).status,
      ).toBe(403);
    });

    it('is 409 when it would demote the last admin', async () => {
      const response = await send(api, 'PATCH', `/users/${admin.id}`, {
        cookie: adminCookie,
        body: { isAdmin: false },
      });

      expect(response.status).toBe(409);
      expect(
        api.database.db
          .select()
          .from(schema.users)
          .where(eq(schema.users.id, admin.id))
          .get()?.isAdmin,
      ).toBe(true);
    });

    it('is 409 for a username another user has', async () => {
      const anna = await createAccount(api, 'anna');

      const response = await send(api, 'PATCH', `/users/${anna.id}`, {
        cookie: adminCookie,
        body: { username: 'Boss' },
      });

      expect(response.status).toBe(409);
    });

    it('is 400 for a bad body or id, 404 for an unknown user', async () => {
      const anna = await createAccount(api, 'anna');
      const patch = (id: string, body: unknown) =>
        send(api, 'PATCH', `/users/${id}`, { cookie: adminCookie, body });

      expect((await patch(anna.id, { username: 'bad name' })).status).toBe(400);
      expect((await patch(anna.id, { isAdmin: 'yes' })).status).toBe(400);
      expect((await patch(anna.id, { username: null })).status).toBe(400);
      expect((await patch(anna.id, { displayName: null })).status).toBe(400);
      expect((await patch(admin.id, { isAdmin: null })).status).toBe(400);
      expect((await patch('not-a-uuid', {})).status).toBe(400);
      expect((await patch(UNKNOWN, { displayName: 'X' })).status).toBe(404);
    });

    it('is 401 without a session and 403 for a non-admin', async () => {
      const anna = await createAccount(api, 'anna');
      const body = { displayName: 'X' };

      expect(
        (await send(api, 'PATCH', `/users/${anna.id}`, { body })).status,
      ).toBe(401);
      expect(
        (
          await send(api, 'PATCH', `/users/${anna.id}`, {
            body,
            cookie: await signIn(api, 'anna'),
          })
        ).status,
      ).toBe(403);
    });
  });

  describe('DELETE /api/users/:id', () => {
    it('deletes the user and ends their sessions', async () => {
      const anna = await createAccount(api, 'anna');
      const annaCookie = await signIn(api, 'anna');
      expect(sessionsOf(anna.id)).toHaveLength(1);

      const response = await send(api, 'DELETE', `/users/${anna.id}`, {
        cookie: adminCookie,
      });

      expect(response.status).toBe(204);
      expect(sessionsOf(anna.id)).toEqual([]);
      expect(
        (await send(api, 'GET', '/auth/me', { cookie: annaCookie })).status,
      ).toBe(401);
      expect(
        (await send(api, 'GET', '/users', { cookie: adminCookie })).status,
      ).toBe(200);
    });

    it('is 409 for the last admin, but not once another admin exists', async () => {
      const refused = await send(api, 'DELETE', `/users/${admin.id}`, {
        cookie: adminCookie,
      });
      expect(refused.status).toBe(409);

      await createAccount(api, 'second', { isAdmin: true });
      const allowed = await send(api, 'DELETE', `/users/${admin.id}`, {
        cookie: adminCookie,
      });
      expect(allowed.status).toBe(204);
    });

    it('keeps one admin when two admins delete each other', async () => {
      const second = await createAccount(api, 'second', { isAdmin: true });
      const secondCookie = await signIn(api, 'second');

      const results = await Promise.all([
        send(api, 'DELETE', `/users/${second.id}`, { cookie: adminCookie }),
        send(api, 'DELETE', `/users/${admin.id}`, { cookie: secondCookie }),
      ]);

      expect(results.map((r) => r.status).sort()).not.toContain(500);
      const admins = api.database.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.isAdmin, true))
        .all();
      expect(admins).toHaveLength(1);
    });

    it('is 400 for a bad id and 404 for an unknown user', async () => {
      expect(
        (await send(api, 'DELETE', '/users/nope', { cookie: adminCookie }))
          .status,
      ).toBe(400);
      expect(
        (
          await send(api, 'DELETE', `/users/${UNKNOWN}`, {
            cookie: adminCookie,
          })
        ).status,
      ).toBe(404);
    });

    it('is 401 without a session and 403 for a non-admin', async () => {
      const anna = await createAccount(api, 'anna');

      expect((await send(api, 'DELETE', `/users/${anna.id}`)).status).toBe(401);
      expect(
        (
          await send(api, 'DELETE', `/users/${anna.id}`, {
            cookie: await signIn(api, 'anna'),
          })
        ).status,
      ).toBe(403);
    });
  });

  describe('POST /api/users/:id/password', () => {
    it('sets a temporary password, ends the sessions and forces a change', async () => {
      const anna = await createAccount(api, 'anna');
      const oldCookie = await signIn(api, 'anna');

      const response = await send(api, 'POST', `/users/${anna.id}/password`, {
        cookie: adminCookie,
        body: { temporaryPassword: 'temporary two' },
      });

      expect(response.status).toBe(204);
      expect(
        (await send(api, 'GET', '/auth/me', { cookie: oldCookie })).status,
      ).toBe(401);
      const failed = await send(api, 'POST', '/auth/login', {
        body: { username: 'anna', password: PASSWORD },
      });
      expect(failed.status).toBe(401);
      const cookie = await signIn(api, 'anna', 'temporary two');
      const me = await send(api, 'GET', '/auth/me', { cookie });
      expect(((await me.json()) as CurrentUser).mustChangePassword).toBe(true);
    });

    it('is 400 for a short password or bad id, 404 for an unknown user', async () => {
      const anna = await createAccount(api, 'anna');
      const post = (id: string, temporaryPassword: string) =>
        send(api, 'POST', `/users/${id}/password`, {
          cookie: adminCookie,
          body: { temporaryPassword },
        });

      expect((await post(anna.id, 'short')).status).toBe(400);
      expect((await post('nope', 'long enough pw')).status).toBe(400);
      expect((await post(UNKNOWN, 'long enough pw')).status).toBe(404);
    });

    it('is 401 without a session and 403 for a non-admin', async () => {
      const anna = await createAccount(api, 'anna');
      const body = { temporaryPassword: 'temporary two' };

      expect(
        (await send(api, 'POST', `/users/${anna.id}/password`, { body }))
          .status,
      ).toBe(401);
      expect(
        (
          await send(api, 'POST', `/users/${anna.id}/password`, {
            body,
            cookie: await signIn(api, 'anna'),
          })
        ).status,
      ).toBe(403);
    });
  });
});
