import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ListPickerDialog, type ListPickerData } from './list-picker-dialog';

async function render(data: ListPickerData) {
  const close = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: { close } },
    ],
  });
  const fixture = TestBed.createComponent(ListPickerDialog);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const input = element.querySelector('input') as HTMLInputElement;
  const search = async (text: string) => {
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const options = () =>
    [...element.querySelectorAll('button[mat-list-item]')].map((b) =>
      b.textContent?.trim(),
    );
  return { element, input, search, options, close, fixture };
}

const lists = [
  { id: '1', title: 'Camping' },
  { id: '2', title: 'Café trip' },
  { id: '3', title: 'Toiletries' },
];

describe('ListPickerDialog', () => {
  it('shows the lists it is given and closes with the picked one', async () => {
    const dialog = await render({ lists });
    expect(dialog.options()).toEqual(['Camping', 'Café trip', 'Toiletries']);
    // The search icon is projected into the field's prefix slot.
    expect(
      dialog.element.querySelector('.mat-mdc-form-field-icon-prefix mat-icon')
        ?.textContent,
    ).toBe('search');

    (
      dialog.element.querySelectorAll('button[mat-list-item]')[2] as HTMLElement
    ).click();

    expect(dialog.close).toHaveBeenCalledWith('3');
  });

  it('searches ignoring case and accents; Enter picks the first match', async () => {
    const dialog = await render({ lists });
    await dialog.search('CAFE');
    expect(dialog.options()).toEqual(['Café trip']);

    dialog.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(dialog.close).toHaveBeenCalledWith('2');
  });

  it('says when nothing matches, and when there is nothing to add', async () => {
    const dialog = await render({ lists });
    await dialog.search('xyz');
    expect(dialog.element.textContent).toContain('No list matches “xyz”');
    dialog.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(dialog.close).not.toHaveBeenCalled();

    TestBed.resetTestingModule();
    const empty = await render({ lists: [] });
    expect(empty.element.textContent).toContain(
      'No other lists can be added here.',
    );
  });
});
