import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { type Item, type List, type Run, newId } from '@lister/shared/domain';
import { LOCAL_DB, LocalDb } from '@lister/web/data-access-local-db';
import { SyncEngine } from '@lister/web/data-access-sync';
import { Notifier } from '@lister/web/util-notify';
import { TrashPage, whenDeleted } from './trash-page';

const SPACE = newId();
const ME = newId();
const BEN = newId();
const meta = {
  spaceId: SPACE,
  version: 1,
  deletedAt: null as number | null,
  createdBy: ME,
  updatedBy: ME,
  createdAt: 0,
  updatedAt: 0,
};
const list = (title: string, extra: Partial<List> = {}): List => ({
  ...meta,
  id: newId(),
  title,
  description: '',
  colour: null,
  icon: null,
  ...extra,
});
const item = (
  listId: string,
  title: string,
  extra: Partial<Item> = {},
): Item => ({
  ...meta,
  id: newId(),
  listId,
  title,
  quantity: '',
  note: '',
  position: 'a0',
  ...extra,
});

const run = (title: string, extra: Partial<Run> = {}): Run => ({
  ...meta,
  id: newId(),
  title,
  sourceListId: null,
  finishedAt: null,
  ...extra,
});

let db: LocalDb;
let mutate: ReturnType<typeof vi.fn>;
let notify: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  db = new LocalDb(`test-${newId()}`);
  await db.spaces.put({
    id: SPACE,
    name: 'Home',
    version: 1,
    members: [{ userId: BEN, displayName: 'Ben' }],
  });
  await db.meta.put({ key: 'userId', value: ME });
  mutate = vi.fn(async () => ({ ok: true }));
  notify = vi.fn(async () => 'dismissed');
});
afterEach(async () => {
  TestBed.resetTestingModule();
  await db.delete();
});

async function render() {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: LOCAL_DB, useValue: db },
      { provide: SyncEngine, useValue: { mutate } },
      { provide: Notifier, useValue: { notify } },
    ],
  });
  const fixture = TestBed.createComponent(TrashPage);
  const element = fixture.nativeElement as HTMLElement;
  const rows = () =>
    [...element.querySelectorAll('.entry')].map(
      (row) =>
        `${row.querySelector('.title')?.textContent?.trim()} | ${row
          .querySelector('.meta')
          ?.textContent?.trim()}`,
    );
  return { fixture, element, rows };
}

describe('TrashPage', () => {
  it('lists deleted lists and items with who deleted them and when', async () => {
    const now = Date.now();
    const camping = list('Camping', { deletedAt: now - 1000, updatedBy: ME });
    const beach = list('Beach');
    await db.lists.bulkPut([camping, beach]);
    await db.items.bulkPut([
      item(camping.id, 'Tent'),
      item(camping.id, 'Stove'),
      item(camping.id, 'Lamp', { deletedAt: now - 5000 }), // deleted on its own, earlier
      item(beach.id, 'Towel', { deletedAt: now - 2000, updatedBy: BEN }),
      item(beach.id, 'Hat', { deletedAt: now - 3000, updatedBy: newId() }),
    ]);
    const page = await render();

    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(page.rows()).toEqual([
        `Camping | List · 2 items · 1 more deleted item · deleted by you, ${whenDeleted(now - 1000)}`,
        `Towel | Item in Beach · deleted by Ben, ${whenDeleted(now - 2000)}`,
        `Hat | Item in Beach · deleted by someone, ${whenDeleted(now - 3000)}`,
      ]);
    });
  });

  it('restores a list or an item through the sync engine and says so', async () => {
    const camping = list('Camping', { deletedAt: Date.now() });
    await db.lists.put(camping);
    const page = await render();
    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(page.rows()).toHaveLength(1);
    });

    (
      page.element.querySelector(
        '[aria-label="Restore Camping"]',
      ) as HTMLButtonElement
    ).click();

    await vi.waitFor(() =>
      expect(mutate).toHaveBeenCalledWith({
        spaceId: SPACE,
        name: 'list.restore',
        args: { id: camping.id },
      }),
    );
    await vi.waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Restored “Camping”' }),
      ),
    );
  });

  it('lists a finished run with who finished it and when, and restores it', async () => {
    const now = Date.now();
    const alps = run('Alps', {
      finishedAt: now - 1000,
      updatedBy: BEN,
      sourceListId: null,
    });
    await db.runs.bulkPut([alps, run('Active')]);
    await db.runItems.put({
      ...meta,
      id: newId(),
      runId: alps.id,
      title: 'Tent',
      quantity: '',
      note: '',
      position: 'a0',
      sources: [],
      state: 'checked',
      stateBy: BEN,
      stateAt: now - 1000,
      mergedInto: null,
    });
    const page = await render();
    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(page.rows()).toEqual([
        `Alps | Finished run · 1 item · finished by Ben, ${whenDeleted(now - 1000)}`,
      ]);
    });

    (
      page.element.querySelector(
        '[aria-label="Restore Alps"]',
      ) as HTMLButtonElement
    ).click();

    await vi.waitFor(() =>
      expect(mutate).toHaveBeenCalledWith({
        spaceId: SPACE,
        name: 'run.restore',
        args: { id: alps.id },
      }),
    );
  });

  it('says when the trash is empty', async () => {
    const page = await render();
    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(page.element.textContent).toContain('The trash is empty.');
    });
  });

  it('hands the focus to the next Restore after a restore', async () => {
    const now = Date.now();
    const [a, b] = [
      list('A', { deletedAt: now - 1000 }),
      list('B', { deletedAt: now - 2000 }),
    ];
    await db.lists.bulkPut([a, b]);
    mutate.mockImplementation(async (request: { args: { id: string } }) => {
      await db.lists.update(request.args.id, { deletedAt: null });
      return { ok: true };
    });
    const page = await render();
    document.body.append(page.element);
    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(page.rows()).toHaveLength(2);
    });

    const restoreA = page.element.querySelector(
      '[aria-label="Restore A"]',
    ) as HTMLButtonElement;
    restoreA.focus();
    restoreA.click();

    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(page.rows()).toHaveLength(1);
      expect(document.activeElement?.getAttribute('aria-label')).toBe(
        'Restore B',
      );
    });
    page.element.remove();
  });

  it('says so before the first connection, instead of claiming the trash is empty', async () => {
    await db.spaces.clear();
    const page = await render();
    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(page.element.textContent).toContain(
        'once Lister has connected to the server',
      );
    });
    expect(page.element.textContent).not.toContain('The trash is empty');
  });
});

describe('whenDeleted', () => {
  const at = (day: number, hour: number) =>
    new Date(2026, 10, day, hour, 5).getTime();
  const now = at(12, 15);

  it.each([
    [at(12, 9), 'today 09:05'],
    [at(11, 23), 'yesterday 23:05'],
    [at(3, 18), 'Nov 3 18:05'],
  ])('%s → %s', (time, expected) => {
    expect(whenDeleted(time, now)).toBe(expected);
  });

  it('counts calendar days across a daylight-saving change', () => {
    // Whatever the time zone: just after midnight yesterday is still "yesterday", and
    // just before midnight two days ago isn't.
    const today = new Date(2026, 9, 26, 12); // the day after the EU autumn change
    expect(
      whenDeleted(new Date(2026, 9, 25, 0, 30).getTime(), today.getTime()),
    ).toBe('yesterday 00:30');
    expect(
      whenDeleted(new Date(2026, 9, 24, 23, 30).getTime(), today.getTime()),
    ).toBe('Oct 24 23:30');
  });
});
