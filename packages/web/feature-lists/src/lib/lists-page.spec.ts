import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuHarness } from '@angular/material/menu/testing';
import {
  type Include,
  type Item,
  type List,
  newId,
} from '@lister/shared/domain';
import { LOCAL_DB, LocalDb } from '@lister/web/data-access-local-db';
import { SyncEngine } from '@lister/web/data-access-sync';
import { Notifier } from '@lister/web/util-notify';
import { of } from 'rxjs';
import { ListsPage, copyTitle } from './lists-page';

const SPACE = newId();
const meta = {
  spaceId: SPACE,
  version: 1,
  deletedAt: null,
  createdBy: 'u',
  updatedBy: 'u',
  createdAt: 0,
  updatedAt: 0,
};
const list = (title: string): List => ({
  ...meta,
  id: newId(),
  title,
  description: '',
});
const item = (listId: string): Item => ({
  ...meta,
  id: newId(),
  listId,
  title: 'x',
  quantity: '',
  note: '',
  position: 'a0',
});

let db: LocalDb;
let mutate: ReturnType<typeof vi.fn>;
let dialogAnswer: string | undefined;
let notify: ReturnType<typeof vi.fn>;

beforeEach(() => {
  db = new LocalDb(`test-${newId()}`);
});

async function render(options: { space?: boolean } = {}) {
  if (options.space !== false) {
    await db.spaces.put({ id: SPACE, name: 'Home', version: 1, members: [] });
  }
  mutate = vi.fn(async () => ({ ok: true }));
  notify = vi.fn(async () => 'dismissed');
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: LOCAL_DB, useValue: db },
      { provide: SyncEngine, useValue: { mutate } },
      { provide: Notifier, useValue: { notify } },
      {
        provide: MatDialog,
        useValue: {
          open: vi.fn(() => ({ afterClosed: () => of(dialogAnswer) })),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ListsPage);
  const element = fixture.nativeElement as HTMLElement;
  const settle = () =>
    vi.waitFor(async () => {
      await fixture.whenStable();
      expect(element.querySelector('lister-loading-hint')).toBeNull();
    });
  await settle();
  return {
    fixture,
    element,
    loader: TestbedHarnessEnvironment.loader(fixture),
    settle,
  };
}

afterEach(async () => {
  TestBed.resetTestingModule();
  await db.delete();
});

/** The extended FAB, found by its visible text. */
const newListButton = (element: HTMLElement) => {
  const button = [...element.querySelectorAll('button')].find((b) =>
    b.textContent?.includes('New list'),
  );
  if (!button) throw new Error('no New list button');
  return button;
};

const rows = (element: HTMLElement) =>
  [...element.querySelectorAll('.row')].map(
    (row) =>
      `${row.querySelector('.title')?.textContent?.trim()} · ${row.querySelector('.count')?.textContent?.trim()}`,
  );

