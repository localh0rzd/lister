import { By, Title } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { CdkDropList } from '@angular/cdk/drag-drop';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuHarness } from '@angular/material/menu/testing';
import {
  type Include,
  type Item,
  type List,
  newId,
  sortByPosition,
} from '@lister/shared/domain';
import type { MutationRequest } from '@lister/web/data-access-sync';
import { LOCAL_DB, LocalDb } from '@lister/web/data-access-local-db';
import { SyncEngine } from '@lister/web/data-access-sync';
import { Notifier } from '@lister/web/util-notify';
import { of } from 'rxjs';
import type { ItemDialogData } from '@lister/web/ui';
import { ListEditorPage } from './list-editor-page';

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
const camping: List = {
  ...meta,
  id: newId(),
  title: 'Camping',
  description: '',
};
const item = (
  title: string,
  position: string,
  extra: Partial<Item> = {},
): Item => ({
  ...meta,
  id: newId(),
  listId: camping.id,
  title,
  quantity: '',
  note: '',
  position,
  ...extra,
});

let db: LocalDb;
let requests: MutationRequest[];
let mutate: ReturnType<typeof vi.fn>;
let notify: ReturnType<typeof vi.fn>;
let dialogAnswer: unknown;

beforeEach(async () => {
  db = new LocalDb(`test-${newId()}`);
  await db.spaces.put({ id: SPACE, name: 'Home', version: 1, members: [] });
  await db.lists.put(camping);
  requests = [];
  mutate = vi.fn(async (request: MutationRequest) => {
    requests.push(request);
    return { ok: true };
  });
  notify = vi.fn(async () => 'dismissed');
  dialogAnswer = undefined;
});
afterEach(async () => {
  TestBed.resetTestingModule();
  await db.delete();
});

async function render(listId = camping.id) {
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
  const fixture = TestBed.createComponent(ListEditorPage);
  fixture.componentRef.setInput('listId', listId);
  const element = fixture.nativeElement as HTMLElement;
  await vi.waitFor(async () => {
    await fixture.whenStable();
    expect(element.querySelector('lister-loading-hint')).toBeNull();
  });
  const input = () => element.querySelector('input') as HTMLInputElement;
  return {
    fixture,
    element,
    input,
    loader: TestbedHarnessEnvironment.loader(fixture),
    titles: () =>
      [...element.querySelectorAll('.item .title')].map((t) =>
        t.textContent?.trim(),
      ),
    type: async (text: string) => {
      input().value = text;
      input().dispatchEvent(new Event('input'));
      await fixture.whenStable();
    },
    submit: async () => {
      element.querySelector('form')?.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
    },
  };
}

/** Items the page created, in the order it created them, sorted as they'd show. */
const created = () =>
  sortByPosition(
    requests
      .filter((r) => r.name === 'item.create')
      .map((r) => r.args as { id: string; title: string; position: string }),
  ).map((args) => args.title);

