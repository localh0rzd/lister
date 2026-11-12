import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
import { ListsPage } from './lists-page';

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
