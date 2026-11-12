import { type Signal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  type Include,
  type Item,
  type List,
  flatten,
  newId,
} from '@lister/shared/domain';
import { LOCAL_DB, LocalDb } from './local-db';
import { type QueryState, valueOf } from './live-query-signal';
import { Repositories } from './repositories';

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
  it('has the tables of schema version 4', () => {
    expect(db.verno).toBe(4);
    expect(db.tables.map((t) => t.name).sort()).toEqual([
      'includes',
      'items',
      'lists',
      'meta',
      'outbox',
      'rejections',
      'serverIncludes',
      'serverItems',
      'serverLists',
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
