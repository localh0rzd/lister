import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ItemDialog, type ItemFields } from './item-dialog';

async function render(item: ItemFields) {
  const close = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: item },
      { provide: MatDialogRef, useValue: { close } },
    ],
  });
  const fixture = TestBed.createComponent(ItemDialog);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const [title, quantity] = [...element.querySelectorAll('input')];
  const note = element.querySelector('textarea') as HTMLTextAreaElement;
  const type = async (
    field: HTMLInputElement | HTMLTextAreaElement,
    text: string,
  ) => {
    field.value = text;
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const submit = async () => {
    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  };
  return { element, title, quantity, note, type, submit, close };
}

const tent: ItemFields = { title: 'Tent', quantity: '', note: '' };

describe('ItemDialog', () => {
  it('starts with the item and closes with only the changed fields', async () => {
    const dialog = await render({
      title: 'Socks',
      quantity: '2 pairs',
      note: 'wool',
    });
    expect([
      dialog.title.value,
      dialog.quantity.value,
      dialog.note.value,
    ]).toEqual(['Socks', '2 pairs', 'wool']);

    await dialog.type(dialog.quantity, ' 3 pairs ');
    await dialog.submit();

    expect(dialog.close).toHaveBeenCalledWith({ quantity: '3 pairs' });
  });

  it('closes with nothing when nothing changed', async () => {
    const dialog = await render(tent);

    await dialog.type(dialog.title, ' Tent ');
    await dialog.submit();

    expect(dialog.close).toHaveBeenCalledWith(undefined);
  });

  it('allows clearing the quantity (empty means 1)', async () => {
    const dialog = await render({ ...tent, quantity: '2' });

    await dialog.type(dialog.quantity, '');
    await dialog.submit();

    expect(dialog.close).toHaveBeenCalledWith({ quantity: '' });
  });

  it.each([
    ['title', '', 'A title is required'],
    ['quantity', '9'.repeat(51), 'At most 50 characters'],
  ] as const)(
    'refuses an invalid %s with the shared rules',
    async (field, text, message) => {
      const dialog = await render(tent);

      await dialog.type(dialog[field], text);
      await dialog.submit();

      expect(dialog.close).not.toHaveBeenCalled();
      expect(dialog.element.textContent).toContain(message);
    },
  );
});
