import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import {
  type Item,
  type List,
  type Run,
  type RunItem,
  newId,
} from '@lister/shared/domain';
import { LOCAL_DB, LocalDb } from '@lister/web/data-access-local-db';
import { type MutationRequest, SyncEngine } from '@lister/web/data-access-sync';
import { Notifier } from '@lister/web/util-notify';
import { of } from 'rxjs';
import { DoneSectionPreference } from './done-section-preference';
import { RunPage } from './run-page';

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
const basics: List = { ...meta, id: newId(), title: 'Basics', description: '' };
const alps: Run = {
  ...meta,
  id: newId(),
  title: 'Alps',
  sourceListId: camping.id,
  finishedAt: null,
};
const runItem = (
  title: string,
  position: string,
  extra: Partial<RunItem> = {},
): RunItem => ({
  ...meta,
  id: newId(),
  runId: alps.id,
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

let db: LocalDb;
let requests: MutationRequest[];
let notify: ReturnType<typeof vi.fn>;
let dialogAnswer: unknown;
/** Set to make the engine refuse every change. */
let refuse: boolean;

beforeEach(async () => {
  db = new LocalDb(`test-${newId()}`);
  await db.spaces.put({ id: SPACE, name: 'Home', version: 1, members: [] });
  await db.lists.bulkPut([camping, basics]);
  await db.runs.put(alps);
  requests = [];
  notify = vi.fn(async () => 'dismissed');
  dialogAnswer = undefined;
  refuse = false;
});
afterEach(async () => {
  TestBed.resetTestingModule();
  await db.delete();
});

async function render(doneSection = false) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: LOCAL_DB, useValue: db },
      {
        provide: SyncEngine,
        useValue: {
          mutate: vi.fn(async (request: MutationRequest) => {
            requests.push(request);
            return refuse ? { ok: false, reason: 'Nope' } : { ok: true };
          }),
        },
      },
      { provide: Notifier, useValue: { notify } },
      {
        provide: MatDialog,
        useValue: {
          open: vi.fn(() => ({ afterClosed: () => of(dialogAnswer) })),
        },
      },
    ],
  });
  TestBed.inject(DoneSectionPreference).on.set(doneSection);
  const navigate = vi
    .spyOn(TestBed.inject(Router), 'navigate')
    .mockResolvedValue(true);
  const fixture = TestBed.createComponent(RunPage);
  fixture.componentRef.setInput('runId', alps.id);
  const element = fixture.nativeElement as HTMLElement;
  const settle = async (check: () => void) =>
    vi.waitFor(async () => {
      await fixture.whenStable();
      check();
    });
  await settle(() =>
    expect(element.querySelector('lister-loading-hint')).toBeNull(),
  );
  const sections = () =>
    [...element.querySelectorAll('section')].map((section) => ({
      title: section.querySelector('h2')?.textContent?.trim() ?? null,
      items: [...section.querySelectorAll('.item .title')].map((t) =>
        t.textContent?.trim(),
      ),
    }));
  const checkbox = (title: string) =>
    [...element.querySelectorAll<HTMLElement>('.item')]
      .find((row) => row.querySelector('.title')?.textContent?.trim() === title)
      ?.querySelector('input[type="checkbox"]') as HTMLInputElement;
  return { fixture, element, settle, sections, checkbox, navigate };
}

/** "Add list", once the space's lists have loaded (it's disabled until then). */
async function clickAddList(page: Awaited<ReturnType<typeof render>>) {
  const button = () =>
    [...page.element.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Add list'),
    ) as HTMLButtonElement;
  await page.settle(() => expect(button().disabled).toBe(false));
  button().click();
}

