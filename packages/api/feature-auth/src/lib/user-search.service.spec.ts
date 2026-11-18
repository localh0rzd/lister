import { HttpException, NotFoundException } from '@nestjs/common';
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

  const response = { setHeader: vi.fn() };
  const find = (callerId: string, query: { q: string; spaceId?: string }) =>
    search.search(callerId, query, response);

  /** A space owned by `ownerId` with `memberIds` as its other members. */
  const space = (ownerId: string, memberIds: string[]) => {
    const id = crypto.randomUUID();
    database.db
      .insert(schema.spaces)
      .values({ id, name: 'Family', createdAt: now })
      .run();
    database.db
      .insert(schema.memberships)
      .values([
        { spaceId: id, userId: ownerId, role: 'owner', createdAt: now },
        ...memberIds.map((userId) => ({
          spaceId: id,
          userId,
          role: 'member' as const,
          createdAt: now,
        })),
      ])
      .run();
    return id;
  };

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

    expect(find('x', { q: 'JOSE' }).map((u) => u.username)).toEqual(['jo']);
    expect(find('x', { q: 'alvar' })).toHaveLength(1);
    expect(find('x', { q: 'OTH' }).map((u) => u.username)).toEqual(['other']);
  });

  it('never returns hidden users or the caller', async () => {
    await add('hidden', 'Hidden', false);
    const me = await add('shown', 'Shown');

    expect(find(me.id, { q: 'hidden' })).toEqual([]);
    expect(find(me.id, { q: 'shown' })).toEqual([]);
  });

  it('returns at most 10, by display name', async () => {
    for (let i = 0; i < 12; i++) await add(`u${i}`, `Name ${i}`);

    const found = find('x', { q: 'name' });

    expect(found).toHaveLength(10);
    expect(found[0].displayName).toBe('Name 0');
  });

  it('limits each user to 60 searches a minute', () => {
    for (let i = 0; i < MAX_SEARCHES; i++) find('x', { q: 'zz' });

    expect(() => find('x', { q: 'zz' })).toThrow(HttpException);
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', 60);
    expect(find('y', { q: 'zz' })).toEqual([]);
    now += SEARCH_WINDOW_MS + 1;
    expect(find('x', { q: 'zz' })).toEqual([]);
  });

  it('leaves out the members of a space of the caller', async () => {
    const me = await add('anna', 'Anna');
    const ben = await add('ben', 'Ben');
    await add('bella', 'Bella');
    const family = space(me.id, [ben.id]);

    expect(
      find(me.id, { q: 'be', spaceId: family }).map((u) => u.username),
    ).toEqual(['bella']);
  });

  it("answers 404 for a space the caller isn't in, so it can't tell who is a member", async () => {
    const owner = await add('owner', 'Owner', false);
    const ben = await add('ben', 'Ben');
    const carl = await add('carl', 'Carl');
    const theirs = space(owner.id, [ben.id]);

    expect(() => find(carl.id, { q: 'ben', spaceId: theirs })).toThrow(
      NotFoundException,
    );
    expect(() =>
      find(carl.id, { q: 'ben', spaceId: crypto.randomUUID() }),
    ).toThrow(NotFoundException);
  });
});
