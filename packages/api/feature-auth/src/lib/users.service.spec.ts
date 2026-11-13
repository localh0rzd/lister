import { ConflictException, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  type DatabaseConnection,
  createTestDatabase,
  insertSpace,
  schema,
} from '@lister/api/data-access-db';
import { AuthService } from './auth.service';
import { verifyPassword } from './password';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let database: DatabaseConnection;
  let auth: AuthService;
  let users: UsersService;

  beforeEach(() => {
    database = createTestDatabase();
    auth = new AuthService(database, () => 1_000_000);
    users = new UsersService(database, auth);
  });
  afterEach(() => database.onApplicationShutdown());

  const add = (username: string, isAdmin = false) =>
    auth.createUser({
      username,
      displayName: username,
      password: 'correct horse',
      isAdmin,
      mustChangePassword: false,
    });

  it('creates users who must change their password, never admins', async () => {
    const created = await users.create({
      username: 'Anna',
      displayName: 'Anna A',
      temporaryPassword: 'temporary one',
    });

    expect(created).toMatchObject({
      username: 'Anna',
      isAdmin: false,
      mustChangePassword: true,
    });
  });

  it('lists users by username, ignoring case', async () => {
    await add('bob');
    await add('Anna');

    expect(users.list().map((u) => u.username)).toEqual(['Anna', 'bob']);
  });

  describe('update', () => {
    it('changes the fields that are given and leaves the rest', async () => {
      const anna = await add('anna');

      const updated = users.update(anna.id, { displayName: 'Anna B' });

      expect(updated).toMatchObject({
        username: 'anna',
        displayName: 'Anna B',
        isAdmin: false,
      });
    });

    it('rejects a username that another user has, ignoring case', async () => {
      await add('anna');
      const bob = await add('bob');

      expect(() => users.update(bob.id, { username: 'ANNA' })).toThrow(
        ConflictException,
      );
    });

    it('lets a user keep their username in another case', async () => {
      const anna = await add('anna');

      expect(users.update(anna.id, { username: 'Anna' }).username).toBe('Anna');
    });

    it('grants and revokes admin while another admin remains', async () => {
      const first = await add('first', true);
      const second = await add('second');

      expect(users.update(second.id, { isAdmin: true }).isAdmin).toBe(true);
      expect(users.update(first.id, { isAdmin: false }).isAdmin).toBe(false);
    });

    it('refuses to demote the last admin', async () => {
      const only = await add('only', true);
      await add('regular');

      expect(() => users.update(only.id, { isAdmin: false })).toThrow(
        ConflictException,
      );
      expect(users.list().find((u) => u.id === only.id)?.isAdmin).toBe(true);
    });

    it('answers 404 for an unknown user', () => {
      expect(() =>
        users.update('0197f000-0000-7000-8000-000000000000', {}),
      ).toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes the user and their sessions', async () => {
      await add('admin', true);
      const anna = await add('anna');
      const row = auth.findByUsername('anna');
      if (!row) throw new Error('missing');
      auth.startSession(row);

      users.remove(anna.id);

      expect(auth.findByUsername('anna')).toBeUndefined();
      expect(database.db.select().from(schema.sessions).all()).toEqual([]);
    });

    const spaceIds = () =>
      database.db
        .select({ id: schema.spaces.id })
        .from(schema.spaces)
        .all()
        .map((space) => space.id);
    const membersOf = (spaceId: string) =>
      database.db
        .select({
          userId: schema.memberships.userId,
          role: schema.memberships.role,
        })
        .from(schema.memberships)
        .where(eq(schema.memberships.spaceId, spaceId))
        .all();
    const personalSpaceOf = (userId: string) =>
      database.db
        .select({ id: schema.memberships.spaceId })
        .from(schema.memberships)
        .innerJoin(
          schema.spaces,
          eq(schema.spaces.id, schema.memberships.spaceId),
        )
        .where(
          and(
            eq(schema.memberships.userId, userId),
            eq(schema.spaces.personal, true),
          ),
        )
        .get()?.id;
    const join = (spaceId: string, userId: string, createdAt: number) =>
      database.db
        .insert(schema.memberships)
        .values({ spaceId, userId, role: 'member', createdAt })
        .run();

    it('deletes their personal space with its content', async () => {
      await add('admin', true);
      const anna = await add('anna');
      const personal = personalSpaceOf(anna.id);
      if (!personal) throw new Error('missing');
      database.db
        .insert(schema.lists)
        .values({
          id: 'l1',
          spaceId: personal,
          version: 1,
          createdBy: anna.id,
          updatedBy: anna.id,
          createdAt: 1,
          updatedAt: 1,
          title: 'Tent',
        })
        .run();

      users.remove(anna.id);

      expect(spaceIds()).not.toContain(personal);
      expect(database.db.select().from(schema.lists).all()).toEqual([]);
    });

    it('hands a shared space they owned to the longest-standing other member', async () => {
      await add('admin', true);
      const anna = await add('anna');
      const ben = await add('ben');
      const carl = await add('carl');
      const space = insertSpace(database.db, {
        name: 'Family',
        ownerId: anna.id,
        personal: false,
        now: 1,
      });
      // The earlier member has the greater id, so ordering by id alone would pick the other.
      const [later, earlier] = [ben.id, carl.id].sort();
      join(space.id, later, 3);
      join(space.id, earlier, 2);

      users.remove(anna.id);

      expect(spaceIds()).toContain(space.id);
      expect(membersOf(space.id)).toEqual(
        expect.arrayContaining([
          { userId: earlier, role: 'owner' },
          { userId: later, role: 'member' },
        ]),
      );
      expect(membersOf(space.id)).toHaveLength(2);
    });

    it('deletes a shared space they owned alone, and only leaves the ones they were a member of', async () => {
      await add('admin', true);
      const anna = await add('anna');
      const ben = await add('ben');
      const solo = insertSpace(database.db, {
        name: 'Solo',
        ownerId: anna.id,
        personal: false,
        now: 1,
      });
      const bens = insertSpace(database.db, {
        name: 'Bens',
        ownerId: ben.id,
        personal: false,
        now: 1,
      });
      join(bens.id, anna.id, 2);

      users.remove(anna.id);

      expect(spaceIds()).not.toContain(solo.id);
      expect(membersOf(bens.id)).toEqual([{ userId: ben.id, role: 'owner' }]);
    });

    it('refuses to delete the last admin', async () => {
      const only = await add('only', true);

      expect(() => users.remove(only.id)).toThrow(ConflictException);
      expect(auth.findByUsername('only')).toBeDefined();
    });

    it('deletes an admin while another remains', async () => {
      const first = await add('first', true);
      await add('second', true);

      users.remove(first.id);

      expect(users.list().map((u) => u.username)).toEqual(['second']);
    });

    it('answers 404 for an unknown user', () => {
      expect(() =>
        users.remove('0197f000-0000-7000-8000-000000000000'),
      ).toThrow(NotFoundException);
    });
  });

  describe('resetPassword', () => {
    it('sets a temporary password that must be changed and ends the sessions', async () => {
      const anna = await add('anna');
      const row = auth.findByUsername('anna');
      if (!row) throw new Error('missing');
      auth.startSession(row);

      await users.resetPassword(anna.id, 'brand new one');

      const after = database.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, anna.id))
        .get();
      expect(after?.mustChangePassword).toBe(true);
      expect(
        await verifyPassword('brand new one', after?.passwordHash ?? ''),
      ).toBe(true);
      expect(database.db.select().from(schema.sessions).all()).toEqual([]);
    });

    it('answers 404 for an unknown user', async () => {
      await expect(
        users.resetPassword(
          '0197f000-0000-7000-8000-000000000000',
          'whatever pw',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