describe('ListsPage', () => {
  it('says so before the first connection, without offering New list', async () => {
    const { element } = await render({ space: false });

    expect(element.textContent).toContain('once Lister has connected');
    expect(element.textContent).not.toContain('New list');
  });

  it('shows an empty state outside any list, with New list', async () => {
    const { element } = await render();

    expect(element.textContent).toContain('No lists yet');
    expect(element.querySelector('ul')).toBeNull();
    expect(newListButton(element)).toBeTruthy();
  });

  it('shows the lists by title with their item counts, and follows changes', async () => {
    const camping = list('Camping');
    await db.lists.bulkPut([list('beach'), camping]);
    await db.items.bulkPut([item(camping.id), item(camping.id)]);
    const { element, fixture } = await render();

    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(rows(element)).toEqual(['beach · 0 items', 'Camping · 2 items']);
    });

    await db.items.put(item(camping.id));
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(rows(element)).toContain('Camping · 3 items');
    });
  });

  it('adds the total and the included lists for a list that includes others', async () => {
    const trip = list('Trip');
    const camping = list('Camping');
    const toiletries = list('Toiletries');
    const gone = list('Gone');
    await db.lists.bulkPut([
      trip,
      camping,
      toiletries,
      { ...gone, deletedAt: 1 },
    ]);
    await db.items.bulkPut([
      item(trip.id),
      item(camping.id),
      item(camping.id),
      item(toiletries.id),
      { ...item(toiletries.id), deletedAt: 2 },
    ]);
    const include = (parent: List, child: List): Include => ({
      ...meta,
      id: newId(),
      parentListId: parent.id,
      childListId: child.id,
      position: 'a1',
    });
    await db.includes.bulkPut([
      include(trip, camping),
      include(camping, toiletries), // nested
      include(trip, toiletries), // a diamond: counted once
      include(trip, gone), // in the trash: not counted
    ]);
    const { element, fixture } = await render();

    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(rows(element)).toEqual([
        'Camping · 2 items · 3 in total · 1 list included',
        'Toiletries · 1 item',
        'Trip · 1 item · 4 in total · 2 lists included',
      ]);
    });
  });

  it('creates a list from the FAB through the sync engine', async () => {
    const { element } = await render();
    dialogAnswer = 'Camping';

    newListButton(element).click();

    await vi.waitFor(() =>
      expect(mutate).toHaveBeenCalledWith({
        spaceId: SPACE,
        name: 'list.create',
        args: { id: expect.any(String), title: 'Camping' },
      }),
    );
  });

  it('does nothing when the dialog is cancelled', async () => {
    const { element } = await render();
    dialogAnswer = undefined;

    newListButton(element).click();
    await new Promise((resolve) => setTimeout(resolve));

    expect(mutate).not.toHaveBeenCalled();
  });

  it('renames a list from its menu', async () => {
    const camping = list('Camping');
    await db.lists.put(camping);
    const { loader, settle } = await render();
    await settle();
    dialogAnswer = 'Camping trip';

    const menu = await loader.getHarness(
      MatMenuHarness.with({ selector: '[aria-label="More for Camping"]' }),
    );
    await menu.clickItem({ text: /Rename/ });

    await vi.waitFor(() =>
      expect(mutate).toHaveBeenCalledWith({
        spaceId: SPACE,
        name: 'list.update',
        args: { id: camping.id, patch: { title: 'Camping trip' } },
      }),
    );
  });

  it('deletes a list and restores it with Undo', async () => {
    const camping = list('Camping');
    await db.lists.put(camping);
    const { loader } = await render();
    notify.mockResolvedValueOnce('action');

    const menu = await loader.getHarness(
      MatMenuHarness.with({ selector: '[aria-label="More for Camping"]' }),
    );
    await menu.clickItem({ text: /Delete/ });

    await vi.waitFor(() =>
      expect(mutate.mock.calls.map(([request]) => request.name)).toEqual([
        'list.delete',
        'list.restore',
      ]),
    );
    expect(notify).toHaveBeenCalledWith({
      message: 'Deleted “Camping”',
      action: 'Undo',
      duration: expect.any(Number),
    });
  });

  it('duplicates a list with its items in order and the same includes', async () => {
    const camping = { ...list('Camping'), description: 'Summer' };
    const toiletries = list('Toiletries');
    await db.lists.bulkPut([camping, toiletries]);
    const tent = {
      ...item(camping.id),
      title: 'Tent',
      position: 'a1',
      quantity: '1',
      note: '2 people',
    };
    const stove = { ...item(camping.id), title: 'Stove', position: 'a0' };
    const gone = {
      ...item(camping.id),
      title: 'Gone',
      position: 'a2',
      deletedAt: 3,
    };
    await db.items.bulkPut([tent, stove, gone]);
    await db.includes.put({
      ...meta,
      id: newId(),
      parentListId: camping.id,
      childListId: toiletries.id,
      position: 'a5',
    });
    const { loader, element, fixture } = await render();
    // The copy is made from the loaded composition: wait until the counts show it.
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(rows(element)).toContain(
        'Camping · 2 items · 2 in total · 1 list included',
      );
    });

    const menu = await loader.getHarness(
      MatMenuHarness.with({ selector: '[aria-label="More for Camping"]' }),
    );
    await menu.clickItem({ text: /Duplicate/ });

    await vi.waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    const [request] = mutate.mock.calls[0];
    const copyId = request.args.id;
    expect(request).toEqual({
      spaceId: SPACE,
      name: 'list.duplicate',
      args: {
        id: copyId,
        sourceListId: camping.id,
        title: 'Copy of Camping',
        items: expect.arrayContaining([
          { from: tent.id, id: expect.any(String) },
          { from: stove.id, id: expect.any(String) },
        ]),
        includes: [{ from: expect.any(String), id: expect.any(String) }],
      },
    });
    expect(request.args.items).toHaveLength(2); // not the deleted one
    const newIds = [
      copyId,
      ...request.args.items.map((r: { id: string }) => r.id),
      ...request.args.includes.map((r: { id: string }) => r.id),
    ];
    expect(new Set(newIds).size).toBe(4);
    expect(newIds).not.toContain(tent.id);
    await vi.waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Created “Copy of Camping”',
          action: 'Open',
        }),
      ),
    );
  });

  it('opens the copy from the notice', async () => {
    const camping = list('Camping');
    await db.lists.put(camping);
    const { loader, element, fixture } = await render();
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(rows(element)).toContain('Camping · 0 items');
    });
    notify.mockResolvedValueOnce('action');
    const navigate = vi
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockResolvedValue(true);

    const menu = await loader.getHarness(
      MatMenuHarness.with({ selector: '[aria-label="More for Camping"]' }),
    );
    await menu.clickItem({ text: /Duplicate/ });

    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());
    const copyId = mutate.mock.calls[0][0].args.id;
    expect(navigate).toHaveBeenCalledWith(['/lists', copyId]);
  });

  it('says why a duplicate was refused, and nothing is created', async () => {
    const camping = list('Camping');
    await db.lists.put(camping);
    await db.items.put(item(camping.id));
    const { loader, element, fixture } = await render();
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(rows(element)).toContain('Camping · 1 item');
    });
    mutate.mockResolvedValueOnce({ ok: false, reason: 'Nope' });

    const menu = await loader.getHarness(
      MatMenuHarness.with({ selector: '[aria-label="More for Camping"]' }),
    );
    await menu.clickItem({ text: /Duplicate/ });

    await vi.waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Nope' }),
      ),
    );
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'Open' }),
    );
  });

  it('shows why a change was refused', async () => {
    const { element } = await render();
    mutate.mockResolvedValueOnce({
      ok: false,
      reason: 'At most 200 characters',
    });
    dialogAnswer = 'x';

    newListButton(element).click();

    await vi.waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'At most 200 characters' }),
      ),
    );
  });
});

describe('copyTitle', () => {
  it('prefixes "Copy of" and stays within the title limit', () => {
    expect(copyTitle('Camping')).toBe('Copy of Camping');
    const long = 'x'.repeat(200);
    expect([...copyTitle(long)]).toHaveLength(200);
    expect(copyTitle('🏕'.repeat(199))).toBe(`Copy of ${'🏕'.repeat(192)}`);
    // A family emoji is one grapheme of 7 code points: it's never cut in half.
    const family = '👨‍👩‍👧‍👦';
    const near = 'x'.repeat(190) + family;
    expect(copyTitle(near)).toBe(`Copy of ${'x'.repeat(190)}`.trimEnd());
  });
});
