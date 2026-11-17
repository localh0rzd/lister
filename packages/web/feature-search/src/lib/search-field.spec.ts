import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatAutocompleteHarness } from '@angular/material/autocomplete/testing';
import { Router, provideRouter } from '@angular/router';
import { type Item, type List, type Run, newId } from '@lister/shared/domain';
import { LOCAL_DB, LocalDb } from '@lister/web/data-access-local-db';
import { SearchField } from './search-field';

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
const list = (title: string, extra: Partial<List> = {}): List => ({
  ...meta,
  id: newId(),
  title,
  description: '',
  ...extra,
});
const item = (listId: string, title: string, note = ''): Item => ({
  ...meta,
  id: newId(),
  listId,
  title,
  quantity: '',
  note,
  position: 'a0',
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

async function show() {
  db = new LocalDb(`test-${newId()}`);
  await db.spaces.put({ id: SPACE, name: 'Home', version: 1, members: [] });
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: LOCAL_DB, useValue: db }],
  });
  const fixture = TestBed.createComponent(SearchField);
  const harness = await TestbedHarnessEnvironment.loader(fixture).getHarness(
    MatAutocompleteHarness,
  );
  return { fixture, harness };
}

/**
 * What the open panel shows: group labels and option texts, in order. The harness's option
 * lookup trips jsdom's selector engine, so the overlay is read directly.
 */
const panel = (): string[] =>
  [...document.querySelectorAll('.mat-mdc-optgroup-label, mat-option')].map(
    (element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );

/** Retries `check` until it passes, rendering what the live queries delivered in between. */
const until = (check: () => void) =>
  vi.waitFor(() => {
    TestBed.tick();
    check();
  });

const inputOf = (host: HTMLElement) => {
  const input = host.querySelector('input');
  if (!input) throw new Error('no <input>');
  return input;
};

const options = () => [...document.querySelectorAll<HTMLElement>('mat-option')];

afterEach(async () => {
  TestBed.resetTestingModule();
  await db.delete();
});

describe('SearchField (D25)', () => {
  it('finds lists, items with their list and active runs, grouped, ignoring case and accents', async () => {
    const { harness } = await show();
    const camping = list('Camping');
    await db.lists.bulkPut([camping, list('Beach')]);
    await db.items.bulkPut([
      item(camping.id, 'Café stove'),
      item(camping.id, 'Tent', 'next to the camping stove'),
    ]);
    await db.runs.bulkPut([
      run('Camping weekend'),
      run('Camping done', { finishedAt: 5 }),
    ]);

    await harness.enterText('CAMP');
    await until(() =>
      expect(panel()).toEqual([
        'Lists',
        'Camping',
        'Items',
        'Tent in Camping',
        'Runs',
        'Camping weekend',
      ]),
    );

    await harness.clear();
    await harness.enterText('cafe');
    await until(() =>
      expect(panel()).toEqual(['Items', 'Café stove in Camping']),
    );
  });

  it('says when nothing matches', async () => {
    const { harness } = await show();
    await db.lists.put(list('Camping'));
    await harness.enterText('zzz');
    await until(() => {
      expect(panel()).toEqual(['No matches']);
    });
  });

  it('does not search the trash', async () => {
    const { harness } = await show();
    const gone = list('Camping gone', { deletedAt: 3 });
    await db.lists.put(gone);
    await db.items.put(item(gone.id, 'Camping stove'));
    await harness.enterText('camping');
    await until(() => expect(panel()).toEqual(['No matches']));
  });

  it('opens the page of the chosen result and clears the field', async () => {
    const { harness } = await show();
    const navigate = vi
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockResolvedValue(true);
    const camping = list('Camping');
    await db.lists.put(camping);
    await db.items.put(item(camping.id, 'Stove'));
    const weekend = run('Weekend trip');
    await db.runs.put(weekend);

    await harness.enterText('stove');
    await until(() => expect(options()).toHaveLength(1));
    options()[0].click();
    expect(navigate).toHaveBeenLastCalledWith(['/lists', camping.id]);
    expect(await harness.getValue()).toBe('');

    await harness.enterText('weekend');
    await until(() => expect(options()).toHaveLength(1));
    options()[0].click();
    expect(navigate).toHaveBeenLastCalledWith(['/runs', weekend.id]);
  });

  it('follows changes while results are shown', async () => {
    const { harness } = await show();
    await harness.enterText('tent');
    await until(() => expect(panel()).toEqual(['No matches']));
    await db.lists.put(list('Tent trip'));
    await until(() => expect(panel()).toEqual(['Lists', 'Tent trip']));
  });

  it('keeps one live query while more is typed', async () => {
    const { harness } = await show();
    await db.lists.put(list('Camping'));
    const where = vi.spyOn(db.lists, 'where');
    await harness.enterText('c');
    await until(() => expect(panel()).toEqual(['Lists', 'Camping']));
    const queries = where.mock.calls.length;
    expect(queries).toBeGreaterThan(0);

    await harness.enterText('amp');
    await until(() => expect(panel()).toEqual(['Lists', 'Camping']));
    await harness.enterText('x');
    await until(() => expect(panel()).toEqual(['No matches']));
    expect(where).toHaveBeenCalledTimes(queries);
  });

  it('searches only the current space', async () => {
    const { harness } = await show();
    const other = newId();
    // "Home" comes before "Work" by name, so it is the current space.
    await db.spaces.put({ id: other, name: 'Work', version: 1, members: [] });
    await db.lists.put(list('Home stuff'));
    await db.lists.put(list('Work stuff', { spaceId: other }));
    await harness.enterText('stuff');
    await until(() => expect(panel()).toEqual(['Lists', 'Home stuff']));
  });

  it('focuses the field on "/" except while typing in another field', async () => {
    const { fixture } = await show();
    const input = inputOf(fixture.nativeElement);
    const other = document.createElement('input');
    document.body.append(other);
    other.focus();
    other.dispatchEvent(
      new KeyboardEvent('keydown', { key: '/', bubbles: true }),
    );
    expect(document.activeElement).toBe(other);

    other.blur();
    other.remove();
    const event = new KeyboardEvent('keydown', {
      key: '/',
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(event);
    expect(document.activeElement).toBe(input);
    expect(event.defaultPrevented).toBe(true);
  });

  it('clears the field on Escape', async () => {
    const { fixture, harness } = await show();
    await harness.enterText('abc');
    inputOf(fixture.nativeElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await fixture.whenStable();
    expect(await harness.getValue()).toBe('');
  });
});
