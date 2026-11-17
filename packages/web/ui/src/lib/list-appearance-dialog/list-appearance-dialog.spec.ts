import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { LIST_COLOURS, LIST_ICONS } from '@lister/shared/domain';
import {
  ListAppearanceDialog,
  type ListAppearanceDialogData,
} from './list-appearance-dialog';

async function render(data: Partial<ListAppearanceDialogData> = {}) {
  const close = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: MAT_DIALOG_DATA,
        useValue: { title: 'Camping', colour: null, icon: null, ...data },
      },
      { provide: MatDialogRef, useValue: { close } },
    ],
  });
  const fixture = TestBed.createComponent(ListAppearanceDialog);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const button = (group: string, label: string) =>
    element.querySelector(
      `[aria-label="${group}"] button[aria-label="${label}"]`,
    ) as HTMLButtonElement;
  const click = async (target: HTMLElement) => {
    target.click();
    await fixture.whenStable();
  };
  const save = () =>
    click(
      [...element.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === 'Save',
      ) as HTMLElement,
    );
  return { element, button, click, save, close };
}

describe('ListAppearanceDialog', () => {
  it('offers the 12 colours and the curated icons', async () => {
    const { element } = await render();
    expect(
      element.querySelectorAll('[aria-label="Colour"] button'),
    ).toHaveLength(LIST_COLOURS.length);
    expect(LIST_COLOURS).toHaveLength(12);
    expect(element.querySelectorAll('[aria-label="Icon"] button')).toHaveLength(
      LIST_ICONS.length,
    );
    expect(LIST_ICONS.length).toBeGreaterThanOrEqual(36);
  });

  it('closes with the chosen colour and icon', async () => {
    const { button, click, save, close } = await render();

    await click(button('Colour', 'teal'));
    await click(button('Icon', 'Tent'));
    await save();

    expect(close).toHaveBeenCalledWith({ colour: 'teal', icon: 'camping' });
  });

  it('starts from the current choice and clears one by choosing it again', async () => {
    const { button, click, save, close } = await render({
      colour: 'red',
      icon: 'hiking',
    });
    expect(button('Colour', 'red').getAttribute('aria-pressed')).toBe('true');
    expect(button('Icon', 'Hiking').getAttribute('aria-pressed')).toBe('true');

    await click(button('Colour', 'red'));
    expect(button('Colour', 'red').getAttribute('aria-pressed')).toBe('false');
    await save();

    expect(close).toHaveBeenCalledWith({ colour: null, icon: 'hiking' });
  });
});
