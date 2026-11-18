import { HttpException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  type DatabaseConnection,
  createTestDatabase,
  schema,
} from '@lister/api/data-access-db';
import { AuthService } from './auth.service';
import {
  MAX_SEARCHES,
  SEARCH_WINDOW_MS,
  UserSearchService,
} from './user-search.service';

describe('UserSearchService', () => {
  let database: DatabaseConnection;
  let auth: AuthService;
  let now: number;
  let search: UserSearchService;

  beforeEach(() => {
    now = 1_000_000;
    database = createTestDatabase();
    auth = new AuthService(database, () => now);
    search = new UserSearchService(database, () => now);
  });
  afterEach(() => database.onApplicationShutdown());

  const add = async (username: string, displayName: string, visible = true) => {
    const user = await auth.createUser({
      username,
      displayName,
      password: 'correct horse',
      isAdmin: false,
      mustChangePassword: false,
    });
    database.db
      .update(schema.users)
      .set({ visibleToOthers: visible })
      .where(eq(schema.users.id, user.id))
      .run();
    return user;
  };

  it('matches username or display name, ignoring case and accents', async () => {
    await add('jo', 'José Álvarez');
    await add('other', 'Someone');

    expect(search.search('x', { q: 'JOSE' }).map((u) => u.username)).toEqual([
      'jo',
    ]);
    expect(search.search('x', { q: 'alvar' })).toHaveLength(1);
    expect(search.search('x', { q: 'OTH' }).map((u) => u.username)).toEqual([
      'other',
    ]);
  });

  it('never returns hidden users or the caller', async () => {
    await add('hidden', 'Hidden', false);
    const me = await add('shown', 'Shown');

    expect(search.search(me.id, { q: 'hidden' })).toEqual([]);
    expect(search.search(me.id, { q: 'shown' })).toEqual([]);
  });

  it('returns at most 10, by display name', async () => {
    for (let i = 0; i < 12; i++) await add(`u${i}`, `Name ${i}`);

    const found = search.search('x', { q: 'name' });

    expect(found).toHaveLength(10);
    expect(found[0].displayName).toBe('Name 0');
  });

  it('limits each user to 60 searches a minute', () => {
    for (let i = 0; i < MAX_SEARCHES; i++) search.search('x', { q: 'zz' });

    expect(() => search.search('x', { q: 'zz' })).toThrow(HttpException);
    expect(search.search('y', { q: 'zz' })).toEqual([]);
    now += SEARCH_WINDOW_MS + 1;
    expect(search.search('x', { q: 'zz' })).toEqual([]);
  });
});
