import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  type DatabaseConnection,
  createTestDatabase,
  schema,
} from '@lister/api/data-access-db';
import { newId } from '@lister/shared/domain';
import {
  REGISTRATION_TOKEN_LIFETIME_MS,
  RegistrationTokensService,
  generateRegistrationToken,
} from './registration-tokens.service';

describe('generateRegistrationToken', () => {
  it('makes 12 characters from A–Z and 0–9', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateRegistrationToken()).toMatch(/^[A-Z0-9]{12}$/);
    }
  });

  it('can reach the first and the last character of the alphabet', () => {
    expect(generateRegistrationToken(() => 0)).toBe('AAAAAAAAAAAA');
    expect(generateRegistrationToken((max) => max - 1)).toBe('999999999999');
  });

  it('differs from one call to the next', () => {
    const tokens = new Set(
      Array.from({ length: 50 }, () => generateRegistrationToken()),
    );
    expect(tokens.size).toBe(50);
  });
});

describe('RegistrationTokensService', () => {
  let database: DatabaseConnection;
  let service: RegistrationTokensService;
  let now = 1_000_000;
  const adminId = newId();

  beforeEach(() => {
    now = 1_000_000;
    database = createTestDatabase();
    service = new RegistrationTokensService(database, () => now);
    database.db
      .insert(schema.users)
      .values({
        id: adminId,
        username: 'boss',
        displayName: 'The Boss',
        passwordHash: 'x',
        isAdmin: true,
        createdAt: 0,
      })
      .run();
  });
  afterEach(() => database.onApplicationShutdown());

  it('creates a token that expires after 7 days and names its creator', () => {
    const created = service.create(adminId);

    expect(created.token).toMatch(/^[A-Z0-9]{12}$/);
    expect(created.createdBy).toBe('The Boss');
    expect(created.createdAt).toBe(new Date(now).toISOString());
    expect(created.expiresAt).toBe(
      new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
    );
    expect(REGISTRATION_TOKEN_LIFETIME_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('lists unexpired tokens, newest first, and leaves expired ones out', () => {
    const first = service.create(adminId);
    now += 1000;
    const second = service.create(adminId);
    now += REGISTRATION_TOKEN_LIFETIME_MS - 500;

    expect(service.list().map((t) => t.token)).toEqual([second.token]);
    now += 500;
    expect(service.list()).toEqual([]);
    expect(first.token).not.toBe(second.token);
  });

  it('accepts a token ignoring case and surrounding spaces', () => {
    const { token } = service.create(adminId);

    expect(service.isValid(` ${token.toLowerCase()} `)).toBe(true);
    expect(service.isValid('NOTATOKEN123')).toBe(false);
    expect(service.isValid('')).toBe(false);
  });

  it('claims a token once', () => {
    const { token } = service.create(adminId);

    service.claim(token.toLowerCase());

    expect(service.isValid(token)).toBe(false);
    expect(() => service.claim(token)).toThrow(ForbiddenException);
  });

  it('refuses an expired token, to the millisecond', () => {
    const { token } = service.create(adminId);
    now += REGISTRATION_TOKEN_LIFETIME_MS - 1;
    expect(service.isValid(token)).toBe(true);
    now += 1;

    expect(service.isValid(token)).toBe(false);
    expect(() => service.claim(token)).toThrow(ForbiddenException);
  });

  it('refuses a malformed token without touching the database', () => {
    expect(() => service.claim("' OR 1=1 --")).toThrow(ForbiddenException);
  });

  it('removes a token, and a second removal is a 404', () => {
    const { token } = service.create(adminId);

    service.remove(token.toLowerCase());

    expect(service.list()).toEqual([]);
    expect(() => service.remove(token)).toThrow(NotFoundException);
  });
});
