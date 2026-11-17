import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { type Item, type List, newId } from '@lister/shared/domain';
import { LOCAL_DB, LocalDb } from '@lister/web/data-access-local-db';
import { AllItemsPage } from './all-items-page';

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
  colour: null,
  icon: null,
});
const item = (listId: string, title: string): Item => ({
  ...meta,
  id: newId(),
  listId,
  title,
  quantity: '',
  note: '',
  position: 'a0',
});

let db: LocalDb;

async function render(options: { space?: boolean } = {}) {
  db = new LocalDb(`test-${newId()}`);
  if (options.space !== false) {
    await db.spaces.put({ id: SPACE, name: 'Home', version: 1, members: [] });
  }
  return db;
}

async function show() {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: LOCAL_DB, useValue: db }],
  });
  const fixture = TestBed.createComponent(AllItemsPage);
  const element = fixture.nativeElement as HTMLElement;
  await vi.waitFor(async () => {
    await fixture.whenStable();
    expect(element.querySelector('lister-loading-hint')).toBeNull();
  });
  return { fixture, element };
}

afterEach(async () => {
  TestBed.resetTestingModule();
  await db.delete();
});

describe('AllItemsPage', () => {
  it('says so before the first connection', async () => {
    await render({ space: false });
    const { element } = await show();
    expect(element.textContent).toContain('once Lister has connected');
  });

  it('shows an empty state without items', async () => {
    await render();
    const { element } = await show();
    expect(element.textContent).toContain('No items yet');
  });

  it('lists each item once, A–Z, with links to its lists, and follows changes', async () => {
    await render();
    const camping = list('Camping');
    const beach = list('Beach');
    await db.lists.bulkPut([camping, beach]);
    await db.items.bulkPut([
      item(camping.id, 'Tent'),
      item(beach.id, 'tent'),
      item(beach.id, 'Axe'),
    ]);
    const { element, fixture } = await show();
    const rows = () =>
      [...element.querySelectorAll('.row')].map((row) => [
        row.querySelector('.title')?.textContent?.trim(),
        [...row.querySelectorAll('a')].map((a) => a.textContent?.trim()),
      ]);

    expect(rows()).toEqual([
      ['Axe', ['Beach']],
      ['Tent', ['Beach', 'Camping']],
    ]);
    expect(
      element.querySelector<HTMLAnchorElement>('.row a')?.getAttribute('href'),
    ).toBe(`/${beach.id}`);

    await db.items.put(item(camping.id, 'Bag'));
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(rows().map((r) => r[0])).toEqual(['Axe', 'Bag', 'Tent']);
    });
  });
});
