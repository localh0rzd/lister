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
  afterEach(() => database.onApplicationShutdown());

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
});
