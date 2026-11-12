import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { CdkDropList } from '@angular/cdk/drag-drop';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuHarness } from '@angular/material/menu/testing';
import {
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
    expect(element.textContent).not.toContain('Loading');
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
