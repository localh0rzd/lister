import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatAutocompleteHarness } from '@angular/material/autocomplete/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuHarness } from '@angular/material/menu/testing';
import {
  type Item,
  type List,
  type Run,
  type RunItem,
  newId,
} from '@lister/shared/domain';
import { LOCAL_DB, LocalDb } from '@lister/web/data-access-local-db';
import { type MutationRequest, SyncEngine } from '@lister/web/data-access-sync';
import { Transfers } from '@lister/web/feature-transfer';
import { Notifier } from '@lister/web/util-notify';
import { Observable, Subject, of } from 'rxjs';
import type { ItemDialogData } from '@lister/web/ui';
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
  colour: null,
  icon: null,
};
const basics: List = {
  ...meta,
  id: newId(),
  title: 'Basics',
  description: '',
  colour: null,
  icon: null,
};
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

/** The open suggestion list (it lives in the overlay, outside the fixture). */
const suggestions = () =>
  [...document.querySelectorAll('mat-option')].map((o) =>
    o.textContent?.trim(),
  );
const chooseSuggestion = (title: string) =>
  (
    [...document.querySelectorAll('mat-option')].find(
      (o) => o.textContent?.trim() === title,
    ) as HTMLElement
  ).click();

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
          open: vi.fn(() => ({
            afterClosed: () =>
              dialogAnswer instanceof Observable
                ? dialogAnswer
                : of(dialogAnswer),
          })),
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
  it('suggests item titles from the lists, not those already in the run, and adds a chosen one', async () => {
    await db.items.bulkPut([
      {
        ...meta,
        id: newId(),
        listId: camping.id,
        title: 'Stove',
        quantity: '2',
        note: 'gas',
        position: 'a0',
      },
      {
        ...meta,
        id: newId(),
        listId: basics.id,
        title: 'Stool',
        quantity: '',
        note: '',
        position: 'a0',
      },
    ]);
    await db.runItems.put(runItem('stool', 'a0'));
    const page = await render();
    const autocomplete = await TestbedHarnessEnvironment.loader(
      page.fixture,
    ).getHarness(MatAutocompleteHarness);

    await autocomplete.enterText('st');
    await vi.waitFor(() => expect(suggestions()).toEqual(['Stove']));
    chooseSuggestion('Stove');

    await page.settle(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({
      name: 'run.addItems',
      args: {
        runId: alps.id,
        items: [{ title: 'Stove', quantity: '', note: '' }],
      },
    });
  });

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

  it('prints every item with its check state, grouped as on the page, even with "Done" on', async () => {
    await db.runItems.bulkPut([
      runItem('Tent', 'a0', { sources: [camping.id], state: 'checked' }),
      runItem('Socks', 'a1', { sources: [basics.id], state: 'skipped' }),
      runItem('Milk', 'a2'),
    ]);
    const page = await render(true);
    const print = vi
      .spyOn(TestBed.inject(Transfers), 'print')
      .mockImplementation(() => undefined);
    const sheet = page.element.querySelector(
      'lister-print-sheet',
    ) as HTMLElement;
    // The section titles come from the space's lists, which are read a moment after the items.
    await page.settle(() => {
      const lines = [...sheet.querySelectorAll('h2, li')].map((el) =>
        el.tagName === 'H2' ? `# ${el.textContent}` : el.textContent?.trim(),
      );
      expect(lines).toEqual([
        '# Camping',
        '☑Tent',
        '# Basics',
        '⊘Socks(skipped)',
        '# Added to this run',
        '☐Milk',
      ]);
    });

    const menu = await TestbedHarnessEnvironment.loader(
      page.fixture,
    ).getHarness(
      MatMenuHarness.with({ selector: '[aria-label="More for this run"]' }),
    );
    await menu.clickItem({ text: /Print/ });
    expect(print).toHaveBeenCalledTimes(1);
  });

  it("shows the source list's colour and icon beside the title (D26)", async () => {
    await db.lists.put({ ...camping, colour: 'teal', icon: 'camping' });
    const page = await render();

    await page.settle(() => {
      const avatar = page.element.querySelector('.header lister-list-avatar');
      expect(avatar?.getAttribute('data-colour')).toBe('teal');
      expect(avatar?.textContent?.trim()).toBe('camping');
    });
  });

  it('shows who checked or skipped an item and when', async () => {
    await db.spaces.put({
      id: SPACE,
      name: 'Home',
      version: 1,
      members: [{ userId: 'anna', displayName: 'Anna' }],
    });
    const at = Date.now();
    await db.runItems.bulkPut([
      runItem('Tent', 'a0', { state: 'checked', stateBy: 'anna', stateAt: at }),
      runItem('Socks', 'a1', {
        state: 'skipped',
        stateBy: 'gone',
        stateAt: at,
      }),
      runItem('Milk', 'a2'),
    ]);
    const page = await render();
    await page.settle(() =>
      expect(
        [...page.element.querySelectorAll('.checked-by')].map((e) =>
          e.textContent?.replace(/\d\d?[:.]\d\d.*$/, '').trim(),
        ),
      ).toEqual(['Anna ·', 'Skipped · Someone ·']),
    );
  });

  it("names people from the run's own space, also while another space is current", async () => {
    // "Attic" sorts first, so it is the current space; the run belongs to "Home".
    await db.spaces.bulkPut([
      { id: newId(), name: 'Attic', version: 1, members: [] },
      {
        id: SPACE,
        name: 'Home',
        version: 1,
        members: [{ userId: 'anna', displayName: 'Anna' }],
      },
    ]);
    await db.runItems.bulkPut([
      runItem('Tent', 'a0', {
        state: 'checked',
        stateBy: 'anna',
        stateAt: Date.now(),
      }),
    ]);
    const page = await render();
    await page.settle(() =>
      expect(page.element.querySelector('.checked-by')?.textContent).toMatch(
        /^Anna · /,
      ),
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

  it('adds a typed item once when Enter is pressed again while it is being added', async () => {
    const page = await render();
    const input = page.element.querySelector(
      'input:not([type])',
    ) as HTMLInputElement;
    input.value = 'Milk';
    input.dispatchEvent(new Event('input'));
    await page.fixture.whenStable();
    const form = page.element.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));
    form.dispatchEvent(new Event('submit'));

    await page.settle(() => expect(input.value).toBe(''));
    expect(requests).toHaveLength(1);
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

  it('keeps a check made here checked until the data shows it', async () => {
    const tent = runItem('Tent', 'a0');
    const stove = runItem('Stove', 'a1');
    await db.runItems.bulkPut([tent, stove]);
    const page = await render();
    await page.settle(() => expect(page.checkbox('Tent')).toBeTruthy());

    // The fake engine never writes to the local database: the data never shows the check.
    page.checkbox('Tent').click();
    await page.settle(() => expect(requests).toHaveLength(1));
    // A later visible change proves the page has re-read the data since the check was sent.
    await db.runItems.put({ ...stove, note: 'Gas' });
    await page.settle(() => expect(page.element.textContent).toContain('Gas'));

    expect(page.checkbox('Tent').checked).toBe(true);
  });

  it('keeps an uncheck made here when the server copy of the earlier check arrives first', async () => {
    const tent = runItem('Tent', 'a0', { state: 'checked', stateAt: 5 });
    const stove = runItem('Stove', 'a1');
    await db.runItems.bulkPut([tent, stove]);
    const page = await render();
    await page.settle(() => expect(page.checkbox('Tent').checked).toBe(true));
    // The uncheck isn't written yet when the server's copy of the check arrives.
    let write!: () => void;
    vi.mocked(TestBed.inject(SyncEngine).mutate).mockImplementationOnce(
      async (request) => {
        requests.push(request);
        await new Promise<void>((resolve) => (write = resolve));
        return { ok: true };
      },
    );

    page.checkbox('Tent').click();
    await page.settle(() => expect(requests).toHaveLength(1));
    // The server's copy: same state, its own time.
    await db.runItems.put({ ...tent, stateAt: 6, note: 'Ack' });
    await page.settle(() => expect(page.element.textContent).toContain('Ack'));
    expect(page.checkbox('Tent').checked).toBe(false);

    write();
    await db.runItems.put({ ...tent, state: 'unchecked', stateAt: 7 });
    await page.settle(() => {
      expect(page.element.textContent).toContain('0 of 2 done');
      expect(page.checkbox('Tent').checked).toBe(false);
    });
  });

  it('puts the checkbox back to what the data says when the change is refused', async () => {
    const tent = runItem('Tent', 'a0');
    const stove = runItem('Stove', 'a1');
    await db.runItems.bulkPut([tent, stove]);
    refuse = true;
    const page = await render();
    await page.settle(() => expect(page.checkbox('Tent')).toBeTruthy());

    page.checkbox('Tent').click();

    await page.settle(() => {
      expect(requests).toHaveLength(1);
      expect(page.checkbox('Tent').checked).toBe(false);
    });
    expect(page.element.textContent).toContain('0 of 2 done');
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
    // Wait for the page to show the local data (the clicked checkbox is checked by itself, so
    // its own state proves nothing), or the two puts could merge into no change at all.
    await page.settle(() =>
      expect(page.element.textContent).toContain('1 of 2 done'),
    );
    await db.runItems.put({ ...tent, state: 'unchecked' });
    await page.settle(() => {
      expect(page.element.textContent).toContain('0 of 2 done');
      expect(page.checkbox('Tent').checked).toBe(false);
    });
    page.checkbox('Stove').click();

    await page.settle(() => expect(requests).toHaveLength(2));
    expect(requests[1].args).toEqual({ id: stove.id, state: 'checked' });
    expect(notify).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Finished “Alps”' }),
    );
  });

  it('does not count a check made here that someone else undid before the page showed it', async () => {
    const tent = runItem('Tent', 'a0');
    const stove = runItem('Stove', 'a1');
    await db.runItems.bulkPut([tent, stove]);
    const page = await render();
    await page.settle(() => expect(page.checkbox('Stove')).toBeTruthy());

    page.checkbox('Tent').click();
    await page.settle(() => expect(requests).toHaveLength(1));
    // The local data's next change is already someone else's uncheck: it never shows "checked".
    await db.runItems.put({ ...tent, stateBy: 'ben', stateAt: 9 });
    // A later visible change proves the page has the data with that uncheck.
    await db.runItems.put({ ...stove, note: 'Gas' });
    await page.settle(() => {
      expect(page.element.textContent).toContain('Gas');
      expect(page.checkbox('Tent').checked).toBe(false);
    });
    page.checkbox('Stove').click();

    await page.settle(() => expect(requests).toHaveLength(2));
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
        data: expect.objectContaining({
          notice: 'Changes this run only',
          editedBy: expect.stringMatching(/^Someone · /),
        }),
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

  it('tells an open edit dialog who removed the item, restores it, and forgets it once closed', async () => {
    const tent = runItem('Tent', 'a0');
    const lamp = runItem('Lamp', 'a1');
    await db.runItems.bulkPut([tent, lamp]);
    await db.spaces.put({
      id: SPACE,
      name: 'Home',
      version: 1,
      members: [{ userId: 'ben', displayName: 'Ben' }],
    });
    await db.meta.put({ key: 'userId', value: 'me' });
    const page = await render();
    const closed = new Subject<undefined>();
    dialogAnswer = closed;
    const editing = (
      page.fixture.componentInstance as unknown as {
        edit(item: RunItem): Promise<void>;
      }
    ).edit(tent);
    const data = vi.mocked(TestBed.inject(MatDialog).open).mock.calls[0][1]
      ?.data as ItemDialogData;
    await page.settle(() => expect(data.deleted?.()).toBeUndefined());

    await db.runItems.put({ ...lamp, deletedAt: 4, updatedBy: 'ben' }); // another item
    await db.runItems.put({ ...tent, deletedAt: 5, updatedBy: 'ben' });
    await page.settle(() => expect(data.deleted?.()).toBe('Removed by Ben'));
    await db.runItems.put({ ...tent, deletedAt: 5, updatedBy: 'me' });
    await page.settle(() => expect(data.deleted?.()).toBe('Removed by you'));
    // Merged into an identical item (D16): its changes still apply there.
    await db.runItems.put({ ...tent, deletedAt: 5, mergedInto: lamp.id });
    await page.settle(() => expect(data.deleted?.()).toBeUndefined());

    await data.restore?.();
    expect(requests).toEqual([
      expect.objectContaining({
        name: 'runItem.restore',
        args: { id: tent.id },
      }),
    ]);
    closed.next(undefined);
    closed.complete();
    await editing;
    expect(data.deleted?.()).toBeUndefined();
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

  it('saves the run as a new list, its items in the order shown, ignoring the Done toggle, and opens it on request', async () => {
    // Grouped as shown: Camping's section first, then the typed item after it.
    const tent = runItem('Tent', 'a0', { sources: [camping.id] });
    const typed = runItem('Milk', 'a1', { state: 'checked' });
    const stove = runItem('Stove', 'a2', {
      sources: [camping.id],
      state: 'skipped',
    });
    await db.runItems.bulkPut([typed, tent, stove]);
    notify.mockResolvedValue('action');
    const page = await render(true);
    await page.settle(() => expect(page.checkbox('Tent')).toBeTruthy());
    dialogAnswer = 'Alps gear';
    const shown = page.sections().filter((section) => section.title !== 'Done');
    expect(shown.flatMap((section) => section.items)).toEqual(['Tent']);

    await (
      page.fixture.componentInstance as unknown as {
        saveAsList(): Promise<void>;
      }
    ).saveAsList();

    expect(requests).toHaveLength(1);
    const request = requests[0] as {
      name: string;
      args: {
        runId: string;
        listId: string;
        title: string;
        items: { from: string }[];
      };
    };
    expect(request.name).toBe('run.saveAsList');
    expect(request.args).toMatchObject({ runId: alps.id, title: 'Alps gear' });
    // As shown with the toggle off: by section, checked and skipped items included.
    expect(request.args.items.map((i) => i.from)).toEqual(
      [tent, stove, typed].map((i) => i.id),
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Saved “Alps gear” as a list',
        action: 'Open',
      }),
    );
    expect(page.navigate).toHaveBeenCalledWith(['/lists', request.args.listId]);
  });

  it('saves the run as it is when the dialog closes, with items added meanwhile', async () => {
    const tent = runItem('Tent', 'a0');
    await db.runItems.put(tent);
    const page = await render();
    await page.settle(() => expect(page.checkbox('Tent')).toBeTruthy());
    const closed = new Subject<string>();
    dialogAnswer = closed;

    const saving = (
      page.fixture.componentInstance as unknown as {
        saveAsList(): Promise<void>;
      }
    ).saveAsList();
    // Someone else adds an item while the title is being typed.
    const stove = runItem('Stove', 'a1');
    await db.runItems.put(stove);
    await page.settle(() => expect(page.checkbox('Stove')).toBeTruthy());
    closed.next('Gear');
    closed.complete();
    await saving;

    const request = requests[0] as { args: { items: { from: string }[] } };
    expect(request.args.items.map((i) => i.from)).toEqual([tent.id, stove.id]);
  });

  it('saves nothing when the dialog is cancelled, and stays when the save is refused', async () => {
    await db.runItems.put(runItem('Tent', 'a0'));
    const page = await render();
    const save = () =>
      (
        page.fixture.componentInstance as unknown as {
          saveAsList(): Promise<void>;
        }
      ).saveAsList();

    await save();
    expect(requests).toEqual([]);

    dialogAnswer = 'Gear';
    refuse = true;
    await save();
    expect(requests).toHaveLength(1);
    expect(notify).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'Open' }),
    );
    expect(page.navigate).not.toHaveBeenCalled();
  });

  it('offers "Save as list" only in the run menu, never as a suggestion when a run finishes', async () => {
    const tent = runItem('Tent', 'a0');
    await db.runItems.put(tent);
    const page = await render();
    await page.settle(() => expect(page.checkbox('Tent')).toBeTruthy());
    expect(page.element.textContent).not.toContain('Save as list');

    page.checkbox('Tent').click();

    await page.settle(() => expect(notify).toHaveBeenCalled());
    for (const [notice] of notify.mock.calls)
      expect(JSON.stringify(notice)).not.toMatch(/list/i);
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

describe('RunPage — Sort A–Z (D17)', () => {
  beforeEach(() => localStorage.clear());

  it('sorts within each section with one change, and Undo sends the old positions back', async () => {
    const [z, a] = [
      runItem('Zinc', 'a0', { sources: [camping.id] }),
      runItem('Axe', 'a1', { sources: [camping.id] }),
    ];
    const [soap, bag] = [
      runItem('Soap', 'a2', { sources: [basics.id] }),
      runItem('Bag', 'a3', { sources: [basics.id] }),
    ];
    await db.runItems.bulkPut([z, a, soap, bag]);
    const page = await render();
    await page.settle(() =>
      expect(page.sections().map((s) => s.items)).toEqual([
        ['Zinc', 'Axe'],
        ['Soap', 'Bag'],
      ]),
    );
    notify.mockResolvedValueOnce('action');

    const menu = await TestbedHarnessEnvironment.loader(
      page.fixture,
    ).getHarness(
      MatMenuHarness.with({ selector: '[aria-label="More for this run"]' }),
    );
    await menu.clickItem({ text: /Sort A–Z/ });

    await vi.waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[0]).toMatchObject({
      name: 'run.sortItems',
      args: {
        runId: alps.id,
        items: [
          { id: a.id, position: 'a0' },
          { id: z.id, position: 'a1' },
          { id: bag.id, position: 'a2' },
          { id: soap.id, position: 'a3' },
        ],
      },
    });
    expect(requests[1]).toMatchObject({
      name: 'run.sortItems',
      args: {
        runId: alps.id,
        items: [
          { id: a.id, position: 'a1' },
          { id: z.id, position: 'a0' },
          { id: bag.id, position: 'a3' },
          { id: soap.id, position: 'a2' },
        ],
      },
    });
  });

  it('gives a section tied at its first slot keys between its neighbours in the run, never another section’s keys', async () => {
    const listed = [
      runItem('Tent', 'a0', { sources: [camping.id] }),
      runItem('Stove', 'a1', { sources: [camping.id] }),
    ];
    // Two devices sorted these in at the same spot: they share a key.
    const typed = [runItem('Zip', 'a2'), runItem('Map', 'a2')];
    await db.runItems.bulkPut([...listed, ...typed]);
    const page = await render();
    await page.settle(() => expect(page.sections()).toHaveLength(2));

    const menu = await TestbedHarnessEnvironment.loader(
      page.fixture,
    ).getHarness(
      MatMenuHarness.with({ selector: '[aria-label="More for this run"]' }),
    );
    await menu.clickItem({ text: /Sort A–Z/ });

    await vi.waitFor(() => expect(requests).toHaveLength(1));
    const request = requests[0];
    if (request.name !== 'run.sortItems') throw new Error(request.name);
    const keyOf = new Map(request.args.items.map((i) => [i.id, i.position]));
    const zip = keyOf.get(typed[0].id) ?? 'a2';
    const map = keyOf.get(typed[1].id) ?? 'a2';
    // Map before Zip, both after every listed item, so the sections keep their order.
    expect(map < zip).toBe(true);
    expect(map > 'a1').toBe(true);
  });

  it('says so, and changes nothing, when every section is sorted', async () => {
    await db.runItems.bulkPut([runItem('A', 'a0'), runItem('B', 'a1')]);
    const page = await render();
    await page.settle(() =>
      expect(page.sections()[0].items).toEqual(['A', 'B']),
    );

    const menu = await TestbedHarnessEnvironment.loader(
      page.fixture,
    ).getHarness(
      MatMenuHarness.with({ selector: '[aria-label="More for this run"]' }),
    );
    await menu.clickItem({ text: /Sort A–Z/ });

    await vi.waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Already in A–Z order' }),
      ),
    );
    expect(requests).toEqual([]);
  });

  it('sends no position for typed items while "Add at end" is chosen', async () => {
    await db.runItems.bulkPut([runItem('B', 'a0')]);
    const page = await render();
    await page.settle(() => expect(page.sections()[0].items).toEqual(['B']));

    const input = page.element.querySelector(
      'input:not([type])',
    ) as HTMLInputElement;
    input.value = 'A';
    input.dispatchEvent(new Event('input'));
    await page.fixture.whenStable();
    page.element.querySelector('form')?.dispatchEvent(new Event('submit'));

    await vi.waitFor(() => expect(requests).toHaveLength(1));
    expect(
      requests[0].name === 'run.addItems' && requests[0].args.items[0].position,
    ).toBeUndefined();
  });

  it('with "Sort in", places typed items among the typed ones, not the listed ones', async () => {
    localStorage.setItem('lister.addItemOrder', 'sorted');
    await db.runItems.bulkPut([
      runItem('Zinc', 'a0', { sources: [camping.id] }),
      runItem('Bread', 'a1'),
      runItem('Eggs', 'a2'),
    ]);
    const page = await render();
    await page.settle(() => expect(page.sections()).toHaveLength(2));

    const input = page.element.querySelector(
      'input:not([type])',
    ) as HTMLInputElement;
    input.value = 'Cheese';
    input.dispatchEvent(new Event('input'));
    await page.fixture.whenStable();
    page.element.querySelector('form')?.dispatchEvent(new Event('submit'));

    await vi.waitFor(() => expect(requests).toHaveLength(1));
    const request = requests[0];
    const position =
      request.name === 'run.addItems' ? request.args.items[0].position : '';
    expect(position && position > 'a1' && position < 'a2').toBe(true);
  });
});