describe('RunPage', () => {
  it('groups items by the list they came from, says where merged items also come from, and shows progress', async () => {
    await db.runItems.bulkPut([
      runItem('Tent', 'a0', { sources: [camping.id], state: 'checked' }),
      runItem('Headlamp', 'a1', { sources: [camping.id, basics.id] }),
      runItem('Socks', 'a2', { sources: [basics.id], state: 'skipped' }),
      runItem('Milk', 'a3'),
      runItem('Gone', 'a4', { deletedAt: 1 }),
    ]);
    const page = await render();

    await page.settle(() =>
      expect(page.sections()).toEqual([
        { title: 'Camping', items: ['Tent', 'Headlamp'] },
        { title: 'Basics', items: ['Socks'] },
        { title: 'Added to this run', items: ['Milk'] },
      ]),
    );
    expect(page.element.textContent).toContain('Also from Basics');
    expect(page.element.textContent).toContain('2 of 4 done');
    expect(
      page.element.querySelector('.checked .title')?.textContent,
    ).toContain('Tent');
    expect(page.element.querySelector('.skipped')?.textContent).toContain(
      'Skipped',
    );
  });

  it('moves checked and skipped items into "Done" while the toggle is on', async () => {
    await db.runItems.bulkPut([
      runItem('Tent', 'a0', { state: 'checked' }),
      runItem('Stove', 'a1'),
    ]);
    const page = await render(true);
    await page.settle(() =>
      expect(page.sections()).toEqual([
        { title: null, items: ['Stove'] },
        { title: 'Done', items: ['Tent'] },
      ]),
    );
  });

  it('checks and unchecks an item by setting its state', async () => {
    const tent = runItem('Tent', 'a0');
    const stove = runItem('Stove', 'a1', { state: 'checked' });
    await db.runItems.bulkPut([tent, stove]);
    const page = await render();
    await page.settle(() => expect(page.checkbox('Tent')).toBeTruthy());

    page.checkbox('Tent').click();
    page.checkbox('Stove').click();
    await page.fixture.whenStable();

    await page.settle(() =>
      expect(requests).toEqual([
        {
          spaceId: SPACE,
          name: 'runItem.setState',
          args: { id: tent.id, state: 'checked' },
        },
        {
          spaceId: SPACE,
          name: 'runItem.setState',
          args: { id: stove.id, state: 'unchecked' },
        },
      ]),
    );
  });

  it('adds typed and pasted items to this run only, as one change each', async () => {
    const page = await render();
    const input = page.element.querySelector(
      'input:not([type])',
    ) as HTMLInputElement;
    input.value = 'Milk';
    input.dispatchEvent(new Event('input'));
    await page.fixture.whenStable();
    page.element.querySelector('form')?.dispatchEvent(new Event('submit'));
    const paste = new Event('paste', { cancelable: true }) as ClipboardEvent;
    Object.defineProperty(paste, 'clipboardData', {
      value: { getData: () => 'Bread\nEggs' },
    });
    input.dispatchEvent(paste);

    await page.settle(() => expect(requests).toHaveLength(2));
    const titles = requests.map((r) =>
      r.name === 'run.addItems' ? r.args.items.map((i) => i.title) : [],
    );
    expect(titles).toEqual([['Milk'], ['Bread', 'Eggs']]);
    expect(
      requests.every(
        (r) => r.name === 'run.addItems' && r.args.runId === alps.id,
      ),
    ).toBe(true);
  });

  it('adds a whole list, its included lists too, as a new section', async () => {
    const stove: Item = {
      ...meta,
      id: newId(),
      listId: basics.id,
      title: 'Stove',
      quantity: '2',
      note: '',
      position: 'a0',
    };
    await db.items.put(stove);
    const page = await render();
    dialogAnswer = basics.id;
    await clickAddList(page);

    await page.settle(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({
      name: 'run.addItems',
      args: {
        runId: alps.id,
        items: [{ title: 'Stove', quantity: '2', sources: [basics.id] }],
      },
    });
  });

  it('says so when the added list has no items, and changes nothing', async () => {
    const page = await render();
    dialogAnswer = camping.id;
    await clickAddList(page);
    await page.settle(() =>
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ message: '“Camping” has no items' }),
      ),
    );
    expect(requests).toEqual([]);
  });

  it('knows the last of two quick checks finishes the run, before the data shows the first', async () => {
    const tent = runItem('Tent', 'a0');
    const stove = runItem('Stove', 'a1');
    await db.runItems.bulkPut([tent, stove]);
    const page = await render();
    await page.settle(() => expect(page.checkbox('Stove')).toBeTruthy());

    // The fake engine never writes to the local database: it never shows the first check.
    page.checkbox('Tent').click();
    page.checkbox('Stove').click();

    await page.settle(() =>
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Finished “Alps”', action: 'Undo' }),
      ),
    );
  });

  it('does not count a check made here once someone else has undone it', async () => {
    const tent = runItem('Tent', 'a0');
    const stove = runItem('Stove', 'a1');
    await db.runItems.bulkPut([tent, stove]);
    const page = await render();
    await page.settle(() => expect(page.checkbox('Stove')).toBeTruthy());

    page.checkbox('Tent').click();
    await page.settle(() => expect(requests).toHaveLength(1));
    // The local data shows the check, then someone else unchecks Tent again.
    await db.runItems.put({ ...tent, state: 'checked' });
    await page.settle(() => expect(page.checkbox('Tent').checked).toBe(true));
    await db.runItems.put({ ...tent, state: 'unchecked' });
    await page.settle(() => expect(page.checkbox('Tent').checked).toBe(false));
    page.checkbox('Stove').click();

    await page.settle(() => expect(requests).toHaveLength(2));
    expect(requests[1].args).toEqual({ id: stove.id, state: 'checked' });
    expect(notify).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Finished “Alps”' }),
    );
  });

  it('still says the run is finished elsewhere after its own finishing check was refused', async () => {
    const tent = runItem('Tent', 'a0');
    await db.runItems.put(tent);
    refuse = true;
    const page = await render();
    await page.settle(() => expect(page.checkbox('Tent')).toBeTruthy());

    page.checkbox('Tent').click();
    await page.settle(() => expect(requests).toHaveLength(1));
    await db.runs.put({ ...alps, finishedAt: 5 });

    await page.settle(() =>
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ message: '“Alps” is finished' }),
      ),
    );
  });

  it('offers Undo when the last check finishes the run, and Undo reverts that check', async () => {
    const tent = runItem('Tent', 'a0', { state: 'checked' });
    const stove = runItem('Stove', 'a1');
    await db.runItems.bulkPut([tent, stove]);
    notify.mockResolvedValue('action');
    const page = await render();
    await page.settle(() => expect(page.checkbox('Stove')).toBeTruthy());

    page.checkbox('Stove').click();

    await page.settle(() => expect(requests).toHaveLength(2));
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Finished “Alps”', action: 'Undo' }),
    );
    expect(requests.map((r) => r.args)).toEqual([
      { id: stove.id, state: 'checked' },
      { id: stove.id, state: 'unchecked' },
    ]);
  });

  it('goes back to the Runs page once the run is finished, also by someone else', async () => {
    await db.runItems.put(runItem('Tent', 'a0'));
    const page = await render();
    await db.runs.put({ ...alps, finishedAt: 5 });

    await page.settle(() =>
      expect(page.navigate).toHaveBeenCalledWith(['/runs']),
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: '“Alps” is finished' }),
    );
  });

  it('removes an item with Undo', async () => {
    const tent = runItem('Tent', 'a0');
    await db.runItems.bulkPut([tent, runItem('Stove', 'a1')]);
    notify.mockResolvedValue('action');
    const page = await render();
    (
      page.fixture.componentInstance as unknown as {
        remove(item: RunItem): Promise<void>;
      }
    ).remove(tent);

    await page.settle(() => expect(requests).toHaveLength(2));
    expect(requests.map((r) => r.name)).toEqual([
      'runItem.remove',
      'runItem.restore',
    ]);
  });

  it('skips an item and takes the skip back, by setting its state', async () => {
    const tent = runItem('Tent', 'a0');
    const stove = runItem('Stove', 'a1', { state: 'skipped' });
    await db.runItems.bulkPut([tent, stove, runItem('Milk', 'a2')]);
    const page = await render();
    const component = page.fixture.componentInstance as unknown as {
      setState(item: RunItem, state: string): Promise<void>;
    };
    await component.setState(tent, 'skipped');
    await component.setState(stove, 'unchecked');

    expect(requests.map((r) => [r.name, r.args])).toEqual([
      ['runItem.setState', { id: tent.id, state: 'skipped' }],
      ['runItem.setState', { id: stove.id, state: 'unchecked' }],
    ]);
  });

  it('edits an item of this run only, and says so for an item from a list', async () => {
    const tent = runItem('Tent', 'a0', { sources: [camping.id] });
    await db.runItems.put(tent);
    const page = await render();
    dialogAnswer = { title: 'Big tent', quantity: '1' };
    await (
      page.fixture.componentInstance as unknown as {
        edit(item: RunItem): Promise<void>;
      }
    ).edit(tent);

    expect(TestBed.inject(MatDialog).open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: expect.objectContaining({ notice: 'Changes this run only' }),
      }),
    );
    expect(requests).toEqual([
      {
        spaceId: SPACE,
        name: 'runItem.update',
        args: { id: tent.id, patch: { title: 'Big tent', quantity: '1' } },
      },
    ]);
  });

  it('renames the run', async () => {
    const page = await render();
    dialogAnswer = 'Dolomites';
    await (
      page.fixture.componentInstance as unknown as { rename(): Promise<void> }
    ).rename();

    expect(requests).toEqual([
      {
        spaceId: SPACE,
        name: 'run.update',
        args: { id: alps.id, patch: { title: 'Dolomites' } },
      },
    ]);
  });

  it('adds nothing from a paste with a line over 200 characters, and says which line', async () => {
    const page = await render();
    const input = page.element.querySelector(
      'input:not([type])',
    ) as HTMLInputElement;
    const paste = new Event('paste', { cancelable: true }) as ClipboardEvent;
    Object.defineProperty(paste, 'clipboardData', {
      value: { getData: () => `Bread\n${'x'.repeat(201)}` },
    });
    input.dispatchEvent(paste);

    await page.settle(() =>
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/^Nothing added: line 2 — /),
        }),
      ),
    );
    expect(requests).toEqual([]);
  });

  it('says the run is finished when removing its last unchecked item, and goes back without a second notice', async () => {
    const tent = runItem('Tent', 'a0');
    await db.runItems.bulkPut([
      tent,
      runItem('Stove', 'a1', { state: 'checked' }),
    ]);
    const page = await render();
    await (
      page.fixture.componentInstance as unknown as {
        remove(item: RunItem): Promise<void>;
      }
    ).remove(tent);
    expect(requests.map((r) => r.name)).toEqual(['runItem.remove']);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Removed “Tent”: “Alps” is finished',
        action: 'Undo',
      }),
    );
    await db.runs.put({ ...alps, finishedAt: 5 });

    await page.settle(() =>
      expect(page.navigate).toHaveBeenCalledWith(['/runs']),
    );
    expect(notify).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: '“Alps” is finished' }),
    );
  });

  it('shows no progress or Done toggle while the run has no items', async () => {
    const page = await render();
    expect(page.element.querySelector('mat-progress-bar')).toBeNull();
    expect(page.element.querySelector('mat-slide-toggle')).toBeNull();
    expect(page.element.textContent).toContain('No items yet. Type them below');
  });

  it('says when the run does not exist here', async () => {
    await db.runs.delete(alps.id);
    const page = await render();
    expect(page.element.querySelector('h1')?.textContent).toBe('Run not found');
  });
});
