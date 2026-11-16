import { type Signal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  type Include,
  type Item,
  type List,
  type Run,
  type RunItem,
  flatten,
  newId,
} from '@lister/shared/domain';
import { LOCAL_DB, LocalDb } from './local-db';
import { type QueryState, valueOf } from './live-query-signal';
import { Repositories, trashedAt, trashedBy } from './repositories';

const SPACE = newId();
const OTHER_SPACE = newId();

const meta = (spaceId = SPACE) => ({
  spaceId,
  version: 1,
  deletedAt: null,
  createdBy: newId(),
  updatedBy: newId(),
  createdAt: 0,
  updatedAt: 0,
});
const list = (title: string, extra: Partial<List> = {}): List => ({
  ...meta(),
  id: newId(),
  title,
  description: '',
  ...extra,
});
const item = (
  listId: string,
  title: string,
  position: string,
  extra: Partial<Item> = {},
): Item => ({
  ...meta(),
  id: newId(),
  listId,
  title,
  quantity: '',
  note: '',
  position,
  ...extra,
});

let db: LocalDb;
let repositories: Repositories;

beforeEach(() => {
  db = new LocalDb(`test-${newId()}`);
  TestBed.configureTestingModule({
    providers: [{ provide: LOCAL_DB, useValue: db }],
  });
  repositories = TestBed.inject(Repositories);
});
afterEach(async () => {
  TestBed.resetTestingModule();
  await db.delete();
});

/** Waits until the query shows `expected` (liveQuery answers asynchronously). */
async function expectEventually<T>(
  state: Signal<QueryState<T>>,
  expected: unknown,
) {
  await vi.waitFor(() => {
    TestBed.tick();
    expect(valueOf(state())).toEqual(expected);
  });
}

const titles = (state: QueryState<{ title: string }[]>) =>
  valueOf(state)?.map((r) => r.title);

describe('LocalDb', () => {
  it('has the tables of schema version 7', () => {
    expect(db.verno).toBe(7);
    expect(db.tables.map((t) => t.name).sort()).toEqual([
      'includes',
      'items',
      'lists',
      'meta',
      'outbox',
      'rejections',
      'runItems',
      'runs',
      'serverIncludes',
      'serverItems',
      'serverLists',
      'serverRunItems',
      'serverRuns',
      'spaces',
      'syncState',
    ]);
  });

  it('finds outbox entries by mutation id, which must be unique', async () => {
    const entry = {
      mutationId: newId(),
      spaceId: SPACE,
      mutation: {
        mutationId: '',
        spaceId: SPACE,
        name: 'list.delete',
        args: { id: newId() },
      },
      createdAt: 0,
    } as const;
    await db.outbox.add({ ...entry });

    expect(
      await db.outbox.where('mutationId').equals(entry.mutationId).count(),
    ).toBe(1);
    await expect(db.outbox.add({ ...entry })).rejects.toThrow();
  });
});

describe('Repositories.listsOfSpace', () => {
  it('is undefined until loaded, then follows changes', async () => {
    const lists = TestBed.runInInjectionContext(() =>
      repositories.listsOfSpace(() => SPACE),
    );
    expect(lists()).toEqual({ status: 'loading' });
    await expectEventually(lists, []);

    const camping = list('Camping');
    await db.lists.put(camping);
    await vi.waitFor(() => expect(titles(lists())).toEqual(['Camping']));

    await db.lists.put({ ...camping, title: 'Camping trip' });
    await vi.waitFor(() => expect(titles(lists())).toEqual(['Camping trip']));
  });

  it('sorts by title ignoring case, leaves out deleted lists and other spaces', async () => {
    await db.lists.bulkPut([
      list('beach'),
      list('Camping'),
      list('Archive', { deletedAt: 1 }),
      list('Elsewhere', { spaceId: OTHER_SPACE }),
      list('List 10'),
      list('List 9'),
    ]);

    const lists = TestBed.runInInjectionContext(() =>
      repositories.listsOfSpace(() => SPACE),
    );

    await vi.waitFor(() => {
      TestBed.tick();
      expect(titles(lists())).toEqual([
        'beach',
        'Camping',
        'List 9',
        'List 10',
      ]);
    });
  });

  it('drops a list once it is deleted', async () => {
    const camping = list('Camping');
    await db.lists.put(camping);
    const lists = TestBed.runInInjectionContext(() =>
      repositories.listsOfSpace(() => SPACE),
    );
    await expectEventually(lists, [camping]);

    await db.lists.put({ ...camping, deletedAt: 5 });

    await vi.waitFor(() => expect(valueOf(lists())).toEqual([]));
  });

  it('follows a changing space and is undefined without one', async () => {
    await db.lists.bulkPut([
      list('Here'),
      list('There', { spaceId: OTHER_SPACE }),
    ]);
    const spaceId = signal<string | undefined>(undefined);
    const lists = TestBed.runInInjectionContext(() =>
      repositories.listsOfSpace(spaceId),
    );

    TestBed.tick();
    expect(lists()).toEqual({ status: 'loading' });

    spaceId.set(SPACE);
    await vi.waitFor(() => {
      TestBed.tick();
      expect(titles(lists())).toEqual(['Here']);
    });

    spaceId.set(OTHER_SPACE);
    await vi.waitFor(() => {
      TestBed.tick();
      expect(titles(lists())).toEqual(['There']);
    });
  });

  it('stops listening when its injector is destroyed', async () => {
    const lists = TestBed.runInInjectionContext(() =>
      repositories.listsOfSpace(() => SPACE),
    );
    await expectEventually(lists, []);
    TestBed.resetTestingModule();

    // A live observer of the same table: once it sees the change, the destroyed one would have
    // seen it too.
    TestBed.configureTestingModule({
      providers: [{ provide: LOCAL_DB, useValue: db }],
    });
    const witness = TestBed.runInInjectionContext(() =>
      TestBed.inject(Repositories).listsOfSpace(() => SPACE),
    );
    await db.lists.put(list('Late'));
    await vi.waitFor(() => {
      TestBed.tick();
      expect(titles(witness())).toEqual(['Late']);
    });

    expect(valueOf(lists())).toEqual([]);
  });
});

