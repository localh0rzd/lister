import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  type DatabaseConnection,
  createTestDatabase,
  schema,
} from '@lister/api/data-access-db';
import type { CurrentUser } from '@lister/shared/api-contracts';
import { AuthService } from './auth.service';
import {
  CHALLENGE_LIFETIME_MS,
  MAX_PENDING_CHALLENGES,
} from './challenge-store';
import { PasskeysService } from './passkeys.service';
import { VirtualAuthenticator } from './virtual-authenticator';

const ORIGIN = 'https://lister.example.com';

describe('PasskeysService', () => {
  let database: DatabaseConnection;
  let now: number;
  let passkeys: PasskeysService;
  let anna: CurrentUser;
  let ben: CurrentUser;

  beforeEach(async () => {
    process.env['PUBLIC_URL'] = ORIGIN;
    database = createTestDatabase();
    now = 1_000_000;
    const auth = new AuthService(database, () => now);
    passkeys = new PasskeysService(database, auth, () => now);
    const create = (username: string) =>
      auth.createUser({
        username,
        displayName: `${username} D`,
        password: 'correct horse',
        isAdmin: false,
        mustChangePassword: false,
      });
    anna = await create('anna');
    ben = await create('ben');
  });
  afterEach(() => {
    delete process.env['PUBLIC_URL'];
    database.onApplicationShutdown();
  });

  const device = () => new VirtualAuthenticator('lister.example.com', ORIGIN);
  const challengeOf = (options: Record<string, unknown>) =>
    options['challenge'] as string;

  async function addPasskey(user: CurrentUser, name = 'Phone') {
    const authenticator = device();
    const options = await passkeys.registrationOptions(user);
    const info = await passkeys.add(
      user.id,
      name,
      authenticator.register(challengeOf(options)),
    );
    return { authenticator, info };
  }

  describe('registrationOptions', () => {
    it('asks for a discoverable credential with user verification, for the configured host', async () => {
      const options = await passkeys.registrationOptions(anna);

      expect(options).toMatchObject({
        rp: { id: 'lister.example.com', name: 'Lister' },
        user: { name: 'anna', displayName: 'anna D' },
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'required',
        },
      });
    });

    it('excludes the passkeys the user already has', async () => {
      const { info } = await addPasskey(anna);

      const options = await passkeys.registrationOptions(anna);

      expect(options['excludeCredentials']).toEqual([
        expect.objectContaining({ id: info.id }),
      ]);
    });
  });

  describe('add', () => {
    it('stores the credential and lists it for its owner only', async () => {
      const { info } = await addPasskey(anna, 'Laptop');

      expect(info).toMatchObject({ name: 'Laptop', lastUsedAt: null });
      expect(info.createdAt).toBe(new Date(now).toISOString());
      expect(passkeys.list(anna.id)).toEqual([info]);
      expect(passkeys.list(ben.id)).toEqual([]);
      const [row] = database.db.select().from(schema.passkeys).all();
      expect(row).toMatchObject({ userId: anna.id, counter: 0 });
      expect(row.publicKey.length).toBeGreaterThan(0);
    });

    it('uses a challenge only once', async () => {
      const authenticator = device();
      const options = await passkeys.registrationOptions(anna);
      const response = authenticator.register(challengeOf(options));
      await passkeys.add(anna.id, 'One', response);

      await expect(passkeys.add(anna.id, 'Two', response)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses a challenge issued to another user', async () => {
      const options = await passkeys.registrationOptions(anna);

      await expect(
        passkeys.add(ben.id, 'Mine', device().register(challengeOf(options))),
      ).rejects.toThrow(BadRequestException);
      expect(database.db.select().from(schema.passkeys).all()).toEqual([]);
    });

    it('refuses an expired challenge', async () => {
      const options = await passkeys.registrationOptions(anna);
      now += CHALLENGE_LIFETIME_MS;

      await expect(
        passkeys.add(anna.id, 'Late', device().register(challengeOf(options))),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses an answer from another origin', async () => {
      const options = await passkeys.registrationOptions(anna);

      await expect(
        passkeys.add(
          anna.id,
          'Phish',
          device().register(challengeOf(options), {
            origin: 'https://evil.example.com',
          }),
        ),
      ).rejects.toThrow(/could not be verified/);
    });

    it('refuses garbage and the same credential twice', async () => {
      await expect(passkeys.add(anna.id, 'x', { response: 5 })).rejects.toThrow(
        BadRequestException,
      );
      const { authenticator } = await addPasskey(anna);
      const options = await passkeys.registrationOptions(ben);

      await expect(
        passkeys.add(
          ben.id,
          'Copy',
          authenticator.register(challengeOf(options)),
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('removes the own passkey', async () => {
      const { info } = await addPasskey(anna);

      passkeys.remove(anna.id, info.id);

      expect(passkeys.list(anna.id)).toEqual([]);
    });

    it("never removes someone else's, and says it doesn't exist", async () => {
      const { info } = await addPasskey(anna);

      expect(() => passkeys.remove(ben.id, info.id)).toThrow(NotFoundException);
      expect(() => passkeys.remove(anna.id, 'unknown')).toThrow(
        NotFoundException,
      );
      expect(passkeys.list(anna.id)).toHaveLength(1);
    });
  });

  describe('signIn', () => {
    async function answer(
      authenticator: VirtualAuthenticator,
      user: CurrentUser,
      overrides: Parameters<VirtualAuthenticator['authenticate']>[2] = {},
    ) {
      const options = await passkeys.authenticationOptions('203.0.113.7');
      return authenticator.authenticate(
        challengeOf(options),
        user.id,
        overrides,
      );
    }

    it('starts a session for the passkey’s owner and records the use', async () => {
      const { authenticator, info } = await addPasskey(anna);
      now += 5000;

      const signedIn = await passkeys.signIn(await answer(authenticator, anna));

      expect(signedIn.user.id).toBe(anna.id);
      expect(signedIn.token).toBeTruthy();
      expect(database.db.select().from(schema.sessions).all()).toHaveLength(1);
      expect(passkeys.list(anna.id)).toEqual([
        { ...info, lastUsedAt: new Date(now).toISOString() },
      ]);
      const [row] = database.db.select().from(schema.passkeys).all();
      expect(row.counter).toBe(1);
    });

    it('keeps the forced password change flag on the user it returns', async () => {
      const { authenticator } = await addPasskey(anna);
      database.db.update(schema.users).set({ mustChangePassword: true }).run();

      const signedIn = await passkeys.signIn(await answer(authenticator, anna));

      expect(signedIn.user.mustChangePassword).toBe(true);
    });

    it('refuses a credential the server does not know', async () => {
      await expect(
        passkeys.signIn(await answer(device(), anna)),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("can't be crowded out by another client asking for sign-in options over and over", async () => {
      const { authenticator } = await addPasskey(anna);
      const signInOptions =
        await passkeys.authenticationOptions('198.51.100.1');
      const authenticator2 = device();
      const registration = await passkeys.registrationOptions(ben);
      for (let i = 0; i < MAX_PENDING_CHALLENGES; i++) {
        await passkeys.authenticationOptions('203.0.113.7');
      }

      await expect(
        passkeys.signIn(
          authenticator.authenticate(challengeOf(signInOptions), anna.id),
        ),
      ).resolves.toMatchObject({ user: { id: anna.id } });
      await expect(
        passkeys.add(
          ben.id,
          'Laptop',
          authenticator2.register(challengeOf(registration)),
        ),
      ).resolves.toMatchObject({ name: 'Laptop' });
    });

    it('refuses a replayed answer (the challenge is single use)', async () => {
      const { authenticator } = await addPasskey(anna);
      const response = await answer(authenticator, anna);
      await passkeys.signIn(response);

      await expect(passkeys.signIn(response)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('refuses an expired challenge', async () => {
      const { authenticator } = await addPasskey(anna);
      const response = await answer(authenticator, anna);
      now += CHALLENGE_LIFETIME_MS;

      await expect(passkeys.signIn(response)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('refuses a signature made with another key', async () => {
      const { authenticator } = await addPasskey(anna);

      await expect(
        passkeys.signIn(
          await answer(authenticator, anna, { signWith: device() }),
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('refuses a user handle that is not the credential’s owner', async () => {
      const { authenticator } = await addPasskey(anna);

      await expect(
        passkeys.signIn(await answer(authenticator, ben)),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('refuses an answer from another origin', async () => {
      const { authenticator } = await addPasskey(anna);

      await expect(
        passkeys.signIn(
          await answer(authenticator, anna, { origin: 'https://evil.example' }),
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('refuses a counter that does not go up (a cloned authenticator)', async () => {
      const { authenticator } = await addPasskey(anna);
      await passkeys.signIn(await answer(authenticator, anna));
      database.db.update(schema.passkeys).set({ counter: 50 }).run();

      await expect(
        passkeys.signIn(await answer(authenticator, anna)),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('refuses garbage', async () => {
      await expect(passkeys.signIn({})).rejects.toThrow(UnauthorizedException);
      await expect(
        passkeys.signIn({ id: 1, response: { clientDataJSON: '%%' } }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
