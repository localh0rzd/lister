import { ConflictException, UnauthorizedException } from '@nestjs/common';
import {
  type DatabaseConnection,
  createTestDatabase,
  schema,
} from '@lister/api/data-access-db';
import {
  AuthService,
  SESSION_LIFETIME_MS,
  SESSION_RENEW_AFTER_MS,
} from './auth.service';

const HOUR = 60 * 60 * 1000;

describe('AuthService', () => {
  let database: DatabaseConnection;
  let now: number;
  let auth: AuthService;

  beforeEach(() => {
    database = createTestDatabase();
    now = 1_000_000;
    auth = new AuthService(database, () => now);
  });
  afterEach(() => database.onApplicationShutdown());

  const newUser = (overrides = {}) => ({
    username: 'Anna',
    displayName: 'Anna A',
    password: 'correct horse',
    isAdmin: false,
    mustChangePassword: false,
    ...overrides,
  });

  describe('createUser', () => {
    it('stores a hash, never the password', async () => {
      await auth.createUser(newUser());

      const [row] = database.db.select().from(schema.users).all();
      expect(row.passwordHash).toMatch(/^argon2id\$/);
      expect(row.passwordHash).not.toContain('correct horse');
    });

    it('rejects a username that differs only in case', async () => {
      await auth.createUser(newUser());

      await expect(
        auth.createUser(newUser({ username: 'ANNA' })),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates the first admin only while no account exists', async () => {
      const admin = await auth.createFirstAdmin({
        username: 'root',
        displayName: 'Root',
        password: 'correct horse',
      });

      expect(admin).toMatchObject({ isAdmin: true, mustChangePassword: false });
      await expect(
        auth.createFirstAdmin({
          username: 'second',
          displayName: 'Second',
          password: 'correct horse',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('login', () => {
    it('signs in ignoring the case of the username', async () => {
      await auth.createUser(newUser());

      const signedIn = await auth.login(' anna ', 'correct horse');

      expect(signedIn.user.username).toBe('Anna');
      expect(signedIn.expiresAt).toBe(now + SESSION_LIFETIME_MS);
      expect(auth.authenticate(signedIn.token)?.user.id).toBe(signedIn.user.id);
    });

    it('stores only a hash of the session token', async () => {
      await auth.createUser(newUser());

      const { token } = await auth.login('anna', 'correct horse');

      const [session] = database.db.select().from(schema.sessions).all();
      expect(session.id).not.toBe(token);
      expect(session.id).toMatch(/^[0-9a-f]{64}$/);
    });

    it.each([
      ['a wrong password', 'anna', 'wrong password'],
      ['an unknown user', 'nobody', 'correct horse'],
    ])('answers 401 for %s', async (_name, username, password) => {
      await auth.createUser(newUser());

      await expect(auth.login(username, password)).rejects.toThrow(
        new UnauthorizedException('Wrong username or password'),
      );
    });
  });

  describe('sessions', () => {
    let token: string;
    beforeEach(async () => {
      await auth.createUser(newUser());
      token = (await auth.login('anna', 'correct horse')).token;
    });

    it('does not know an unknown token', () => {
      expect(auth.authenticate('not-a-token')).toBeNull();
    });

    it('expires after 90 days and deletes the session', () => {
      now += SESSION_LIFETIME_MS - 1;
      expect(auth.authenticate(token)).not.toBeNull();

      now += 1;
      // The renewal above pushed the expiry out; sign in fresh to test a plain expiry.
      database.db.update(schema.sessions).set({ expiresAt: now }).run();
      expect(auth.authenticate(token)).toBeNull();
      expect(database.db.select().from(schema.sessions).all()).toEqual([]);
    });

    it('renews on use, at most once an hour', () => {
      now += SESSION_RENEW_AFTER_MS - 1;
      expect(auth.authenticate(token)?.renewedUntil).toBeUndefined();

      now += 1;
      const renewed = auth.authenticate(token)?.renewedUntil;
      expect(renewed).toBe(now + SESSION_LIFETIME_MS);
      const [session] = database.db.select().from(schema.sessions).all();
      expect(session.expiresAt).toBe(renewed);
    });

    it('stays valid for as long as it is used', () => {
      for (let day = 0; day < 200; day++) {
        now += 24 * HOUR;
        expect(auth.authenticate(token)).not.toBeNull();
      }
    });

    it('ends one session, or all of a user’s but one', async () => {
      const second = await auth.login('anna', 'correct horse');
      const third = await auth.login('anna', 'correct horse');
      const secondId = auth.authenticate(second.token)?.sessionId as string;

      auth.endSessionsOf(second.user.id, secondId);
      expect(auth.authenticate(token)).toBeNull();
      expect(auth.authenticate(third.token)).toBeNull();
      expect(auth.authenticate(second.token)).not.toBeNull();

      auth.endSession(secondId);
      expect(auth.authenticate(second.token)).toBeNull();
    });

    it('purges expired sessions', () => {
      database.db
        .update(schema.sessions)
        .set({ expiresAt: now - 1 })
        .run();

      expect(auth.purgeExpiredSessions()).toBe(1);
    });
  });

  describe('changePassword', () => {
    it('needs the current password, then clears the forced change and other sessions', async () => {
      await auth.createUser(newUser({ mustChangePassword: true }));
      const first = await auth.login('anna', 'correct horse');
      const other = await auth.login('anna', 'correct horse');
      const sessionId = auth.authenticate(first.token)?.sessionId as string;

      await expect(
        auth.changePassword(first.user.id, sessionId, 'wrong', 'new password!'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      const changed = await auth.changePassword(
        first.user.id,
        sessionId,
        'correct horse',
        'new password!',
      );

      expect(changed.mustChangePassword).toBe(false);
      expect(auth.authenticate(first.token)).not.toBeNull();
      expect(auth.authenticate(other.token)).toBeNull();
      await expect(auth.login('anna', 'correct horse')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(auth.login('anna', 'new password!')).resolves.toBeDefined();
    });
  });

  describe('setTemporaryPassword', () => {
    it('forces a change, ends sessions and reports unknown users', async () => {
      await auth.createUser(newUser());
      const { token } = await auth.login('anna', 'correct horse');

      expect(await auth.setTemporaryPassword('nobody', 'x')).toBe(false);
      expect(await auth.setTemporaryPassword('ANNA', 'temporary-pass')).toBe(
        true,
      );

      expect(auth.authenticate(token)).toBeNull();
      const again = await auth.login('anna', 'temporary-pass');
      expect(again.user.mustChangePassword).toBe(true);
    });
  });
});