describe('Repositories.itemsOfList', () => {
  it('orders by position (ties by id) and leaves out deleted items', async () => {
    const listId = newId();
    const tieA = item(listId, 'Tie A', 'a1', {
      id: '0190a000-0000-7000-8000-00000000000a',
    });
    const tieB = item(listId, 'Tie B', 'a1', {
      id: '0190a000-0000-7000-8000-00000000000b',
    });
    await db.items.bulkPut([
      item(listId, 'Last', 'a2'),
      tieB,
      item(listId, 'First', 'a0'),
      tieA,
      item(listId, 'Gone', 'a0V', { deletedAt: 3 }),
      item(newId(), 'Other list', 'a0'),
    ]);

    const items = TestBed.runInInjectionContext(() =>
      repositories.itemsOfList(() => listId),
    );

    await vi.waitFor(() => {
      TestBed.tick();
      expect(titles(items())).toEqual(['First', 'Tie A', 'Tie B', 'Last']);
    });
  });

  it('updates when an item moves', async () => {
    const listId = newId();
    const first = item(listId, 'First', 'a0');
    const second = item(listId, 'Second', 'a1');
    await db.items.bulkPut([first, second]);
    const items = TestBed.runInInjectionContext(() =>
      repositories.itemsOfList(() => listId),
    );
    await vi.waitFor(() => {
      TestBed.tick();
      expect(titles(items())).toEqual(['First', 'Second']);
    });

    await db.items.put({ ...first, position: 'a2' });

    await vi.waitFor(() =>
      expect(titles(items())).toEqual(['Second', 'First']),
    );
  });
});

describe('Repositories.list', () => {
  it('finds one list, also when deleted, and follows changes', async () => {
    const camping = list('Camping');
    await db.lists.put(camping);
    const found = TestBed.runInInjectionContext(() =>
      repositories.list(() => camping.id),
    );

    await expectEventually(found, camping);

    await db.lists.put({ ...camping, deletedAt: 9 });
    await vi.waitFor(() => expect(valueOf(found())?.deletedAt).toBe(9));
  });

  it('is undefined for an unknown id', async () => {
    const found = TestBed.runInInjectionContext(() =>
      repositories.list(() => newId()),
    );

    await vi.waitFor(() => {
      TestBed.tick();
      expect(found()).toEqual({ status: 'ready', value: undefined });
    });
  });
});