describe('ListEditorPage', () => {
  it('shows the items in order, with quantity and note', async () => {
    await db.items.bulkPut([
      item('Stove', 'a1', { quantity: '1', note: 'with gas' }),
      item('Tent', 'a0'),
      item('Gone', 'a2', { deletedAt: 1 }),
    ]);
    const page = await render();

    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(page.titles()).toEqual(['Tent', 'Stove']);
    });
    expect(page.element.querySelector('h1')?.textContent).toBe('Camping');
    expect(page.element.textContent).toContain('with gas');
    expect(
      page.element.querySelector('.quantity')?.getAttribute('aria-label'),
    ).toBe('Quantity 1');
  });

  it('adds the typed item at the end and clears the field', async () => {
    await db.items.put(item('Tent', 'a0'));
    const page = await render();

    await page.type('  Stove ');
    await page.submit();

    await vi.waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({
      spaceId: SPACE,
      name: 'item.create',
      args: { listId: camping.id, title: 'Stove' },
    });
    expect((requests[0].args as { position: string }).position > 'a0').toBe(
      true,
    );
    await vi.waitFor(() => expect(page.input().value).toBe(''));
  });

  it('ignores an empty entry', async () => {
    const page = await render();

    await page.type('   ');
    await page.submit();
    await new Promise((resolve) => setTimeout(resolve));

    expect(mutate).not.toHaveBeenCalled();
  });

  it('starts a run with a copy of the list from "Start run" and opens it', async () => {
    await db.items.bulkPut([item('Tent', 'a0'), item('Stove', 'a1')]);
    const page = await render();
    const navigate = vi
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockResolvedValue(true);
    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(page.titles()).toEqual(['Tent', 'Stove']);
    });

    (
      [...page.element.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('Start run'),
      ) as HTMLButtonElement
    ).click();

    await vi.waitFor(() => expect(requests).toHaveLength(1));
    const [request] = requests;
    expect(request).toMatchObject({
      name: 'run.start',
      args: {
        sourceListId: camping.id,
        items: [{ title: 'Tent' }, { title: 'Stove' }],
      },
    });
    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith([
        '/runs',
        request.name === 'run.start' ? request.args.id : '',
      ]),
    );
  });

  it('adds one item per pasted line, in order', async () => {
    const page = await render();
    const paste = new Event('paste', { cancelable: true }) as ClipboardEvent;
    Object.defineProperty(paste, 'clipboardData', {
      value: { getData: () => 'Tent\r\n\n  Stove  \nMatches\n' },
    });

    page.input().dispatchEvent(paste);

    await vi.waitFor(() =>
      expect(created()).toEqual(['Tent', 'Stove', 'Matches']),
    );
    expect(paste.defaultPrevented).toBe(true);
  });

  it('lets a single pasted line into the field as usual', async () => {
    const page = await render();
    const paste = new Event('paste', { cancelable: true }) as ClipboardEvent;
    Object.defineProperty(paste, 'clipboardData', {
      value: { getData: () => 'Tent' },
    });

    page.input().dispatchEvent(paste);

    expect(paste.defaultPrevented).toBe(false);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('edits an item through the dialog', async () => {
    const socks = item('Socks', 'a0');
    await db.items.put(socks);
    const page = await render();
    dialogAnswer = { quantity: '3 pairs' };

    const menu = await page.loader.getHarness(
      MatMenuHarness.with({ selector: '[aria-label="More for Socks"]' }),
    );
    await menu.clickItem({ text: /Edit/ });

    await vi.waitFor(() =>
      expect(requests).toEqual([
        expect.objectContaining({
          name: 'item.update',
          args: { id: socks.id, patch: { quantity: '3 pairs' } },
        }),
      ]),
    );
    expect(TestBed.inject(MatDialog).open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: expect.objectContaining({
          editedBy: expect.stringMatching(/^Someone · /),
        }),
      }),
    );
  });

  describe('while an item is being edited', () => {
    async function editSocks() {
      const socks = item('Socks', 'a0');
      await db.items.put(socks);
      await db.spaces.put({
        id: SPACE,
        name: 'Home',
        version: 1,
        members: [{ userId: 'ben', displayName: 'Ben' }],
      });
      await db.meta.put({ key: 'userId', value: 'me' });
      const page = await render();
      const menu = await page.loader.getHarness(
        MatMenuHarness.with({ selector: '[aria-label="More for Socks"]' }),
      );
      await menu.clickItem({ text: /Edit/ });
      const data = vi.mocked(TestBed.inject(MatDialog).open).mock.calls[0][1]
        ?.data as ItemDialogData;
      expect(data.deleted?.()).toBeUndefined();
      return { socks, data };
    }

    it('tells the dialog who deleted the item, and restores it from there', async () => {
      const { socks, data } = await editSocks();

      await db.items.put({ ...socks, deletedAt: 5, updatedBy: 'ben' });

      await vi.waitFor(() => expect(data.deleted?.()).toBe('Deleted by Ben'));
      await data.restore?.();
      expect(requests).toEqual([
        expect.objectContaining({
          name: 'item.restore',
          args: { id: socks.id },
        }),
      ]);
    });

    it('says "you" when the user deleted it on another device', async () => {
      const { socks, data } = await editSocks();

      await db.items.put({ ...socks, deletedAt: 5, updatedBy: 'me' });

      await vi.waitFor(() => expect(data.deleted?.()).toBe('Deleted by you'));
    });

    it('tells the dialog when the list was deleted, and restores the list from there', async () => {
      const { data } = await editSocks();

      await db.lists.put({ ...camping, deletedAt: 5, updatedBy: 'ben' });

      await vi.waitFor(() =>
        expect(data.deleted?.()).toBe('“Camping” was deleted by Ben'),
      );
      await data.restore?.();
      expect(requests).toEqual([
        expect.objectContaining({
          name: 'list.restore',
          args: { id: camping.id },
        }),
      ]);
    });
  });

  it('deletes an item and restores it with Undo', async () => {
    const tent = item('Tent', 'a0');
    await db.items.put(tent);
    const page = await render();
    notify.mockResolvedValueOnce('action');

    const menu = await page.loader.getHarness(
      MatMenuHarness.with({ selector: '[aria-label="More for Tent"]' }),
    );
    await menu.clickItem({ text: /Delete/ });

    await vi.waitFor(() =>
      expect(requests.map((r) => r.name)).toEqual([
        'item.delete',
        'item.restore',
      ]),
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Deleted “Tent”', action: 'Undo' }),
    );
  });

  it('moves items with Move up and Move down', async () => {
    const [a, b, c] = [item('A', 'a0'), item('B', 'a1'), item('C', 'a2')];
    await db.items.bulkPut([a, b, c]);
    const page = await render();
    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(page.titles()).toEqual(['A', 'B', 'C']);
    });

    const menuFor = (title: string) =>
      page.loader.getHarness(
        MatMenuHarness.with({ selector: `[aria-label="More for ${title}"]` }),
      );
    await (await menuFor('C')).clickItem({ text: /Move up/ });
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    const up = requests[0].args as { id: string; position: string };
    expect(up.id).toBe(c.id);
    expect(up.position > 'a0' && up.position < 'a1').toBe(true);

    await (await menuFor('A')).clickItem({ text: /Move down/ });
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    const down = requests[1].args as { id: string; position: string };
    expect(down.position > 'a1' && down.position < 'a2').toBe(true);
  });

  it('offers no Move up for the first item and no Move down for the last', async () => {
    await db.items.bulkPut([item('A', 'a0'), item('B', 'a1')]);
    const page = await render();

    const first = await page.loader.getHarness(
      MatMenuHarness.with({ selector: '[aria-label="More for A"]' }),
    );
    await first.open();
    const items = await first.getItems();
    const disabled = await Promise.all(
      items.map(
        async (i) => [await i.getText(), await i.isDisabled()] as const,
      ),
    );
    expect(disabled).toEqual(
      expect.arrayContaining([
        [expect.stringContaining('Move up'), true],
        [expect.stringContaining('Move down'), false],
      ]),
    );
  });

  it('reorders with drag and drop', async () => {
    const [a, b, c] = [item('A', 'a0'), item('B', 'a1'), item('C', 'a2')];
    await db.items.bulkPut([a, b, c]);
    const page = await render();
    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(page.titles()).toEqual(['A', 'B', 'C']);
    });

    page.fixture.debugElement
      .query(By.directive(CdkDropList))
      .triggerEventHandler('cdkDropListDropped', {
        previousIndex: 0,
        currentIndex: 2,
        item: { data: a },
      });

    await vi.waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({
      name: 'item.move',
      args: { id: a.id },
    });
    expect((requests[0].args as { position: string }).position > 'a2').toBe(
      true,
    );
  });

  it('shows the dropped order at once, before the new position is stored', async () => {
    const [a, b, c] = [item('A', 'a0'), item('B', 'a1'), item('C', 'a2')];
    await db.items.bulkPut([a, b, c]);
    let store: (() => Promise<unknown>) | undefined;
    mutate.mockImplementation(async (request: MutationRequest) => {
      requests.push(request);
      const { id, position } = request.args as { id: string; position: string };
      store = () => db.items.update(id, { position }); // the local write, later
      return { ok: true };
    });
    const page = await render();
    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(page.titles()).toEqual(['A', 'B', 'C']);
    });

    page.fixture.debugElement
      .query(By.directive(CdkDropList))
      .triggerEventHandler('cdkDropListDropped', {
        previousIndex: 0,
        currentIndex: 2,
        item: { data: a },
      });
    page.fixture.detectChanges();
    // No frame with the old order: A is at the end before anything is stored.
    expect(page.titles()).toEqual(['B', 'C', 'A']);

    await vi.waitFor(() => expect(store).toBeDefined());
    await store?.();
    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(page.titles()).toEqual(['B', 'C', 'A']);
    });
  });

  it('goes back to the stored order when a move is refused', async () => {
    const [a, b] = [item('A', 'a0'), item('B', 'a1')];
    await db.items.bulkPut([a, b]);
    mutate.mockResolvedValue({ ok: false, reason: 'Nope' });
    const page = await render();
    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(page.titles()).toEqual(['A', 'B']);
    });

    page.fixture.debugElement
      .query(By.directive(CdkDropList))
      .triggerEventHandler('cdkDropListDropped', {
        previousIndex: 0,
        currentIndex: 1,
        item: { data: a },
      });

    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(page.titles()).toEqual(['A', 'B']);
    });
  });

  it('moves the dragged item even if the list changed during the drag', async () => {
    const rows = ['A', 'B', 'C', 'D', 'E'].map((t, i) => item(t, `a${i}`));
    await db.items.bulkPut(rows);
    const page = await render();
    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(page.titles()).toEqual(['A', 'B', 'C', 'D', 'E']);
    });

    // Another device deletes A while C is being dragged to the end.
    await db.items.put({ ...rows[0], deletedAt: 1 });
    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(page.titles()).toEqual(['B', 'C', 'D', 'E']);
    });
    page.fixture.debugElement
      .query(By.directive(CdkDropList))
      .triggerEventHandler('cdkDropListDropped', {
        previousIndex: 2,
        currentIndex: 4,
        item: { data: rows[2] },
      });

    await vi.waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({
      name: 'item.move',
      args: { id: rows[2].id },
    });
  });

  it('moves up into rows that share a position (re-keying them)', async () => {
    // B1 and B2 were inserted at the same spot by two offline clients.
    const [a, b1, b2, c] = [
      item('A', 'a0'),
      item('B1', 'a1'),
      item('B2', 'a1'),
      item('C', 'a2'),
    ];
    await db.items.bulkPut([a, b1, b2, c]);
    const page = await render();
    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(page.titles()).toHaveLength(4);
    });
    const order = page.titles();

    const menu = await page.loader.getHarness(
      MatMenuHarness.with({ selector: '[aria-label="More for C"]' }),
    );
    await menu.clickItem({ text: /Move up/ });

    await vi.waitFor(() => expect(requests.length).toBeGreaterThan(0));
    const keys = new Map(
      [a, b1, b2, c].map((row) => [row.id, row.position] as [string, string]),
    );
    for (const r of requests) {
      const args = r.args as { id: string; position: string };
      keys.set(args.id, args.position);
    }
    const titleOf = new Map([a, b1, b2, c].map((row) => [row.id, row.title]));
    const moved = sortByPosition(
      [...keys].map(([id, position]) => ({ id, position })),
    ).map((row) => titleOf.get(row.id));
    expect(moved).toEqual([order[0], order[1], 'C', order[2]]);
  });

  it('keeps two quick pastes in order instead of interleaving them', async () => {
    const page = await render();
    const pasteLines = (text: string) => {
      const paste = new Event('paste', { cancelable: true }) as ClipboardEvent;
      Object.defineProperty(paste, 'clipboardData', {
        value: { getData: () => text },
      });
      page.input().dispatchEvent(paste);
    };

    pasteLines('A1\nA2\nA3');
    pasteLines('B1\nB2\nB3');

    await vi.waitFor(() => expect(created()).toHaveLength(6));
    expect(created()).toEqual(['A1', 'A2', 'A3', 'B1', 'B2', 'B3']);
  });

  it('adds nothing from a paste with an invalid line, and says which', async () => {
    const page = await render();
    const paste = new Event('paste', { cancelable: true }) as ClipboardEvent;
    Object.defineProperty(paste, 'clipboardData', {
      value: { getData: () => `Tent\n${'x'.repeat(201)}\nStove` },
    });

    page.input().dispatchEvent(paste);
    await new Promise((resolve) => setTimeout(resolve));

    expect(mutate).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Nothing added: line 2 — At most 200 characters',
      }),
    );
  });

  it('names the browser tab after the list', async () => {
    await render();

    expect(TestBed.inject(Title).getTitle()).toBe('Camping · Lister');
  });

  it('says so for a list that is missing or deleted', async () => {
    const missing = await render(newId());
    expect(missing.element.textContent).toContain('List not found');
    TestBed.resetTestingModule();

    await db.lists.put({ ...camping, deletedAt: 5 });
    const deleted = await render();
    expect(deleted.element.textContent).toContain('This list was deleted');
    expect(deleted.element.querySelector('form')).toBeNull();
  });
});

