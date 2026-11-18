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
import {
  makeInclude,
  makeItem,
  makeList,
  makeLocalSpace,
} from '@lister/shared/testing';
import { LOCAL_DB, LocalDb } from '@lister/web/data-access-local-db';
import { SyncEngine } from '@lister/web/data-access-sync';
import { Transfers } from '@lister/web/feature-transfer';
import { Notifier } from '@lister/web/util-notify';
import { of } from 'rxjs';
import { ListsPage, copyTitle } from './lists-page';

const SPACE = newId();
const list = (title: string): List => makeList({ spaceId: SPACE, title });
const item = (listId: string): Item =>
  makeItem({ spaceId: SPACE, listId, title: 'x' });

let db: LocalDb;
let mutate: ReturnType<typeof vi.fn>;
let dialogAnswer:
  | string
  | { title: string; items: string[] }
  | Pick<List, 'colour' | 'icon'>
  | undefined;
let notify: ReturnType<typeof vi.fn>;

beforeEach(() => {
  db = new LocalDb(`test-${newId()}`);
});

async function render(options: { space?: boolean } = {}) {
  if (options.space !== false) {
    await db.spaces.put(
      makeLocalSpace({ id: SPACE, name: 'Home', version: 1 }),
    );
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
    expect(element.querySelector('a.all-items')).toBeNull();
  });

  it('shows the lists by title with their item counts, and follows changes', async () => {
    const camping = list('Camping');
    await db.lists.bulkPut([list('beach'), camping]);
    await db.items.bulkPut([item(camping.id), item(camping.id)]);
    const { element, fixture } = await render();
    expect(element.querySelector('a.all-items')?.textContent).toContain(
      'All items',
    );

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
    const include = (parent: List, child: List): Include =>
      makeInclude({
        spaceId: SPACE,
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
    dialogAnswer = { title: 'Camping', items: [] };

    newListButton(element).click();

    await vi.waitFor(() =>
      expect(mutate).toHaveBeenCalledWith({
        spaceId: SPACE,
        name: 'list.create',
        args: { id: expect.any(String), title: 'Camping' },
      }),
    );
  });

  it('creates a list with its pasted items in one change', async () => {
    const { element } = await render();
    dialogAnswer = { title: 'Camping', items: ['Tent', 'Stove'] };

    newListButton(element).click();

    await vi.waitFor(() =>
      expect(mutate).toHaveBeenCalledWith({
        spaceId: SPACE,
        name: 'list.create',
        args: {
          id: expect.any(String),
          title: 'Camping',
          items: [
            { id: expect.any(String), title: 'Tent' },
            { id: expect.any(String), title: 'Stove' },
          ],
        },
      }),
    );
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the dialog is cancelled', async () => {
    const { element } = await render();
    dialogAnswer = undefined;

    newListButton(element).click();
    await new Promise((resolve) => setTimeout(resolve));

    expect(mutate).not.toHaveBeenCalled();
  });

  it('starts a run from the list menu with its items, those of included lists too, and opens it', async () => {
    const camping = list('Camping');
    const basics = list('Basics');
    const tent = { ...item(camping.id), title: 'Tent', position: 'a0' };
    const lamp = { ...item(basics.id), title: 'Lamp', quantity: '2' };
    const include: Include = makeInclude({
      spaceId: SPACE,
      parentListId: camping.id,
      childListId: basics.id,
      position: 'a1',
    });
    await db.lists.bulkPut([camping, basics]);
    await db.items.bulkPut([tent, lamp]);
    await db.includes.put(include);
    const { loader, settle } = await render();
    await settle();
    const navigate = vi
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockResolvedValue(true);

    const menu = await loader.getHarness(
      MatMenuHarness.with({ selector: '[aria-label="More for Camping"]' }),
    );
    await menu.clickItem({ text: /Start run/ });

    await vi.waitFor(() => expect(mutate).toHaveBeenCalled());
    const [request] = mutate.mock.calls[0];
    expect(request).toMatchObject({
      spaceId: SPACE,
      name: 'run.start',
      args: {
        title: expect.stringMatching(/^Camping · \d{1,2} \w{3} \d{4}$/),
        sourceListId: camping.id,
        items: [
          { title: 'Tent', quantity: '', sources: [camping.id] },
          { title: 'Lamp', quantity: '2', sources: [basics.id] },
        ],
      },
    });
    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(['/runs', request.args.id]),
    );
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

  it("shows a list's colour and icon, or its first letter when it has none (D26)", async () => {
    await db.lists.bulkPut([
      { ...list('Camping'), colour: 'teal', icon: 'camping' },
      list('Beach'),
    ]);
    const { element } = await render();

    const [beach, camping] = [
      ...element.querySelectorAll('lister-list-avatar'),
    ] as HTMLElement[];
    expect(camping.getAttribute('data-colour')).toBe('teal');
    expect(camping.textContent?.trim()).toBe('camping');
    expect(beach.hasAttribute('data-colour')).toBe(false);
    expect(beach.textContent?.trim()).toBe('B');
  });

  it('sets only the colour and icon that changed, from the list menu', async () => {
    const camping = { ...list('Camping'), colour: 'teal' as const };
    await db.lists.put(camping);
    const { loader } = await render();
    dialogAnswer = { colour: 'teal', icon: 'camping' };

    const menu = await loader.getHarness(
      MatMenuHarness.with({ selector: '[aria-label="More for Camping"]' }),
    );
    await menu.clickItem({ text: /Colour and icon/ });

    await vi.waitFor(() =>
      expect(mutate).toHaveBeenCalledWith({
        spaceId: SPACE,
        name: 'list.update',
        args: { id: camping.id, patch: { icon: 'camping' } },
      }),
    );
  });

  it('clears the colour with null, and sends nothing when the dialog is cancelled or unchanged', async () => {
    const camping = { ...list('Camping'), colour: 'teal' as const };
    await db.lists.put(camping);
    const { loader } = await render();
    const menu = await loader.getHarness(
      MatMenuHarness.with({ selector: '[aria-label="More for Camping"]' }),
    );

    dialogAnswer = undefined;
    await menu.clickItem({ text: /Colour and icon/ });
    dialogAnswer = { colour: 'teal', icon: null };
    await menu.clickItem({ text: /Colour and icon/ });
    expect(mutate).not.toHaveBeenCalled();

    dialogAnswer = { colour: null, icon: null };
    await menu.clickItem({ text: /Colour and icon/ });
    await vi.waitFor(() =>
      expect(mutate).toHaveBeenCalledWith({
        spaceId: SPACE,
        name: 'list.update',
        args: { id: camping.id, patch: { colour: null } },
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
    await db.includes.put(
      makeInclude({
        spaceId: SPACE,
        parentListId: camping.id,
        childListId: toiletries.id,
        position: 'a5',
      }),
    );
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
    dialogAnswer = { title: 'x', items: [] };

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

  it('offers Export as Markdown and Export as JSON in a list’s menu', async () => {
    const camping = list('Camping');
    await db.lists.put(camping);
    await db.items.put(item(camping.id));
    const { loader, settle } = await render();
    await settle();
    const exportList = vi
      .spyOn(TestBed.inject(Transfers), 'exportList')
      .mockImplementation(() => undefined);
    const open = () =>
      loader.getHarness(
        MatMenuHarness.with({ selector: '[aria-label="More for Camping"]' }),
      );

    await (await open()).clickItem({ text: /Export as Markdown/ });
    await (await open()).clickItem({ text: /Export as JSON/ });

    expect(
      exportList.mock.calls.map(([l, format]) => [l.title, format]),
    ).toEqual([
      ['Camping', 'markdown'],
      ['Camping', 'json'],
    ]);
    // Built from the local rows of the space, including the lists it includes.
    expect(exportList.mock.calls[0][2].itemsOf(camping.id)).toHaveLength(1);
  });

  it('offers Import once there is a space', async () => {
    expect((await render()).element.textContent).toContain('Import');
  });

  it('does not offer Import before the first connection', async () => {
    expect((await render({ space: false })).element.textContent).not.toContain(
      'Import',
    );
  });
});
