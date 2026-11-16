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
      | typeof schema.includes,
  ) =>
    database.db
      .select({ id: table.id })
      .from(table)
      .all()
      .map((r) => r.id);
  const purgePoint = () =>
    database.db
      .select({ v: schema.spaces.purgedVersion })
      .from(schema.spaces)
      .where(eq(schema.spaces.id, spaceId))
      .get()?.v;

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

  it("records the highest purged version as the space's purge point", () => {
    const l = list();
    item(l, OLD); // version 2
    list(OLD); // version 3
    list(); // version 4, live
    expect(purgePoint()).toBe(0);

    service.purge(NOW);

    expect(purgePoint()).toBe(3);
  });

  it('never lowers the purge point and leaves it alone when nothing is purged', () => {
    item(list(), OLD); // version 2
    service.purge(NOW);
    item(list(), OLD); // version 4
    service.purge(NOW);
    expect(purgePoint()).toBe(4);

    service.purge(NOW);
    expect(purgePoint()).toBe(4);
  });

  it('runs once a day', () => {
    expect(service.isDue(NOW)).toBe(true);
    service.markDone(NOW);
    expect(service.isDue(NOW + 60_000)).toBe(false);
    expect(service.isDue(NOW + DAY)).toBe(true);
  });
});