describe('ListEditorPage — included lists', () => {
  const list = (title: string, extra: Partial<List> = {}): List => ({
    ...meta,
    id: newId(),
    title,
    description: '',
    ...extra,
  });
  const include = (
    parentListId: string,
    childListId: string,
    position: string,
    extra: Partial<Include> = {},
  ): Include => ({
    ...meta,
    id: newId(),
    parentListId,
    childListId,
    position,
    ...extra,
  });
  const itemOf = (listId: string, title: string, position: string) =>
    item(title, position, { listId });
  const sectionTitles = (element: HTMLElement) =>
    [...element.querySelectorAll('.section-title')].map((t) =>
      t.textContent?.trim(),
    );
  const openDialog = () =>
    TestBed.inject(MatDialog).open as unknown as ReturnType<typeof vi.fn>;

  it('shows included lists as sections among the items, with their items', async () => {
    const toiletries = list('Toiletries');
    const kitchen = list('Kitchen');
    await db.lists.bulkPut([toiletries, kitchen]);
    await db.items.bulkPut([
      item('Tent', 'a0'),
      item('Map', 'a3'),
      itemOf(toiletries.id, 'Soap', 'a0'),
      itemOf(kitchen.id, 'Stove', 'a0'),
    ]);
    await db.includes.bulkPut([
      include(camping.id, toiletries.id, 'a1'),
      include(toiletries.id, kitchen.id, 'a1'), // nested
    ]);
    const page = await render();

    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(page.titles()).toEqual(['Tent', 'Map']);
      expect(sectionTitles(page.element)).toEqual(['Toiletries']);
    });
    const rows = [...page.element.querySelectorAll('.items > li')].map((li) =>
      li.classList.contains('section') ? 'section' : 'item',
    );
    expect(rows).toEqual(['item', 'section', 'item']);
    const nested = [
      ...page.element.querySelectorAll(
        '.section-entries .title, .section-entries .nested-section',
      ),
    ].map((el) => el.textContent?.trim());
    expect(nested).toEqual(['Soap', 'Kitchen', 'Stove']);
  });

  it('tells an open edit dialog when the included list was deleted, but not when this one was', async () => {
    const toiletries = list('Toiletries');
    await db.lists.put(toiletries);
    await db.items.put(itemOf(toiletries.id, 'Soap', 'a0'));
    await db.includes.put(include(camping.id, toiletries.id, 'a1'));
    const page = await render();
    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(
        page.element.querySelector('[aria-label="Edit Soap"]'),
      ).not.toBeNull();
    });
    (
      page.element.querySelector('[aria-label="Edit Soap"]') as HTMLElement
    ).click();
    const data = openDialog().mock.calls[0][1]?.data as ItemDialogData;

    await db.lists.put({ ...camping, deletedAt: 5 });
    await vi.waitFor(() =>
      expect(page.element.textContent).toContain('This list was deleted'),
    );
    expect(data.deleted?.()).toBeUndefined(); // Soap belongs to Toiletries: still editable

    await db.lists.put({ ...camping });
    await db.lists.put({ ...toiletries, deletedAt: 6 });
    await vi.waitFor(() =>
      expect(data.deleted?.()).toBe('“Toiletries” was deleted by someone'),
    );
  });

  it('folds and unfolds a section', async () => {
    const toiletries = list('Toiletries');
    await db.lists.put(toiletries);
    await db.items.put(itemOf(toiletries.id, 'Soap', 'a0'));
    await db.includes.put(include(camping.id, toiletries.id, 'a1'));
    const page = await render();
    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(page.element.querySelector('.section-entries')).not.toBeNull();
    });
    const toggle = page.element.querySelector(
      '.section-toggle',
    ) as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    toggle.click();
    await page.fixture.whenStable();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(page.element.querySelector('.section-entries')).toBeNull();
  });

  it('shows a list in the trash as a placeholder, and a repeat as shown above', async () => {
    const gone = list('Gone', { deletedAt: 3 });
    const a = list('A');
    const shared = list('Shared');
    await db.lists.bulkPut([gone, a, shared]);
    await db.includes.bulkPut([
      include(camping.id, gone.id, 'a0'),
      include(camping.id, shared.id, 'a1'),
      include(camping.id, a.id, 'a2'),
      include(a.id, shared.id, 'a0'),
    ]);
    const page = await render();

    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(sectionTitles(page.element)).toEqual([
        'Deleted list',
        'Shared',
        'A',
      ]);
    });
    expect(page.element.textContent).toContain('This list is in the trash.');
    expect(page.element.textContent).toContain('Shared (shown above)');
  });

  it('shows a top-level repeat (its list is already inside an earlier section) as shown above', async () => {
    const hostel = list('Hostel');
    const toiletries = list('Toiletries');
    await db.lists.bulkPut([hostel, toiletries]);
    await db.items.put(itemOf(toiletries.id, 'Soap', 'a0'));
    await db.includes.bulkPut([
      include(camping.id, hostel.id, 'a0'),
      include(hostel.id, toiletries.id, 'a0'),
      include(camping.id, toiletries.id, 'a1'), // after Hostel, which already has it
    ]);
    const page = await render();

    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(sectionTitles(page.element)).toEqual(['Hostel', 'Toiletries']);
    });
    const repeat = page.element.querySelectorAll('.items > li.section')[1];
    expect(repeat.textContent).toContain(
      'Already shown above, inside another list.',
    );
    expect(repeat.textContent).not.toContain('trash');
    // Its menu still works: it can be moved or removed.
    expect(
      page.element.querySelector('[aria-label="More for list Toiletries"]'),
    ).not.toBeNull();
  });

  it('counts only lists that use an included list some other way than through this one', async () => {
    const bigTrip = list('Big trip');
    const hostel = list('Hostel');
    const toiletries = list('Toiletries');
    await db.lists.bulkPut([bigTrip, hostel, toiletries]);
    await db.includes.bulkPut([
      include(bigTrip.id, camping.id, 'a0'), // reaches Toiletries only through Camping
      include(camping.id, toiletries.id, 'a1'),
      include(hostel.id, toiletries.id, 'a0'), // a real other user
    ]);
    const page = await render();

    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(page.element.textContent).toContain('Also in 1 other list');
    });
  });

  it('offers only lists that may be added, then adds the picked one at the end', async () => {
    const a = list('A');
    const b = list('B');
    const parent = list('Parent'); // includes Camping: adding it would loop
    const trashed = list('Trashed', { deletedAt: 1 });
    const insideA = list('Inside A'); // already reached through A
    await db.lists.bulkPut([a, b, parent, trashed, insideA]);
    await db.items.put(item('Tent', 'a0'));
    await db.includes.bulkPut([
      include(camping.id, a.id, 'a1'),
      include(parent.id, camping.id, 'a0'),
      include(a.id, insideA.id, 'a0'),
    ]);
    const page = await render();
    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(sectionTitles(page.element)).toEqual(['A']);
    });
    dialogAnswer = b.id;

    (page.element.querySelector('.add-list') as HTMLButtonElement).click();

    await vi.waitFor(() => expect(requests).toHaveLength(1));
    expect(openDialog().mock.calls[0][1]).toMatchObject({
      data: { lists: [{ id: b.id, title: 'B' }] },
    });
    expect(requests[0]).toMatchObject({
      name: 'include.create',
      args: { parentListId: camping.id, childListId: b.id },
    });
    const { position } = requests[0].args as { position: string };
    expect(position > 'a1').toBe(true);
  });

  it('removes a section with Undo, and moves it among the items', async () => {
    const toiletries = list('Toiletries');
    await db.lists.put(toiletries);
    const tent = item('Tent', 'a0');
    await db.items.put(tent);
    const row = include(camping.id, toiletries.id, 'a1');
    await db.includes.put(row);
    const page = await render();
    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(sectionTitles(page.element)).toEqual(['Toiletries']);
    });
    const menu = () =>
      page.loader.getHarness(
        MatMenuHarness.with({
          selector: '[aria-label="More for list Toiletries"]',
        }),
      );

    await (await menu()).clickItem({ text: /Move up/ });
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({
      name: 'include.move',
      args: { id: row.id },
    });
    expect((requests[0].args as { position: string }).position < 'a0').toBe(
      true,
    );

    notify.mockResolvedValueOnce('action');
    await (await menu()).clickItem({ text: /Remove from this list/ });
    await vi.waitFor(() =>
      expect(requests.slice(1).map((r) => r.name)).toEqual([
        'include.delete',
        'include.restore',
      ]),
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Removed “Toiletries” from this list',
        action: 'Undo',
      }),
    );
  });

  it('edits an item of an included list, saying which list it changes and who else uses it', async () => {
    const toiletries = list('Toiletries');
    const hostel = list('Hostel');
    const beach = list('Beach');
    await db.lists.bulkPut([toiletries, hostel, beach]);
    const soap = itemOf(toiletries.id, 'Soap', 'a0');
    await db.items.put(soap);
    await db.includes.bulkPut([
      include(camping.id, toiletries.id, 'a1'),
      include(hostel.id, toiletries.id, 'a0'),
      include(beach.id, hostel.id, 'a0'), // uses Toiletries through Hostel
    ]);
    const page = await render();
    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(page.element.textContent).toContain('Also in 2 other lists');
    });
    dialogAnswer = { title: 'Olive soap' };

    (
      page.element.querySelector(
        '[aria-label="Edit Soap"]',
      ) as HTMLButtonElement
    ).click();

    await vi.waitFor(() => expect(requests).toHaveLength(1));
    expect(openDialog().mock.calls[0][1]).toMatchObject({
      data: {
        title: 'Soap',
        notice: 'Changes “Toiletries”, also used in 2 other lists',
      },
    });
    expect(requests[0]).toMatchObject({
      name: 'item.update',
      args: { id: soap.id, patch: { title: 'Olive soap' } },
    });
  });

  it('adds new items after the sections', async () => {
    const toiletries = list('Toiletries');
    await db.lists.put(toiletries);
    await db.includes.put(include(camping.id, toiletries.id, 'a5'));
    const page = await render();
    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(sectionTitles(page.element)).toEqual(['Toiletries']);
    });

    await page.type('Lamp');
    await page.submit();

    await vi.waitFor(() => expect(requests).toHaveLength(1));
    expect((requests[0].args as { position: string }).position > 'a5').toBe(
      true,
    );
  });
});
