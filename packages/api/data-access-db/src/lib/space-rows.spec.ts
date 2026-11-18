import { eq } from 'drizzle-orm';
import type { DatabaseConnection } from './database';
import * as schema from './schema';
import { deleteSpace, insertSpace } from './space-rows';
import { createTestDatabase } from './test-database';

describe('space rows', () => {
  let database: DatabaseConnection;

  beforeEach(() => {
    database = createTestDatabase();
    database.db
      .insert(schema.users)
      .values({
        id: 'u1',
        username: 'anna',
        displayName: 'Anna',
        passwordHash: 'x',
        createdAt: 1,
      })
      .run();
  });
  afterEach(() => database.onApplicationShutdown());

  const meta = (id: string, spaceId: string) => ({
    id,
    spaceId,
    version: 1,
    createdBy: 'u1',
    updatedBy: 'u1',
    createdAt: 1,
    updatedAt: 1,
  });

  /** A space holding one row of every synced kind, plus a processed mutation. */
  const filledSpace = (tag: string) => {
    const space = insertSpace(database.db, {
      name: tag,
      ownerId: 'u1',
      personal: false,
      now: 1,
    });
    const { db } = database;
    db.insert(schema.lists)
      .values([
        { ...meta(`${tag}-parent`, space.id), title: 'Parent' },
        { ...meta(`${tag}-child`, space.id), title: 'Child' },
      ])
      .run();
    db.insert(schema.items)
      .values({
        ...meta(`${tag}-item`, space.id),
        listId: `${tag}-child`,
        title: 'Tent',
        position: 'a0',
      })
      .run();
    db.insert(schema.includes)
      .values({
        ...meta(`${tag}-include`, space.id),
        parentListId: `${tag}-parent`,
        childListId: `${tag}-child`,
        position: 'a1',
      })
      .run();
    db.insert(schema.includeExceptions)
      .values({
        ...meta(`${tag}-exception`, space.id),
        includeId: `${tag}-include`,
        targetKind: 'item',
        targetId: `${tag}-item`,
      })
      .run();
    db.insert(schema.runs)
      .values({
        ...meta(`${tag}-run`, space.id),
        title: 'Trip',
        sourceListId: `${tag}-parent`,
      })
      .run();
    db.insert(schema.runItems)
      .values({
        ...meta(`${tag}-run-item`, space.id),
        runId: `${tag}-run`,
        title: 'Tent',
        position: 'a0',
        sources: [`${tag}-child`],
      })
      .run();
    db.insert(schema.processedMutations)
      .values({
        mutationId: `${tag}-mutation`,
        spaceId: space.id,
        result: '{"version":1}',
        createdAt: 1,
      })
      .run();
    return space.id;
  };

  const countIn = (spaceId: string) => {
    const { db } = database;
    return {
      lists: db
        .select()
        .from(schema.lists)
        .where(eq(schema.lists.spaceId, spaceId))
        .all().length,
      items: db
        .select()
        .from(schema.items)
        .where(eq(schema.items.spaceId, spaceId))
        .all().length,
      includes: db
        .select()
        .from(schema.includes)
        .where(eq(schema.includes.spaceId, spaceId))
        .all().length,
      includeExceptions: db
        .select()
        .from(schema.includeExceptions)
        .where(eq(schema.includeExceptions.spaceId, spaceId))
        .all().length,
      runs: db
        .select()
        .from(schema.runs)
        .where(eq(schema.runs.spaceId, spaceId))
        .all().length,
      runItems: db
        .select()
        .from(schema.runItems)
        .where(eq(schema.runItems.spaceId, spaceId))
        .all().length,
      processedMutations: db
        .select()
        .from(schema.processedMutations)
        .where(eq(schema.processedMutations.spaceId, spaceId))
        .all().length,
      memberships: db
        .select()
        .from(schema.memberships)
        .where(eq(schema.memberships.spaceId, spaceId))
        .all().length,
      spaces: db
        .select()
        .from(schema.spaces)
        .where(eq(schema.spaces.id, spaceId))
        .all().length,
    };
  };

  it('creates a space with its owner', () => {
    const space = insertSpace(database.db, {
      name: 'Family',
      ownerId: 'u1',
      personal: true,
      now: 7,
    });

    expect(space).toMatchObject({ name: 'Family', personal: true });
    expect(database.db.select().from(schema.memberships).all()).toEqual([
      { spaceId: space.id, userId: 'u1', role: 'owner', createdAt: 7 },
    ]);
  });

  it('deletes a space with every kind of row in it, and leaves other spaces alone', () => {
    const doomed = filledSpace('a');
    const kept = filledSpace('b');

    database.sqlite.transaction(() => deleteSpace(database.db, doomed))();

    expect(countIn(doomed)).toEqual({
      lists: 0,
      items: 0,
      includes: 0,
      includeExceptions: 0,
      runs: 0,
      runItems: 0,
      processedMutations: 0,
      memberships: 0,
      spaces: 0,
    });
    expect(countIn(kept)).toEqual({
      lists: 2,
      items: 1,
      includes: 1,
      includeExceptions: 1,
      runs: 1,
      runItems: 1,
      processedMutations: 1,
      memberships: 1,
      spaces: 1,
    });
  });
});
