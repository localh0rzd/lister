import { eq } from 'drizzle-orm';
import {
  type DatabaseConnection,
  createTestDatabase,
  insertSpace,
  schema,
} from '@lister/api/data-access-db';
import { newId } from '@lister/shared/domain';
import { PURGE_AFTER_DAYS, PurgeService } from './purge.service';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 16, 3);
const OLD = NOW - (PURGE_AFTER_DAYS + 1) * DAY;
const RECENT = NOW - (PURGE_AFTER_DAYS - 1) * DAY;

describe('PurgeService', () => {
  let database: DatabaseConnection;
  let service: PurgeService;
  let spaceId: string;
  const USER = newId();
  let version = 0;

  beforeEach(() => {
    database = createTestDatabase();
    service = new PurgeService(database);
    version = 0;
    database.db
      .insert(schema.users)
      .values({
        id: USER,
        username: 'anna',
        displayName: 'Anna',
        passwordHash: 'x',
        createdAt: 0,
      })
      .run();
    spaceId = insertSpace(database.db, {
      name: 'Anna',
      ownerId: USER,
      personal: true,
      now: 0,
    }).id;
  });
  afterEach(() => database.onApplicationShutdown());

  const base = (deletedAt: number | null = null) => ({
    id: newId(),
    spaceId,
    version: ++version,
    deletedAt,
    createdBy: USER,
    updatedBy: USER,
    createdAt: 0,
    updatedAt: 0,
  });
  const list = (deletedAt: number | null = null) => {
    const row = { ...base(deletedAt), title: 'L' };
    database.db.insert(schema.lists).values(row).run();
    return row.id;
  };
  const item = (listId: string, deletedAt: number | null = null) => {
    const row = { ...base(deletedAt), listId, title: 'I', position: 'a0' };
    database.db.insert(schema.items).values(row).run();
    return row.id;
  };
  const run = (finishedAt: number | null, deletedAt: number | null = null) => {
    const row = { ...base(deletedAt), title: 'R', finishedAt };
    database.db.insert(schema.runs).values(row).run();
    return row.id;
  };
  const runItem = (runId: string) => {
    const row = { ...base(), runId, title: 'RI', position: 'a0' };
    database.db.insert(schema.runItems).values(row).run();
    return row.id;
  };
  const ids = (
    table:
      | typeof schema.items
      | typeof schema.lists
      | typeof schema.runs
      | typeof schema.runItems
      | typeof schema.includes
      | typeof schema.includeExceptions,
  ) =>
    database.db
      .select({ id: table.id })
      .from(table)
      .all()
      .map((r) => r.id);
  const space = (id = spaceId) =>
    database.db
      .select({
        version: schema.spaces.version,
        purgedVersion: schema.spaces.purgedVersion,
      })
      .from(schema.spaces)
      .where(eq(schema.spaces.id, id))
      .get();

  it('removes tombstones older than 30 days and keeps recent ones and live rows', () => {
    const live = list();
    const oldItem = item(live, OLD);
    const recentItem = item(live, RECENT);
    const liveItem = item(live);

    expect(service.purge(NOW)).toBe(1);

    expect(ids(schema.items).sort()).toEqual([recentItem, liveItem].sort());
    expect(ids(schema.items)).not.toContain(oldItem);
    expect(ids(schema.lists)).toEqual([live]);
  });

  it('removes the items and includes of a purged list, and the list', () => {
    const gone = list(OLD);
    const live = list();
    item(gone);
    item(live);
    for (const [parentListId, childListId] of [
      [live, gone],
      [gone, live],
    ]) {
      database.db
        .insert(schema.includes)
        .values({ ...base(), parentListId, childListId, position: 'a0' })
        .run();
    }

    expect(service.purge(NOW)).toBe(4);

    expect(ids(schema.lists)).toEqual([live]);
    expect(ids(schema.items)).toHaveLength(1);
    expect(ids(schema.includes)).toEqual([]);
  });

  describe('exceptions (D28)', () => {
    const include = (
      parentListId: string,
      childListId: string,
      deletedAt: number | null = null,
    ) => {
      const row = {
        ...base(deletedAt),
        parentListId,
        childListId,
        position: 'a0',
      };
      database.db.insert(schema.includes).values(row).run();
      return row.id;
    };
    const exception = (
      includeId: string,
      targetKind: 'item' | 'list',
      targetId: string,
      deletedAt: number | null = null,
    ) => {
      const row = { ...base(deletedAt), includeId, targetKind, targetId };
      database.db.insert(schema.includeExceptions).values(row).run();
      return row.id;
    };

    it('removes the exceptions of a purged include, item or list, and old tombstones', () => {
      const [parent, child] = [list(), list()];
      const keptItem = item(child);
      const keptInclude = include(parent, child);
      const kept = exception(keptInclude, 'item', keptItem);
      exception(keptInclude, 'item', keptItem, OLD);
      const recent = exception(keptInclude, 'list', child, RECENT);
      exception(keptInclude, 'item', item(child, OLD));
      const goneList = list(OLD);
      exception(keptInclude, 'list', goneList);
      // An include whose child list is purged goes with its exceptions.
      exception(include(parent, goneList), 'item', keptItem);
      exception(include(parent, child, OLD), 'item', keptItem);

      service.purge(NOW);

      expect(ids(schema.includeExceptions).sort()).toEqual(
        [kept, recent].sort(),
      );
      expect(ids(schema.includes)).toEqual([keptInclude]);
    });

    it('does not mistake an item id for a list id of the same value', () => {
      const [parent, child] = [list(), list()];
      const target = item(list(OLD));
      const keep = exception(include(parent, child), 'list', target);

      service.purge(NOW);

      expect(ids(schema.includeExceptions)).toEqual([keep]);
    });

    it('moves a space that only lost exceptions on a version', () => {
      const [parent, child] = [list(), list()];
      exception(include(parent, child), 'item', item(child), OLD);
      const before = space()?.version ?? 0;

      expect(service.purge(NOW)).toBe(1);

      expect(space()).toEqual({
        version: before + 1,
        purgedVersion: before + 1,
      });
    });
  });

  it('keeps a list deleted less than 30 days ago with its items', () => {
    const recent = list(RECENT);
    item(recent);

    expect(service.purge(NOW)).toBe(0);
    expect(ids(schema.lists)).toEqual([recent]);
  });

  it('removes runs finished more than 30 days ago with their items', () => {
    const old = run(OLD);
    const recent = run(RECENT);
    const active = run(null);
    runItem(old);
    runItem(recent);

    expect(service.purge(NOW)).toBe(2);

    expect(ids(schema.runs).sort()).toEqual([recent, active].sort());
    expect(ids(schema.runItems)).toHaveLength(1);
  });

  it('removes runs deleted more than 30 days ago', () => {
    run(null, OLD);
    expect(service.purge(NOW)).toBe(1);
    expect(ids(schema.runs)).toEqual([]);
  });

  it('moves a space that lost rows one version on, and makes that its purge point', () => {
    database.db
      .update(schema.spaces)
      .set({ version: 7 })
      .where(eq(schema.spaces.id, spaceId))
      .run();
    item(list(), OLD);
    expect(space()).toEqual({ version: 7, purgedVersion: 0 });

    service.purge(NOW);

    expect(space()).toEqual({ version: 8, purgedVersion: 8 });
  });

  it('leaves a space alone when nothing of it is purged', () => {
    item(list(), RECENT);
    const other = insertSpace(database.db, {
      name: 'Other',
      ownerId: USER,
      personal: false,
      now: 0,
    }).id;
    database.db
      .insert(schema.lists)
      .values({ ...base(OLD), spaceId: other, title: 'Old' })
      .run();

    service.purge(NOW);

    expect(space()).toEqual({ version: 0, purgedVersion: 0 });
    expect(space(other)).toEqual({ version: 1, purgedVersion: 1 });
  });

  it('removes expired registration tokens and keeps the valid ones', () => {
    const token = (value: string, expiresAt: number) =>
      database.db
        .insert(schema.registrationTokens)
        .values({ token: value, createdBy: USER, createdAt: 0, expiresAt })
        .run();
    token('EXPIRED00001', NOW - 1);
    token('EXPIRESNOW01', NOW);
    token('STILLVALID01', NOW + 1);

    expect(service.purge(NOW)).toBe(2);

    expect(
      database.db
        .select({ token: schema.registrationTokens.token })
        .from(schema.registrationTokens)
        .all(),
    ).toEqual([{ token: 'STILLVALID01' }]);
    expect(space()).toEqual({ version: 0, purgedVersion: 0 });
  });

  it('runs once a day', () => {
    expect(service.isDue(NOW)).toBe(true);
    service.markDone(NOW);
    expect(service.isDue(NOW + 60_000)).toBe(false);
    expect(service.isDue(NOW + DAY)).toBe(true);
  });
});
