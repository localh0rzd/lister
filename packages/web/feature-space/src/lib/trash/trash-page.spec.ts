import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { type Item, type List, newId } from '@lister/shared/domain';
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
      item(beach.id, 'Towel', { deletedAt: now - 2000, updatedBy: BEN }),
      item(beach.id, 'Hat', { deletedAt: now - 3000, updatedBy: newId() }),
    ]);
    const page = await render();

    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(page.rows()).toEqual([
        `Camping | List · 2 items · deleted by you, ${whenDeleted(now - 1000)}`,
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

  it('says when the trash is empty', async () => {
    const page = await render();
    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(page.element.textContent).toContain('The trash is empty.');
    });
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
});
