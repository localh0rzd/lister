import {
  type DatabaseConnection,
  createTestDatabase,
  insertSpace,
  schema,
} from '@lister/api/data-access-db';
import { newId } from '@lister/shared/domain';
import { SyncReader } from './sync-reader';

describe('SyncReader', () => {
  let database: DatabaseConnection;
  let reader: SyncReader;
  const ANNA = newId();
  const BEN = newId();
  const CARL = newId();

  beforeEach(() => {
    database = createTestDatabase();
    reader = new SyncReader(database);
    for (const [id, name] of [
      [ANNA, 'Anna'],
      [BEN, 'Ben'],
      [CARL, 'Carl'],
    ]) {
      database.db
        .insert(schema.users)
        .values({
          id,
          username: name.toLowerCase(),
          displayName: name,
          passwordHash: 'x',
          createdAt: 0,
        })
        .run();
    }
  });
  afterEach(() => database.onApplicationShutdown());

  const space = (name: string, ownerId: string, personal = false) =>
    insertSpace(database.db, { name, ownerId, personal, now: 0 });
  const join = (spaceId: string, userId: string) =>
    database.db
      .insert(schema.memberships)
      .values({ spaceId, userId, role: 'member', createdAt: 0 })
      .run();

  describe('spacesOf', () => {
    it("lists the user's spaces, personal first, with the members' display names", () => {
      const personal = space('Anna', ANNA, true);
      const trips = space('trips', ANNA);
      const family = space('Family', BEN);
      join(family.id, ANNA);
      join(trips.id, CARL);
      join(trips.id, BEN);
      space('Secret', CARL);

      expect(reader.spacesOf(ANNA)).toEqual([
        {
          id: personal.id,
          name: 'Anna',
          version: 0,
          members: [{ userId: ANNA, displayName: 'Anna' }],
        },
        {
          id: family.id,
          name: 'Family',
          version: 0,
          members: [
            { userId: BEN, displayName: 'Ben' },
            { userId: ANNA, displayName: 'Anna' },
          ],
        },
        {
          id: trips.id,
          name: 'trips',
          version: 0,
          members: [
            { userId: ANNA, displayName: 'Anna' },
            { userId: BEN, displayName: 'Ben' },
            { userId: CARL, displayName: 'Carl' },
          ],
        },
      ]);
    });

    it('has none for a user without memberships or an unknown one', () => {
      space('Anna', ANNA, true);

      expect(reader.spacesOf(BEN)).toEqual([]);
      expect(reader.spacesOf(newId())).toEqual([]);
    });
  });

  it('knows who is a member of a space', () => {
    const shared = space('Family', ANNA);
    join(shared.id, BEN);

    expect(reader.isMember(ANNA, shared.id)).toBe(true);
    expect(reader.isMember(BEN, shared.id)).toBe(true);
    expect(reader.isMember(CARL, shared.id)).toBe(false);
    expect(reader.isMember(ANNA, newId())).toBe(false);
  });

  describe('rowsSince', () => {
    it('has nothing for a space that does not exist', () => {
      expect(reader.rowsSince(newId(), 0)).toBeUndefined();
    });
  });
});
