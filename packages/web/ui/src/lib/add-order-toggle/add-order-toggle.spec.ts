import { TestBed } from '@angular/core/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatButtonToggleGroupHarness } from '@angular/material/button-toggle/testing';
import { type AddItemOrder, AddOrderToggle } from './add-order-toggle';

async function setup(value: AddItemOrder) {
  const fixture = TestBed.createComponent(AddOrderToggle);
  fixture.componentRef.setInput('value', value);
  await fixture.whenStable();
  const group = await TestbedHarnessEnvironment.loader(fixture).getHarness(
    MatButtonToggleGroupHarness,
  );
  return { fixture, group };
}

describe('AddOrderToggle', () => {
  it('offers "Add at end" and "Sort in" and marks the current one', async () => {
    const { group } = await setup('sorted');
    const toggles = await group.getToggles();

    expect(await Promise.all(toggles.map((t) => t.getText()))).toEqual([
      'Add at end',
      'Sort in',
    ]);
    expect(await Promise.all(toggles.map((t) => t.isChecked()))).toEqual([
      false,
      true,
    ]);
  });

  it('emits the chosen order', async () => {
    const { fixture, group } = await setup('end');
    const chosen: string[] = [];
    fixture.componentInstance.value.subscribe((v) => chosen.push(v));

    const [sortIn] = await group.getToggles({ text: 'Sort in' });
    await sortIn.check();

    expect(chosen).toEqual(['sorted']);
  });
});
