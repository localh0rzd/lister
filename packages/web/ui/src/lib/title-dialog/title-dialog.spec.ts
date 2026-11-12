import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TitleDialog, type TitleDialogData } from './title-dialog';

async function render(data: TitleDialogData) {
  const close = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: { close } },
    ],
  });
  const fixture = TestBed.createComponent(TitleDialog);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const input = element.querySelector('input') as HTMLInputElement;
  const type = async (text: string) => {
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const submit = async () => {
    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  };
  return { element, input, type, submit, close };
}

describe('TitleDialog', () => {
  it('closes with the trimmed title', async () => {
    const dialog = await render({ heading: 'New list', confirm: 'Create' });
    expect(dialog.element.querySelector('h2')?.textContent).toBe('New list');

    await dialog.type('  Camping  ');
    await dialog.submit();

    expect(dialog.close).toHaveBeenCalledWith('Camping');
  });

  it('starts with the current title when renaming', async () => {
    const dialog = await render({
      heading: 'Rename list',
      confirm: 'Rename',
      title: 'Camping',
    });

    expect(dialog.input.value).toBe('Camping');
  });

  it.each([
    ['', 'A title is required'],
    ['   ', 'A title is required'],
    ['x'.repeat(201), 'At most 200 characters'],
  ])('refuses %j with the shared rules', async (text, message) => {
    const dialog = await render({ heading: 'New list', confirm: 'Create' });

    await dialog.type(text);
    await dialog.submit();

    expect(dialog.close).not.toHaveBeenCalled();
    expect(dialog.element.querySelector('mat-error')?.textContent).toContain(
      message,
    );
  });
});
