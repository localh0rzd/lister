import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatAutocompleteHarness } from '@angular/material/autocomplete/testing';
import { AddItemField } from './add-item-field';

async function setup(titles: string[], exclude: string[] = []) {
  const fixture = TestBed.createComponent(AddItemField);
  fixture.componentRef.setInput('titles', titles);
  fixture.componentRef.setInput('exclude', exclude);
  const chosen: string[] = [];
  fixture.componentInstance.chosen.subscribe((title) => chosen.push(title));
  await fixture.whenStable();
  const autocomplete = await TestbedHarnessEnvironment.loader(
    fixture,
  ).getHarness(MatAutocompleteHarness);
  // The harness's option lookup trips jsdom's selector engine: read the overlay directly.
  const options = async () => {
    await fixture.whenStable();
    return [...document.querySelectorAll('mat-option')].map((o) =>
      o.textContent?.trim(),
    );
  };
  return { fixture, autocomplete, chosen, options };
}

describe('AddItemField', () => {
  it('suggests matching titles, prefix matches first, without excluded or repeated ones', async () => {
    const { autocomplete, options } = await setup(
      ['Stent', 'Tent', 'tent ', 'Tent pegs', 'Rope'],
      ['TENT PEGS'],
    );

    await autocomplete.enterText('ten');

    expect(await options()).toEqual(['Tent', 'Stent']);
  });

  it('offers nothing before anything is typed or when nothing matches', async () => {
    const { autocomplete, options } = await setup(['Tent']);

    await autocomplete.focus();
    expect(await options()).toEqual([]);
    await autocomplete.enterText('zzz');
    expect(await options()).toEqual([]);
  });

  it('shows at most a handful of suggestions', async () => {
    const { autocomplete, options } = await setup(
      Array.from({ length: 12 }, (_, i) => `Item ${i}`),
    );

    await autocomplete.enterText('item');

    expect(await options()).toHaveLength(5);
  });

  it('emits the chosen title and keeps typing editable otherwise', async () => {
    const { autocomplete, chosen, fixture } = await setup(['Stove', 'Tent']);

    await autocomplete.enterText('sto');
    expect(fixture.componentInstance.value()).toBe('sto');
    (
      [...document.querySelectorAll('mat-option')].find(
        (o) => o.textContent?.trim() === 'Stove',
      ) as HTMLElement
    ).click();

    expect(chosen).toEqual(['Stove']);
  });

  it('is labelled "Add item"', async () => {
    const { fixture } = await setup([]);

    expect(
      fixture.nativeElement.querySelector('input').labels[0].textContent,
    ).toContain('Add item');
  });
});