describe('Repositories.compositionOfSpace', () => {
  const include = (
    parentListId: string,
    childListId: string,
    extra: Partial<Include> = {},
  ): Include => ({
    ...meta(),
    id: newId(),
    parentListId,
    childListId,
    position: 'a1',
    ...extra,
  });

  it('flattens through the live data and finds the lists that use a list', async () => {
    const trip = list('Trip');
    const weekend = list('Weekend');
    const camping = list('Camping');
    const gone = list('Gone', { deletedAt: 5 });
    await db.lists.bulkPut([trip, weekend, camping, gone]);
    await db.items.bulkPut([item(camping.id, 'Tent', 'a0')]);
    await db.includes.bulkPut([
      include(trip.id, camping.id),
      include(weekend.id, camping.id),
      include(gone.id, camping.id), // a list in the trash doesn't count as a user
      include(trip.id, weekend.id, { deletedAt: 3 }),
    ]);
    const state = TestBed.runInInjectionContext(() =>
      repositories.compositionOfSpace(() => SPACE),
    );

    await vi.waitFor(() => {
      TestBed.tick();
      const space = valueOf(state());
      expect(space && flatten(trip.id, space).map((f) => f.item.title)).toEqual(
        ['Tent'],
      );
      // Trip and Weekend directly; Gone is in the trash.
      expect([...(space?.usersOf(camping.id) ?? [])].sort()).toEqual(
        [trip.id, weekend.id].sort(),
      );
      expect(space?.usersOf(trip.id).size).toBe(0);
      expect(space?.includes).toHaveLength(3);
    });

    // Through another list: Big trip → Trip → Camping.
    const bigTrip = list('Big trip');
    await db.lists.put(bigTrip);
    await db.includes.put(include(bigTrip.id, trip.id));
    await vi.waitFor(() => {
      TestBed.tick();
      const space = valueOf(state());
      expect(space?.includes).toHaveLength(4);
      expect(space?.usersOf(camping.id).has(bigTrip.id)).toBe(true);
    });
  });
});

describe('Repositories.trashOfSpace', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const NOW = 100 * DAY;

  it('lists recently deleted lists and items, newest first', async () => {
    const camping = list('Camping', { deletedAt: NOW - DAY });
    const beach = list('Beach');
    const old = list('Old', { deletedAt: NOW - 31 * DAY });
    const other = {
      ...list('Elsewhere', { deletedAt: NOW }),
      spaceId: OTHER_SPACE,
    };
    await db.lists.bulkPut([camping, beach, old, other]);
    await db.items.bulkPut([
      item(camping.id, 'Tent', 'a0'), // comes back with Camping
      item(camping.id, 'Stove', 'a1', { deletedAt: NOW - 2 * DAY }), // inside a deleted list
      item(beach.id, 'Towel', 'a0', { deletedAt: NOW - 3 * DAY }),
      item(beach.id, 'Hat', 'a1'),
    ]);
    const trash = TestBed.runInInjectionContext(() =>
      repositories.trashOfSpace(
        () => SPACE,
        () => NOW,
      ),
    );

    await vi.waitFor(() => {
      TestBed.tick();
      expect(
        valueOf(trash())?.map((entry) =>
          entry.kind === 'list'
            ? `list ${entry.row.title} (${entry.itemCount}, ${entry.deletedItemCount} deleted)`
            : entry.kind === 'item'
              ? `item ${entry.row.title} in ${entry.listTitle}`
              : `run ${entry.row.title}`,
        ),
      ).toEqual(['list Camping (1, 1 deleted)', 'item Towel in Beach']);
    });
  });

  it('lists runs finished within 30 days, not active, old or deleted ones', async () => {
    // u-7's check finished it; u-9 renamed it afterwards, which doesn't make u-9 the finisher.
    const done = run('Alps', { finishedAt: NOW - DAY, updatedBy: 'u-9' });
    await db.runs.bulkPut([
      done,
      run('Active'),
      run('Old', { finishedAt: NOW - 31 * DAY }),
      run('Gone', { finishedAt: NOW - DAY, deletedAt: NOW }),
      { ...run('Elsewhere', { finishedAt: NOW }), spaceId: OTHER_SPACE },
    ]);
    await db.runItems.bulkPut([
      runItem(done.id, 'Tent', 'a0', {
        state: 'checked',
        stateBy: 'u-7',
        stateAt: NOW - DAY,
      }),
      runItem(done.id, 'Stove', 'a1', { state: 'skipped' }),
      runItem(done.id, 'Gone', 'a2', { deletedAt: 1 }),
    ]);
    const camping = list('Camping', { deletedAt: NOW - 2 * DAY });
    await db.lists.put(camping);
    const trash = TestBed.runInInjectionContext(() =>
      repositories.trashOfSpace(
        () => SPACE,
        () => NOW,
      ),
    );

    await vi.waitFor(() => {
      TestBed.tick();
      const entries = valueOf(trash()) ?? [];
      expect(entries.map((e) => `${e.kind} ${e.row.title}`)).toEqual([
        'run Alps',
        'list Camping',
      ]);
      expect(entries[0]).toMatchObject({ items: 2 });
      expect(trashedAt(entries[0])).toBe(NOW - DAY);
      expect(trashedBy(entries[0])).toBe('u-7');
    });
  });

  it('drops an entry once it is restored', async () => {
    const beach = list('Beach', { deletedAt: NOW });
    await db.lists.put(beach);
    const trash = TestBed.runInInjectionContext(() =>
      repositories.trashOfSpace(
        () => SPACE,
        () => NOW,
      ),
    );
    await vi.waitFor(() => {
      TestBed.tick();
      expect(valueOf(trash())).toHaveLength(1);
    });

    await db.lists.put({ ...beach, deletedAt: null });
    await vi.waitFor(() => {
      TestBed.tick();
      expect(valueOf(trash())).toEqual([]);
    });
  });
});

