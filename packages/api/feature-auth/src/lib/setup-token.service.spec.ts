import {
  type DatabaseConnection,
  createTestDatabase,
} from '@lister/api/data-access-db';
import { AuthService } from './auth.service';
import { SetupTokenService } from './setup-token.service';

describe('SetupTokenService', () => {
  let database: DatabaseConnection;
  let auth: AuthService;
  beforeEach(() => {
    database = createTestDatabase();
    auth = new AuthService(database, () => 1);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    database.onApplicationShutdown();
  });

  it('logs a token while no account exists, and accepts only that token', () => {
    const service = new SetupTokenService(auth);
    const warn = vi
      .spyOn(
        (service as unknown as { logger: { warn(m: string): void } }).logger,
        'warn',
      )
      .mockImplementation(() => undefined);

    service.onApplicationBootstrap();

    const token = /token: (\S+)$/.exec(warn.mock.calls[0][0] as string)?.[1];
    expect(token).toBeTruthy();
    expect(service.isOpen()).toBe(true);
    expect(service.matches(token as string)).toBe(true);
    expect(service.matches('wrong')).toBe(false);
    expect(service.matches('')).toBe(false);
  });

  it('is closed once consumed', () => {
    const service = new SetupTokenService(auth);
    vi.spyOn(
      (service as unknown as { logger: { warn(m: string): void } }).logger,
      'warn',
    ).mockImplementation(() => undefined);
    service.onApplicationBootstrap();

    service.consume();

    expect(service.isOpen()).toBe(false);
  });

  it('issues no token when an account exists', async () => {
    await auth.createUser({
      username: 'a',
      displayName: 'A',
      password: 'correct horse',
      isAdmin: true,
      mustChangePassword: false,
    });
    const service = new SetupTokenService(auth);

    service.onApplicationBootstrap();

    expect(service.isOpen()).toBe(false);
    expect(service.matches('anything')).toBe(false);
  });

  describe('LISTER_SETUP_TOKEN', () => {
    const open = () => {
      const service = new SetupTokenService(auth);
      const warn = vi
        .spyOn(
          (service as unknown as { logger: { warn(m: string): void } }).logger,
          'warn',
        )
        .mockImplementation(() => undefined);
      service.onApplicationBootstrap();
      return { service, warn };
    };

    it('fixes the token, and never logs it', () => {
      vi.stubEnv('LISTER_SETUP_TOKEN', 'a-fixed-token-for-tests');

      const { service, warn } = open();

      expect(service.isOpen()).toBe(true);
      expect(service.matches('a-fixed-token-for-tests')).toBe(true);
      expect(JSON.stringify(warn.mock.calls)).not.toContain(
        'a-fixed-token-for-tests',
      );
    });

    it('is ignored when it is too short', () => {
      vi.stubEnv('LISTER_SETUP_TOKEN', 'short');

      const { service, warn } = open();

      expect(service.matches('short')).toBe(false);
      expect(service.isOpen()).toBe(true);
      expect(warn.mock.calls[0][0]).toContain('Ignoring LISTER_SETUP_TOKEN');
    });
  });
});
