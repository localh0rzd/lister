import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { FieldDialog, type FieldDialogData } from './field-dialog';

async function render(overrides: Partial<FieldDialogData> = {}) {
  const close = vi.fn();
  const data: FieldDialogData = {
    heading: 'Add a member',
    label: 'Username',
    confirm: 'Add',
    maxLength: 10,
    submit: vi.fn(async () => undefined),
    ...overrides,
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: { close } },
    ],
  });
  const fixture = TestBed.createComponent(FieldDialog);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const submit = async (text: string) => {
    const input = element.querySelector('input') as HTMLInputElement;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  };
  return { fixture, element, submit, close, data };
}

afterEach(() => TestBed.resetTestingModule());

describe('FieldDialog', () => {
  it('runs its action with the trimmed value, then closes', async () => {
    const dialog = await render();

    await dialog.submit('  carl ');

    await vi.waitFor(() => expect(dialog.close).toHaveBeenCalledWith(true));
    expect(dialog.data.submit).toHaveBeenCalledWith('carl');
  });

  it('starts with the given value', async () => {
    const dialog = await render({ value: 'Trip' });
    expect(
      (dialog.element.querySelector('input') as HTMLInputElement).value,
    ).toBe('Trip');
  });

  it('stays open and shows why when the action fails', async () => {
    const dialog = await render({
      submit: vi.fn(async () => {
        throw { error: { message: 'No such user' } };
      }),
    });

    await dialog.submit('nobody');

    await vi.waitFor(async () => {
      await dialog.fixture.whenStable();
      expect(dialog.element.querySelector('[role="alert"]')).toBeTruthy();
    });
    expect(dialog.close).not.toHaveBeenCalled();
  });

  it.each([
    ['', 'Enter username'],
    ['   ', 'Enter username'],
    ['x'.repeat(11), 'That is too long'],
  ])('refuses %j', async (text, message) => {
    const dialog = await render();

    await dialog.submit(text);

    expect(dialog.element.textContent).toContain(message);
    expect(dialog.data.submit).not.toHaveBeenCalled();
  });
});
