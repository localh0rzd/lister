import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { MatMenuHarness } from '@angular/material/menu/testing';
import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { newId } from '@lister/shared/domain';
import {
  CURRENT_SPACE_KEY,
  CurrentSpace,
  LOCAL_DB,
  LocalDb,
} from '@lister/web/data-access-local-db';
import { TruncatedTooltip } from '@lister/web/ui';
import { SpaceButton } from './space-button';

let db: LocalDb;

const trigger = (el: HTMLElement) =>
  el.querySelector<HTMLButtonElement>('button.trigger');

const space = (name: string) => ({
  id: newId(),
  name,
  version: 1,
  members: [],
});

async function render(...names: string[]) {
  localStorage.removeItem(CURRENT_SPACE_KEY);
  db = new LocalDb(`test-${newId()}`);
  const rows = names.map(space);
  await db.spaces.bulkPut(rows);
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: LOCAL_DB, useValue: db }],
  });
  const fixture = TestBed.createComponent(SpaceButton);
  // The local database answers asynchronously.
  if (names.length) {
    await expect
      .poll(async () => {
        await fixture.whenStable();
        return trigger(fixture.nativeElement as HTMLElement);
      })
      .not.toBeNull();
  }
  await fixture.whenStable();
  const loader: HarnessLoader = TestbedHarnessEnvironment.loader(fixture);
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, loader, el, rows };
}

afterEach(async () => {
  await db.delete();
});

describe('SpaceButton', () => {
  it('names the current space, with one space too', async () => {
    const { el } = await render('Family');
    expect(trigger(el)?.textContent).toContain('Family');
    expect(trigger(el)?.getAttribute('aria-label')).toBe(
      'Space: Family, switch space',
    );
  });

  it('shows nothing before any space has reached the device', async () => {
    const { el } = await render();
    expect(trigger(el)).toBeNull();
  });

  it('lists the spaces with the current one marked, and a link to the Space page', async () => {
    const { loader } = await render('Family', 'Work');
    const menu = await loader.getHarness(MatMenuHarness);
    await menu.open();
    const items = await menu.getItems();
    expect(await Promise.all(items.map((i) => i.getText()))).toEqual([
      'checkFamily',
      'Work',
      'groupSpaces…',
    ]);
    expect(
      await items[0].host().then((h) => h.getAttribute('aria-checked')),
    ).toBe('true');
    expect(
      await items[1].host().then((h) => h.getAttribute('aria-checked')),
    ).toBe('false');
    expect(await items[2].host().then((h) => h.getAttribute('href'))).toBe(
      '/space',
    );
  });

  it('switches space and shows the new name', async () => {
    const { fixture, loader, el, rows } = await render('Family', 'Work');
    const menu = await loader.getHarness(MatMenuHarness);
    await menu.clickItem({ text: /Work/ });
    await fixture.whenStable();
    expect(TestBed.inject(CurrentSpace).id()).toBe(rows[1].id);
    expect(trigger(el)?.textContent).toContain('Work');
    expect(localStorage.getItem(CURRENT_SPACE_KEY)).toBe(rows[1].id);
  });

  it('follows a rename without a reload', async () => {
    const { fixture, el, rows } = await render('Family');
    await db.spaces.update(rows[0].id, { name: 'Home' });
    await expect
      .poll(async () => {
        await fixture.whenStable();
        return trigger(el)?.textContent;
      })
      .toContain('Home');
  });

  it('follows a space being added or removed without a reload', async () => {
    const { fixture, el, rows } = await render('Family', 'Work');
    await db.spaces.put(space('Attic'));
    await expect
      .poll(async () => {
        await fixture.whenStable();
        return trigger(el)?.textContent;
      })
      .toContain('Attic');

    await db.spaces.bulkDelete(
      (await db.spaces.toArray())
        .filter((s) => s.id !== rows[1].id)
        .map((s) => s.id),
    );
    await expect
      .poll(async () => {
        await fixture.whenStable();
        return trigger(el)?.textContent;
      })
      .toContain('Work');
  });

  it('gives the name the truncation tooltip, for a long name', async () => {
    const { fixture, el } = await render('A very long space name '.repeat(8));
    expect(
      fixture.debugElement.query(By.directive(TruncatedTooltip)).nativeElement,
    ).toBe(trigger(el));
  });
});
