import { type Signal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type Item, type List, newId } from '@lister/shared/domain';
import { LOCAL_DB, LocalDb } from './local-db';
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

/** Waits until the signal shows `expected` (liveQuery answers asynchronously). */
async function expectEventually<T>(value: Signal<T>, expected: unknown) {
  await vi.waitFor(() => {
    TestBed.tick();
    expect(value()).toEqual(expected);
  });
}

const titles = (rows: { title: string }[] | undefined) =>
  rows?.map((r) => r.title);

describe('LocalDb', () => {
  it('has the tables of schema version 1', () => {
    expect(db.verno).toBe(1);
    expect(db.tables.map((t) => t.name).sort()).toEqual([
      'items',
      'lists',
      'meta',
      'outbox',
      'spaces',
      'syncState',
    ]);
  });
});

describe('Repositories.listsOfSpace', () => {
  it('is undefined until loaded, then follows changes', async () => {
    const lists = TestBed.runInInjectionContext(() =>
      repositories.listsOfSpace(() => SPACE),
    );
    expect(lists()).toBeUndefined();
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

    await vi.waitFor(() => expect(lists()).toEqual([]));
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
    expect(lists()).toBeUndefined();

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
    await db.lists.put(list('Late'));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(lists()).toEqual([]);
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
