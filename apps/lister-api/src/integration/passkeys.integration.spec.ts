import { eq } from 'drizzle-orm';
import { schema } from '@lister/api/data-access-db';
import { VirtualAuthenticator } from '@lister/api/feature-auth';
import type { CurrentUser, PasskeyInfo } from '@lister/shared/api-contracts';
import {
  createAccount,
  send,
  sessionCookieOf,
  signIn,
} from '../testing/auth-client';
import { type TestApp, createTestApp } from '../testing/create-test-app';

// Without PUBLIC_URL the relying party is localhost, on the dev server's origin.
const ORIGIN = 'http://localhost:4200';

describe('passkeys', () => {
  let api: TestApp;
  beforeEach(async () => {
    api = await createTestApp();
  });
  afterEach(() => api.close());

  const device = () => new VirtualAuthenticator('localhost', ORIGIN);

  async function addPasskey(
    cookie: string,
    authenticator = device(),
    name = 'My phone',
  ) {
    const options = await (
      await send(api, 'POST', '/passkeys/options', { cookie })
    ).json();
    const response = await send(api, 'POST', '/passkeys', {
      cookie,
      body: { name, response: authenticator.register(options.challenge) },
    });
    return { authenticator, response };
  }

  describe('POST /api/passkeys/options', () => {
    it('answers with registration options for a discoverable credential', async () => {
      await createAccount(api, 'anna');
      const cookie = await signIn(api, 'anna');

      const response = await send(api, 'POST', '/passkeys/options', { cookie });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        rp: { id: 'localhost', name: 'Lister' },
        user: { name: 'anna' },
        authenticatorSelection: { residentKey: 'required' },
      });
    });

    it('needs a session', async () => {
      expect((await send(api, 'POST', '/passkeys/options')).status).toBe(401);
    });

    it('is closed while the password must be changed', async () => {
      await createAccount(api, 'anna', { mustChangePassword: true });
      const cookie = await signIn(api, 'anna');

      expect(
        (await send(api, 'POST', '/passkeys/options', { cookie })).status,
      ).toBe(403);
    });
  });

  describe('POST /api/passkeys', () => {
    it('adds a passkey, which is then listed with its name', async () => {
      const anna = await createAccount(api, 'anna');
      const cookie = await signIn(api, 'anna');

      const { response } = await addPasskey(cookie, device(), 'My phone');

      expect(response.status).toBe(201);
      const added = (await response.json()) as PasskeyInfo;
      expect(added).toMatchObject({ name: 'My phone', lastUsedAt: null });
      const listed = await send(api, 'GET', '/passkeys', { cookie });
      expect(await listed.json()).toEqual([added]);
      expect(
        api.database.db
          .select()
          .from(schema.passkeys)
          .where(eq(schema.passkeys.userId, anna.id))
          .all(),
      ).toHaveLength(1);
    });

    it('rejects a missing or overlong name and a missing response with 400', async () => {
      await createAccount(api, 'anna');
      const cookie = await signIn(api, 'anna');
      const authenticator = device();
      const options = await (
        await send(api, 'POST', '/passkeys/options', { cookie })
      ).json();
      const registration = authenticator.register(options.challenge);

      for (const body of [
        { name: '', response: registration },
        { name: 'x'.repeat(61), response: registration },
        { name: '   ', response: registration },
        { name: 'ok' },
        { name: 'ok', response: 'nope' },
      ]) {
        const response = await send(api, 'POST', '/passkeys', { cookie, body });
        expect(response.status).toBe(400);
      }
      expect(api.database.db.select().from(schema.passkeys).all()).toEqual([]);
    });

    it('rejects an answer without a pending challenge with 400', async () => {
      await createAccount(api, 'anna');
      const cookie = await signIn(api, 'anna');

      const response = await send(api, 'POST', '/passkeys', {
        cookie,
        body: { name: 'x', response: device().register('made-up-challenge') },
      });

      expect(response.status).toBe(400);
    });

    it('rejects a challenge that was issued to another user with 400', async () => {
      await createAccount(api, 'anna');
      await createAccount(api, 'ben');
      const annaCookie = await signIn(api, 'anna');
      const benCookie = await signIn(api, 'ben');
      const options = await (
        await send(api, 'POST', '/passkeys/options', { cookie: annaCookie })
      ).json();

      const response = await send(api, 'POST', '/passkeys', {
        cookie: benCookie,
        body: {
          name: 'x',
          response: device().register(options.challenge),
        },
      });

      expect(response.status).toBe(400);
    });

    it('needs a session', async () => {
      const response = await send(api, 'POST', '/passkeys', {
        body: { name: 'x', response: {} },
      });
      expect(response.status).toBe(401);
    });

    it('refuses a request from another site with 403', async () => {
      await createAccount(api, 'anna');
      const cookie = await signIn(api, 'anna');
      const response = await send(api, 'POST', '/passkeys/options', {
        cookie,
        headers: { Origin: 'https://evil.example' },
      });
      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/passkeys and DELETE /api/passkeys/:id', () => {
    it('needs a session', async () => {
      expect((await send(api, 'GET', '/passkeys')).status).toBe(401);
      expect((await send(api, 'DELETE', '/passkeys/abc')).status).toBe(401);
    });

    it("lists only the user's own passkeys", async () => {
      await createAccount(api, 'anna');
      await createAccount(api, 'ben');
      const annaCookie = await signIn(api, 'anna');
      const benCookie = await signIn(api, 'ben');
      await addPasskey(annaCookie, device(), 'Anna phone');
      await addPasskey(benCookie, device(), 'Ben key');

      const anna = (await (
        await send(api, 'GET', '/passkeys', { cookie: annaCookie })
      ).json()) as PasskeyInfo[];
      const ben = (await (
        await send(api, 'GET', '/passkeys', { cookie: benCookie })
      ).json()) as PasskeyInfo[];

      expect(anna.map((p) => p.name)).toEqual(['Anna phone']);
      expect(ben.map((p) => p.name)).toEqual(['Ben key']);
    });

    it('removes the own passkey, which then no longer signs in', async () => {
      const anna = await createAccount(api, 'anna');
      const cookie = await signIn(api, 'anna');
      const { authenticator, response } = await addPasskey(cookie);
      const { id } = (await response.json()) as PasskeyInfo;

      const removed = await send(api, 'DELETE', `/passkeys/${id}`, { cookie });

      expect(removed.status).toBe(204);
      expect(
        await (await send(api, 'GET', '/passkeys', { cookie })).json(),
      ).toEqual([]);
      const options = await (
        await send(api, 'POST', '/auth/passkey/options')
      ).json();
      const login = await send(api, 'POST', '/auth/passkey/login', {
        body: {
          response: authenticator.authenticate(options.challenge, anna.id),
        },
      });
      expect(login.status).toBe(401);
    });

    it("never removes someone else's passkey: 404, and it stays", async () => {
      await createAccount(api, 'anna');
      await createAccount(api, 'ben');
      const annaCookie = await signIn(api, 'anna');
      const benCookie = await signIn(api, 'ben');
      const { response } = await addPasskey(annaCookie);
      const { id } = (await response.json()) as PasskeyInfo;

      const attempt = await send(api, 'DELETE', `/passkeys/${id}`, {
        cookie: benCookie,
      });

      expect(attempt.status).toBe(404);
      expect(api.database.db.select().from(schema.passkeys).all()).toHaveLength(
        1,
      );
    });

    it('answers 404 for an unknown id', async () => {
      await createAccount(api, 'anna');
      const cookie = await signIn(api, 'anna');

      expect(
        (await send(api, 'DELETE', '/passkeys/unknown', { cookie })).status,
      ).toBe(404);
    });

    it('is deleted with the account', async () => {
      const anna = await createAccount(api, 'anna');
      const cookie = await signIn(api, 'anna');
      await addPasskey(cookie);

      api.database.db
        .delete(schema.users)
        .where(eq(schema.users.id, anna.id))
        .run();

      expect(api.database.db.select().from(schema.passkeys).all()).toEqual([]);
    });
  });

  describe('sign-in with a passkey', () => {
    async function signInWith(
      authenticator: VirtualAuthenticator,
      user: Pick<CurrentUser, 'id'>,
    ) {
      const options = await (
        await send(api, 'POST', '/auth/passkey/options')
      ).json();
      return send(api, 'POST', '/auth/passkey/login', {
        body: {
          response: authenticator.authenticate(options.challenge, user.id),
        },
      });
    }

    it('POST /api/auth/passkey/options needs no session and names no user', async () => {
      const response = await send(api, 'POST', '/auth/passkey/options');

      expect(response.status).toBe(200);
      const options = await response.json();
      expect(options).toMatchObject({
        rpId: 'localhost',
        userVerification: 'required',
      });
      expect(options.allowCredentials ?? []).toEqual([]);
    });

    it('POST /api/auth/passkey/login starts the same session as the password, then works with it', async () => {
      const anna = await createAccount(api, 'anna');
      const { authenticator } = await addPasskey(await signIn(api, 'anna'));

      const response = await signInWith(authenticator, anna);

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        id: anna.id,
        username: 'anna',
        mustChangePassword: false,
      });
      const cookie = sessionCookieOf(response);
      const header = response.headers
        .getSetCookie()
        .find((c) => c.startsWith('lister_session='));
      expect(header).toContain('HttpOnly');
      expect(header).toContain('SameSite=Lax');
      const me = await send(api, 'GET', '/auth/me', { cookie });
      expect(me.status).toBe(200);
      const [passkey] = (await (
        await send(api, 'GET', '/passkeys', { cookie })
      ).json()) as PasskeyInfo[];
      expect(passkey.lastUsedAt).not.toBeNull();
    });

    it('reports a forced password change like the password sign-in does', async () => {
      const anna = await createAccount(api, 'anna');
      const { authenticator } = await addPasskey(await signIn(api, 'anna'));
      api.database.db
        .update(schema.users)
        .set({ mustChangePassword: true })
        .run();

      const response = await signInWith(authenticator, anna);

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ mustChangePassword: true });
      const cookie = sessionCookieOf(response);
      expect((await send(api, 'GET', '/passkeys', { cookie })).status).toBe(
        403,
      );
      expect((await send(api, 'GET', '/auth/me', { cookie })).status).toBe(200);
    });

    it('refuses an unknown passkey with 401 and no cookie', async () => {
      const anna = await createAccount(api, 'anna');

      const response = await signInWith(device(), anna);

      expect(response.status).toBe(401);
      expect(sessionCookieOf(response)).toBeNull();
    });

    it('refuses a challenge it did not issue, or already used, with 401', async () => {
      const anna = await createAccount(api, 'anna');
      const { authenticator } = await addPasskey(await signIn(api, 'anna'));
      const options = await (
        await send(api, 'POST', '/auth/passkey/options')
      ).json();
      const answer = authenticator.authenticate(options.challenge, anna.id);
      const body = { response: answer };

      expect(
        (await send(api, 'POST', '/auth/passkey/login', { body })).status,
      ).toBe(200);
      expect(
        (await send(api, 'POST', '/auth/passkey/login', { body })).status,
      ).toBe(401);
      const forged = await send(api, 'POST', '/auth/passkey/login', {
        body: { response: authenticator.authenticate('invented', anna.id) },
      });
      expect(forged.status).toBe(401);
    });

    it('rejects a body without a response with 400', async () => {
      const response = await send(api, 'POST', '/auth/passkey/login', {
        body: {},
      });
      expect(response.status).toBe(400);
    });

    it('counts failures like password sign-in does: too many give 429', async () => {
      const anna = await createAccount(api, 'anna');
      let last = 0;
      for (let i = 0; i < 12; i++) {
        last = (await signInWith(device(), anna)).status;
      }
      expect(last).toBe(429);
    });
  });
});
