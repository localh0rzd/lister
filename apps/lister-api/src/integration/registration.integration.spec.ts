import { eq } from 'drizzle-orm';
import { schema } from '@lister/api/data-access-db';
import type {
  CurrentUser,
  RegistrationToken,
  RegistrationTokenList,
} from '@lister/shared/api-contracts';
import {
  PASSWORD,
  createAccount,
  send,
  sessionCookieOf,
  signIn,
} from '../testing/auth-client';
import { type TestApp, createTestApp } from '../testing/create-test-app';

describe('registration tokens', () => {
  let api: TestApp;
  let adminCookie: string;

  beforeEach(async () => {
    api = await createTestApp();
    await createAccount(api, 'boss', { isAdmin: true });
    adminCookie = await signIn(api, 'boss');
  });
  afterEach(() => api.close());

  async function createToken(): Promise<RegistrationToken> {
    const response = await send(api, 'POST', '/registration-tokens', {
      cookie: adminCookie,
    });
    expect(response.status).toBe(201);
    return (await response.json()) as RegistrationToken;
  }
  const register = (token: string, override: object = {}) =>
    send(api, 'POST', '/auth/register', {
      body: {
        token,
        username: 'Newbie',
        displayName: 'New Person',
        password: PASSWORD,
        ...override,
      },
    });
  const storedTokens = () =>
    api.database.db.select().from(schema.registrationTokens).all();

  describe('admin endpoints', () => {
    it('create, list and remove, for an admin', async () => {
      const created = await createToken();
      expect(created.token).toMatch(/^[A-Z0-9]{12}$/);
      expect(created.createdBy).toBe('boss display');
      expect(
        Date.parse(created.expiresAt) - Date.parse(created.createdAt),
      ).toBe(7 * 24 * 60 * 60 * 1000);

      const listed = await send(api, 'GET', '/registration-tokens', {
        cookie: adminCookie,
      });
      expect(listed.status).toBe(200);
      const list = (await listed.json()) as RegistrationTokenList;
      expect(list.tokens).toEqual([created]);

      const removed = await send(
        api,
        'DELETE',
        `/registration-tokens/${created.token}`,
        { cookie: adminCookie },
      );
      expect(removed.status).toBe(204);
      expect(storedTokens()).toEqual([]);
      const again = await send(
        api,
        'DELETE',
        `/registration-tokens/${created.token}`,
        { cookie: adminCookie },
      );
      expect(again.status).toBe(404);
    });

    it('does not list expired tokens', async () => {
      const created = await createToken();
      api.database.db
        .update(schema.registrationTokens)
        .set({ expiresAt: Date.now() - 1 })
        .where(eq(schema.registrationTokens.token, created.token))
        .run();

      const response = await send(api, 'GET', '/registration-tokens', {
        cookie: adminCookie,
      });

      expect(((await response.json()) as RegistrationTokenList).tokens).toEqual(
        [],
      );
    });

    it('answers 401 when signed out and 403 to a non-admin, for every endpoint', async () => {
      const { token } = await createToken();
      await createAccount(api, 'anna');
      const annaCookie = await signIn(api, 'anna');
      const calls: [string, string][] = [
        ['GET', '/registration-tokens'],
        ['POST', '/registration-tokens'],
        ['DELETE', `/registration-tokens/${token}`],
      ];

      for (const [method, path] of calls) {
        expect((await send(api, method, path)).status).toBe(401);
        expect(
          (await send(api, method, path, { cookie: annaCookie })).status,
        ).toBe(403);
      }
      expect(storedTokens()).toHaveLength(1);
    });
  });

  describe('POST /api/auth/register', () => {
    it('creates a regular user with a personal space, signed in, and spends the token', async () => {
      const { token } = await createToken();

      const response = await register(token);

      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({
        username: 'Newbie',
        displayName: 'New Person',
        isAdmin: false,
        mustChangePassword: false,
      });
      const cookie = sessionCookieOf(response) as string;
      const me = await send(api, 'GET', '/auth/me', { cookie });
      expect(((await me.json()) as CurrentUser).username).toBe('Newbie');
      expect((await send(api, 'GET', '/users', { cookie })).status).toBe(403);
      const spaces = api.database.db
        .select()
        .from(schema.spaces)
        .where(eq(schema.spaces.name, 'New Person'))
        .all();
      expect(spaces).toMatchObject([{ personal: true }]);
      expect(storedTokens()).toEqual([]);
      await expect(signIn(api, 'newbie')).resolves.toBeTruthy();
    });

    it('accepts the token in lower case with spaces around it', async () => {
      const { token } = await createToken();

      const response = await register(`  ${token.toLowerCase()} `);

      expect(response.status).toBe(201);
    });

    it('works once: a second registration with the same token gets 403', async () => {
      const { token } = await createToken();
      await register(token);

      const again = await register(token, { username: 'second' });

      expect(again.status).toBe(403);
      expect(api.database.db.select().from(schema.users).all()).toHaveLength(2);
    });

    it('lets only one of two simultaneous registrations win', async () => {
      const { token } = await createToken();

      const results = await Promise.all([
        register(token, { username: 'one' }),
        register(token, { username: 'two' }),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 403]);
      expect(api.database.db.select().from(schema.users).all()).toHaveLength(2);
    });

    it('refuses a removed token', async () => {
      const { token } = await createToken();
      await send(api, 'DELETE', `/registration-tokens/${token}`, {
        cookie: adminCookie,
      });

      expect((await register(token)).status).toBe(403);
    });

    it('refuses an expired token', async () => {
      const { token } = await createToken();
      api.database.db
        .update(schema.registrationTokens)
        .set({ expiresAt: Date.now() - 1 })
        .run();

      const response = await register(token);

      expect(response.status).toBe(403);
      expect(api.database.db.select().from(schema.users).all()).toHaveLength(1);
    });

    it('refuses an unknown token with the same error as a used one', async () => {
      const { token } = await createToken();
      await register(token);

      const unknown = await register('ZZZZZZZZZZZZ', { username: 'a' });
      const used = await register(token, { username: 'b' });

      expect(unknown.status).toBe(403);
      expect(await unknown.json()).toEqual(await used.json());
    });

    it('answers 409 for a taken username, and the token stays usable', async () => {
      const { token } = await createToken();
      await createAccount(api, 'newbie');

      const taken = await register(token);

      expect(taken.status).toBe(409);
      expect(await taken.json()).toMatchObject({
        message: 'That username is taken',
      });
      expect(storedTokens()).toHaveLength(1);
      expect((await register(token, { username: 'other' })).status).toBe(201);
    });

    it.each([
      ['a short password', { password: 'short' }],
      ['an odd username', { username: 'no spaces' }],
      ['no display name', { displayName: ' ' }],
    ])('answers 400 for %s and keeps the token', async (_name, override) => {
      const { token } = await createToken();

      const response = await register(token, override);

      expect(response.status).toBe(400);
      expect(storedTokens()).toHaveLength(1);
    });

    it('counts registrations that fail on a taken username, and keeps the token', async () => {
      const { token } = await createToken();
      await createAccount(api, 'newbie');
      for (let i = 0; i < 10; i++) {
        expect((await register(token)).status).toBe(409);
      }

      const response = await register(token, { username: 'other' });

      expect(response.status).toBe(429);
      expect(storedTokens()).toHaveLength(1);
    });

    it('does not count a successful registration', async () => {
      for (let i = 0; i < 9; i++) await register('GUESSGUESS12');
      const { token } = await createToken();
      expect((await register(token)).status).toBe(201);

      expect((await register('GUESSGUESS12', { username: 'x' })).status).toBe(
        403,
      );
    });

    it('rate-limits wrong tokens like wrong passwords', async () => {
      const { token } = await createToken();
      for (let i = 0; i < 10; i++) await register('GUESSGUESS12');

      const response = await register(token);

      expect(response.status).toBe(429);
      expect(storedTokens()).toHaveLength(1);
    });
  });
});