describe('Repositories.currentUserId', () => {
  it('is the user id from the last welcome, and undefined before', async () => {
    const userId = TestBed.runInInjectionContext(() =>
      repositories.currentUserId(),
    );
    await vi.waitFor(() => {
      TestBed.tick();
      expect(userId()).toEqual({ status: 'ready', value: undefined });
    });

    await db.meta.put({ key: 'userId', value: 'u-1' });
    await vi.waitFor(() => {
      TestBed.tick();
      expect(valueOf(userId())).toBe('u-1');
    });
  });
});

const run = (title: string, extra: Partial<Run> = {}): Run => ({
  ...meta(),
  id: newId(),
  title,
  sourceListId: null,
  finishedAt: null,
  ...extra,
});
const runItem = (
  runId: string,
  title: string,
  position: string,
  extra: Partial<RunItem> = {},
): RunItem => ({
  ...meta(),
  id: newId(),
  runId,
  title,
  quantity: '',
  note: '',
  position,
  sources: [],
  state: 'unchecked',
  stateBy: null,
  stateAt: null,
  mergedInto: null,
  ...extra,
});

describe('Repositories.activeRunsOfSpace', () => {
  it('lists active runs newest first with progress, never finished, deleted or other spaces’ runs', async () => {
    const older = run('Older', { createdAt: 1 });
    const newer = run('Newer', { createdAt: 2 });
    await db.runs.bulkPut([
      older,
      newer,
      run('Finished', { createdAt: 3, finishedAt: 3 }),
      run('Deleted', { createdAt: 4, deletedAt: 4 }),
      run('Elsewhere', { ...meta(OTHER_SPACE), createdAt: 5 }),
    ]);
    await db.runItems.bulkPut([
      runItem(older.id, 'A', 'a0', { state: 'checked' }),
      runItem(older.id, 'B', 'a1', { state: 'skipped' }),
      runItem(older.id, 'C', 'a2'),
      runItem(older.id, 'Removed', 'a3', { deletedAt: 1, state: 'checked' }),
    ]);
    const runs = TestBed.runInInjectionContext(() =>
      repositories.activeRunsOfSpace(() => SPACE),
    );
    await expectEventually(runs, [
      { run: newer, done: 0, total: 0 },
      { run: older, done: 2, total: 3 },
    ]);
  });

  it('drops a run once it finishes', async () => {
    const alps = run('Alps');
    await db.runs.put(alps);
    const runs = TestBed.runInInjectionContext(() =>
      repositories.activeRunsOfSpace(() => SPACE),
    );
    await expectEventually(runs, [{ run: alps, done: 0, total: 0 }]);
    await db.runs.put({ ...alps, finishedAt: 9 });
    await expectEventually(runs, []);
  });
});

describe('Repositories.run and itemsOfRun', () => {
  it('finds a run and its live items by position', async () => {
    const alps = run('Alps');
    const tent = runItem(alps.id, 'Tent', 'a1');
    const stove = runItem(alps.id, 'Stove', 'a0');
    await db.runs.put(alps);
    await db.runItems.bulkPut([
      tent,
      stove,
      runItem(alps.id, 'Gone', 'a2', { deletedAt: 1 }),
      runItem(newId(), 'Other run', 'a0'),
    ]);
    const found = TestBed.runInInjectionContext(() =>
      repositories.run(() => alps.id),
    );
    const items = TestBed.runInInjectionContext(() =>
      repositories.itemsOfRun(() => alps.id),
    );
    await expectEventually(found, alps);
    await expectEventually(items, [stove, tent]);
  });

  it('finds one run item, also a removed one', async () => {
    const gone = runItem(newId(), 'Gone', 'a0', { deletedAt: 1 });
    await db.runItems.put(gone);
    const found = TestBed.runInInjectionContext(() =>
      repositories.runItem(() => gone.id),
    );
    await expectEventually(found, gone);
  });
});
