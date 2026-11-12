import { Controller, Get, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { schema } from '@lister/api/data-access-db';
import {
  AdminOnly,
  SESSION_LIFETIME_MS,
  runResetPasswordCommand,
} from '@lister/api/feature-auth';
import type { CurrentUser } from '@lister/shared/api-contracts';
import {
  PASSWORD,
  createAccount,
  send,
  sessionCookieOf,
  signIn,
} from '../testing/auth-client';
import { type TestApp, createTestApp } from '../testing/create-test-app';

/** Guarded routes to probe the global guard with; the real ones come with T-023 and later. */
@Controller('probe')
class ProbeController {
  @Get()
  anyone() {
    return { ok: true };
  }

  @AdminOnly()
  @Get('admin')
  admin() {
    return { ok: true };
  }
}

describe('auth', () => {
  let api: TestApp;
  beforeEach(async () => {
    api = await createTestApp({ controllers: [ProbeController] });
  });
  afterEach(async () => {
    await api.close();
    vi.restoreAllMocks();
    delete process.env['PUBLIC_URL'];
  });

  describe('POST /api/auth/login', () => {
    it('signs in and sets an httpOnly, SameSite=Lax cookie that lasts 90 days', async () => {
      await createAccount(api, 'anna');

      const response = await send(api, 'POST', '/auth/login', {
        body: { username: 'ANNA', password: PASSWORD },
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        username: 'anna',
        displayName: 'anna display',
        isAdmin: false,
        mustChangePassword: false,
      });
      const cookie = response.headers
        .getSetCookie()
        .find((c) => c.startsWith('lister_session='));
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain(`Max-Age=${SESSION_LIFETIME_MS / 1000}`);
      expect(cookie).not.toContain('Secure');
      expect(api.database.db.select().from(schema.sessions).all()).toHaveLength(
        1,
      );
    });

    it('marks the cookie Secure when PUBLIC_URL is https', async () => {
      process.env['PUBLIC_URL'] = 'https://lister.example.org';
      await createAccount(api, 'anna');

      const response = await send(api, 'POST', '/auth/login', {
        body: { username: 'anna', password: PASSWORD },
      });

      expect(sessionCookieOf(response)).not.toBeNull();
      expect(response.headers.getSetCookie().join()).toContain('Secure');
    });

    it.each([
      ['a wrong password', { username: 'anna', password: 'nope nope nope' }],
      ['an unknown user', { username: 'nobody', password: PASSWORD }],
    ])('answers 401 for %s, without a cookie', async (_name, body) => {
      await createAccount(api, 'anna');

      const response = await send(api, 'POST', '/auth/login', { body });

      expect(response.status).toBe(401);
      expect(sessionCookieOf(response)).toBeNull();
    });

    it.each([
      ['no body', {}],
      ['an empty username', { username: '', password: PASSWORD }],
      ['a missing password', { username: 'anna' }],
      ['a non-string password', { username: 'anna', password: 5 }],
    ])('answers 400 for %s', async (_name, body) => {
      const response = await send(api, 'POST', '/auth/login', { body });

      expect(response.status).toBe(400);
    });

    it('answers 429 after 10 failed attempts from one address, only for that address', async () => {
      await createAccount(api, 'anna');
      const attempt = (ip: string, password: string) =>
        send(api, 'POST', '/auth/login', {
          body: { username: 'anna', password },
          headers: { 'X-Forwarded-For': ip },
        });

      for (let i = 0; i < 10; i++) {
        expect((await attempt('203.0.113.7', 'wrong wrong')).status).toBe(401);
      }
      const blocked = await attempt('203.0.113.7', PASSWORD);

      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
      expect((await attempt('203.0.113.8', PASSWORD)).status).toBe(200);
    });

    it('counts guesses sent in parallel before any of them has failed', async () => {
      await createAccount(api, 'anna');
      const guesses = Array.from({ length: 30 }, (_, i) =>
        send(api, 'POST', '/auth/login', {
          body: { username: 'anna', password: `wrong guess ${i}` },
          headers: { 'X-Forwarded-For': '203.0.113.7' },
        }).then((response) => response.status),
      );

      const statuses = await Promise.all(guesses);

      expect(statuses.filter((status) => status === 401)).toHaveLength(10);
      expect(statuses.filter((status) => status === 429)).toHaveLength(20);
    });

    it('does not count successful sign-ins', async () => {
      await createAccount(api, 'anna');
      for (let i = 0; i < 12; i++) {
        const response = await send(api, 'POST', '/auth/login', {
          body: { username: 'anna', password: PASSWORD },
          headers: { 'X-Forwarded-For': '203.0.113.7' },
        });
        expect(response.status).toBe(200);
      }
    });

    it('limits an IPv6 client by its /64, not by single addresses', async () => {
      await createAccount(api, 'anna');
      for (let i = 1; i <= 10; i++) {
        const response = await send(api, 'POST', '/auth/login', {
          body: { username: 'anna', password: 'wrong wrong' },
          headers: { 'X-Forwarded-For': `2001:db8:1:2::${i.toString(16)}` },
        });
        expect(response.status).toBe(401);
      }

      const sameNetwork = await send(api, 'POST', '/auth/login', {
        body: { username: 'anna', password: PASSWORD },
        headers: { 'X-Forwarded-For': '2001:db8:1:2:ffff::1' },
      });
      const otherNetwork = await send(api, 'POST', '/auth/login', {
        body: { username: 'anna', password: PASSWORD },
        headers: { 'X-Forwarded-For': '2001:db8:1:3::1' },
      });

      expect(sameNetwork.status).toBe(429);
      expect(otherNetwork.status).toBe(200);
    });
  });

  describe('GET /api/auth/me', () => {
    it('answers 401 without a session or with a made-up one', async () => {
      expect((await send(api, 'GET', '/auth/me')).status).toBe(401);
      expect(
        (
          await send(api, 'GET', '/auth/me', {
            cookie: 'lister_session=made-up',
          })
        ).status,
      ).toBe(401);
    });

    it('returns the signed-in user, without a password hash', async () => {
      await createAccount(api, 'anna', { isAdmin: true });
      const cookie = await signIn(api, 'anna');

      const response = await send(api, 'GET', '/auth/me', { cookie });

      expect(response.status).toBe(200);
      const body = (await response.json()) as CurrentUser;
      expect(body).toMatchObject({ username: 'anna', isAdmin: true });
      expect(JSON.stringify(body)).not.toContain('argon2');
    });

    it('answers 401 once the session has expired, and deletes it', async () => {
      await createAccount(api, 'anna');
      const cookie = await signIn(api, 'anna');
      api.database.db
        .update(schema.sessions)
        .set({ expiresAt: Date.now() - 1 })
        .run();

      expect((await send(api, 'GET', '/auth/me', { cookie })).status).toBe(401);
      expect(api.database.db.select().from(schema.sessions).all()).toEqual([]);
    });

    it('renews a session that has been used for a while, and the cookie with it', async () => {
      await createAccount(api, 'anna');
      const cookie = await signIn(api, 'anna');
      const soon = Date.now() + 5 * 24 * 60 * 60 * 1000;
      api.database.db.update(schema.sessions).set({ expiresAt: soon }).run();

      const response = await send(api, 'GET', '/auth/me', { cookie });

      expect(response.status).toBe(200);
      expect(sessionCookieOf(response)).toBe(cookie);
      const [session] = api.database.db.select().from(schema.sessions).all();
      expect(session.expiresAt).toBeGreaterThan(
        Date.now() + SESSION_LIFETIME_MS - 60_000,
      );
    });
  });

  describe('POST /api/auth/logout', () => {
    it('ends the session and clears the cookie', async () => {
      await createAccount(api, 'anna');
      const cookie = await signIn(api, 'anna');

      const response = await send(api, 'POST', '/auth/logout', { cookie });

      expect(response.status).toBe(204);
      expect(response.headers.getSetCookie().join()).toMatch(
        /lister_session=;.*Expires=Thu, 01 Jan 1970/,
      );
      expect((await send(api, 'GET', '/auth/me', { cookie })).status).toBe(401);
      expect(api.database.db.select().from(schema.sessions).all()).toEqual([]);
    });

    it('only ends its own session', async () => {
      await createAccount(api, 'anna');
      const phone = await signIn(api, 'anna');
      const laptop = await signIn(api, 'anna');

      await send(api, 'POST', '/auth/logout', { cookie: phone });

      expect(
        (await send(api, 'GET', '/auth/me', { cookie: laptop })).status,
      ).toBe(200);
    });

    it('is fine without a session', async () => {
      expect((await send(api, 'POST', '/auth/logout')).status).toBe(204);
    });
  });

  describe('POST /api/auth/password', () => {
    const NEW_PASSWORD = 'a brand new password';

    it('changes the password and keeps only this session', async () => {
      await createAccount(api, 'anna');
      const phone = await signIn(api, 'anna');
      const laptop = await signIn(api, 'anna');

      const response = await send(api, 'POST', '/auth/password', {
        cookie: phone,
        body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
      });

      expect(response.status).toBe(200);
      expect(
        (await send(api, 'GET', '/auth/me', { cookie: phone })).status,
      ).toBe(200);
      expect(
        (await send(api, 'GET', '/auth/me', { cookie: laptop })).status,
      ).toBe(401);
      await expect(signIn(api, 'anna', PASSWORD)).rejects.toThrow();
      await expect(signIn(api, 'anna', NEW_PASSWORD)).resolves.toBeTruthy();
    });

    it.each([
      [
        'a wrong current password',
        { currentPassword: 'wrong wrong', newPassword: 'a brand new password' },
        400,
      ],
      [
        'a new password that is too short',
        { currentPassword: PASSWORD, newPassword: 'short' },
        400,
      ],
      [
        'the same password again',
        { currentPassword: PASSWORD, newPassword: PASSWORD },
        400,
      ],
      ['no body', {}, 400],
    ])('answers %s with %i', async (_name, body, status) => {
      await createAccount(api, 'anna');
      const cookie = await signIn(api, 'anna');

      const response = await send(api, 'POST', '/auth/password', {
        cookie,
        body,
      });

      expect(response.status).toBe(status);
      await expect(signIn(api, 'anna')).resolves.toBeTruthy();
    });

    it('limits guesses of the current password like sign-in attempts', async () => {
      await createAccount(api, 'anna');
      const cookie = await signIn(api, 'anna');
      const change = (currentPassword: string) =>
        send(api, 'POST', '/auth/password', {
          cookie,
          body: { currentPassword, newPassword: NEW_PASSWORD },
          headers: { 'X-Forwarded-For': '203.0.113.7' },
        });

      const guesses = await Promise.all(
        Array.from({ length: 12 }, (_, i) => change(`wrong guess ${i}`)),
      );
      const blocked = await change(PASSWORD);

      expect(guesses.filter((r) => r.status === 400)).toHaveLength(10);
      expect(guesses.filter((r) => r.status === 429)).toHaveLength(2);
      expect(blocked.status).toBe(429);
      expect((await send(api, 'GET', '/auth/me', { cookie })).status).toBe(200);
    });

    it('answers 401 without a session', async () => {
      const response = await send(api, 'POST', '/auth/password', {
        body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
      });

      expect(response.status).toBe(401);
    });
  });

  describe('the guard', () => {
    it('refuses guarded routes without a session', async () => {
      expect((await send(api, 'GET', '/probe')).status).toBe(401);
    });

    it('lets a signed-in user through, and admin routes only for admins', async () => {
      await createAccount(api, 'anna');
      await createAccount(api, 'root', { isAdmin: true });
      const anna = await signIn(api, 'anna');
      const root = await signIn(api, 'root');

      expect((await send(api, 'GET', '/probe', { cookie: anna })).status).toBe(
        200,
      );
      expect(
        (await send(api, 'GET', '/probe/admin', { cookie: anna })).status,
      ).toBe(403);
      expect(
        (await send(api, 'GET', '/probe/admin', { cookie: root })).status,
      ).toBe(200);
    });
  });

  describe('a user who must change their password', () => {
    it('is refused everywhere else until the password is changed', async () => {
      await createAccount(api, 'anna', { mustChangePassword: true });
      const cookie = await signIn(api, 'anna');

      const me = await send(api, 'GET', '/auth/me', { cookie });
      expect(((await me.json()) as CurrentUser).mustChangePassword).toBe(true);
      expect((await send(api, 'GET', '/probe', { cookie })).status).toBe(403);

      const changed = await send(api, 'POST', '/auth/password', {
        cookie,
        body: {
          currentPassword: PASSWORD,
          newPassword: 'a brand new password',
        },
      });
      expect(changed.status).toBe(200);
      expect(((await changed.json()) as CurrentUser).mustChangePassword).toBe(
        false,
      );
      expect((await send(api, 'GET', '/probe', { cookie })).status).toBe(200);
    });

    it('can still sign out', async () => {
      await createAccount(api, 'anna', { mustChangePassword: true });
      const cookie = await signIn(api, 'anna');

      expect((await send(api, 'POST', '/auth/logout', { cookie })).status).toBe(
        204,
      );
      expect((await send(api, 'GET', '/auth/me', { cookie })).status).toBe(401);
    });
  });

  describe('first-run setup', () => {
    async function startWithoutAccounts() {
      await api.close();
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      api = await createTestApp();
      const logged = warn.mock.calls
        .map(([message]) => String(message))
        .find((message) => message.includes('setup token'));
      const token = logged ? /token: (\S+)$/.exec(logged)?.[1] : undefined;
      return { token, logged };
    }
    const body = (token: string) => ({
      token,
      username: 'Root',
      displayName: 'The Admin',
      password: PASSWORD,
    });

    it('logs a token at startup, and using it creates an admin who is signed in', async () => {
      const { token } = await startWithoutAccounts();
      expect(token).toBeTruthy();

      const response = await send(api, 'POST', '/auth/setup', {
        body: body(token as string),
      });

      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({
        username: 'Root',
        displayName: 'The Admin',
        isAdmin: true,
        mustChangePassword: false,
      });
      const cookie = sessionCookieOf(response);
      expect(cookie).not.toBeNull();
      expect((await send(api, 'GET', '/auth/me', { cookie })).status).toBe(200);
      await expect(signIn(api, 'root')).resolves.toBeTruthy();
    });

    it('works only once: the token is spent, and setup is gone', async () => {
      const { token } = await startWithoutAccounts();
      await send(api, 'POST', '/auth/setup', { body: body(token as string) });

      const again = await send(api, 'POST', '/auth/setup', {
        body: { ...body(token as string), username: 'second' },
      });

      expect(again.status).toBe(404);
      expect(api.database.db.select().from(schema.users).all()).toHaveLength(1);
    });

    it('refuses a wrong token with 403 and creates nothing', async () => {
      await startWithoutAccounts();

      const response = await send(api, 'POST', '/auth/setup', {
        body: body('not-the-token'),
      });

      expect(response.status).toBe(403);
      expect(api.database.db.select().from(schema.users).all()).toEqual([]);
    });

    it('rate-limits wrong tokens like wrong passwords', async () => {
      const { token } = await startWithoutAccounts();
      for (let i = 0; i < 10; i++) {
        await send(api, 'POST', '/auth/setup', { body: body('guess') });
      }

      const response = await send(api, 'POST', '/auth/setup', {
        body: body(token as string),
      });

      expect(response.status).toBe(429);
    });

    it.each([
      ['a short password', { password: 'short' }],
      ['an empty username', { username: '' }],
      ['an odd username', { username: 'no spaces' }],
      ['no display name', { displayName: ' ' }],
    ])('answers 400 for %s', async (_name, override) => {
      const { token } = await startWithoutAccounts();

      const response = await send(api, 'POST', '/auth/setup', {
        body: { ...body(token as string), ...override },
      });

      expect(response.status).toBe(400);
      expect(api.database.db.select().from(schema.users).all()).toEqual([]);
    });

    it('logs no token, and answers 404, when an account already exists', async () => {
      await createAccount(api, 'anna');

      const response = await send(api, 'POST', '/auth/setup', {
        body: body('anything'),
      });

      expect(response.status).toBe(404);
    });
  });

  describe('reset-password command', () => {
    it('sets a temporary password that must be changed, and ends the sessions', async () => {
      await createAccount(api, 'anna', { isAdmin: true });
      const cookie = await signIn(api, 'anna');
      const lines: string[] = [];

      const code = await runResetPasswordCommand(api.app, ['Anna'], (line) =>
        lines.push(line),
      );

      expect(code).toBe(0);
      const temporary = /: (\S+)$/.exec(lines[0])?.[1] as string;
      expect((await send(api, 'GET', '/auth/me', { cookie })).status).toBe(401);
      await expect(signIn(api, 'anna', PASSWORD)).rejects.toThrow();
      const fresh = await signIn(api, 'anna', temporary);
      const me = await send(api, 'GET', '/auth/me', { cookie: fresh });
      expect(((await me.json()) as CurrentUser).mustChangePassword).toBe(true);
      const stored = api.database.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.username, 'anna'))
        .get();
      expect(stored?.passwordHash).not.toContain(temporary);
    });

    it('reports an unknown user', async () => {
      const lines: string[] = [];

      expect(
        await runResetPasswordCommand(api.app, ['nobody'], (l) =>
          lines.push(l),
        ),
      ).toBe(1);
    });
  });

  it('keeps the health check public', async () => {
    expect((await send(api, 'GET', '/health')).status).toBe(200);
  });
});
