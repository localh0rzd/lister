import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { NewListDialog } from './new-list-dialog';

async function render() {
  const close = vi.fn();
  TestBed.configureTestingModule({
    providers: [{ provide: MatDialogRef, useValue: { close } }],
  });
  const fixture = TestBed.createComponent(NewListDialog);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const type = async (selector: string, text: string) => {
    const field = element.querySelector(selector) as HTMLInputElement;
    field.value = text;
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const submit = async () => {
    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  };
  const errors = () =>
    [...element.querySelectorAll('mat-error')].map((e) => e.textContent);
  return {
    element,
    close,
    submit,
    errors,
    title: (text: string) => type('input', text),
    items: (text: string) => type('textarea', text),
  };
}

describe('NewListDialog', () => {
  it('has an optional "Items (one per line)" field under the title', async () => {
    const { element } = await render();

    expect(element.querySelector('h2')?.textContent).toBe('New list');
    expect(element.textContent).toContain('Items (one per line)');
  });

  it('closes with just the title and no items when the field is empty', async () => {
    const dialog = await render();

    await dialog.title('  Camping ');
    await dialog.submit();

    expect(dialog.close).toHaveBeenCalledWith({ title: 'Camping', items: [] });
  });

  it('closes with the cleaned-up lines, in pasted order', async () => {
    const dialog = await render();

    await dialog.title('Camping');
    await dialog.items('- Tent\n\n[ ] Stove\n1. tent\n  Lamp  ');
    await dialog.submit();

    expect(dialog.close).toHaveBeenCalledWith({
      title: 'Camping',
      items: ['Tent', 'Stove', 'Lamp'],
    });
  });

  it('still needs a title', async () => {
    const dialog = await render();

    await dialog.items('Tent');
    await dialog.submit();

    expect(dialog.close).not.toHaveBeenCalled();
    expect(dialog.errors()[0]).toContain('A title is required');
  });

  it('refuses a paste over the item limit with a message', async () => {
    const dialog = await render();

    await dialog.title('Big');
    await dialog.items(
      Array.from({ length: 2001 }, (_, i) => `Item ${i}`).join('\n'),
    );
    await dialog.submit();

    expect(dialog.close).not.toHaveBeenCalled();
    expect(dialog.errors()).toEqual(['At most 2000 items (you pasted 2001)']);
  });

  it('accepts exactly the limit', async () => {
    const dialog = await render();

    await dialog.title('Big');
    await dialog.items(
      Array.from({ length: 2000 }, (_, i) => `Item ${i}`).join('\n'),
    );
    await dialog.submit();

    expect(dialog.close).toHaveBeenCalled();
  });

  it('names the line whose text is too long', async () => {
    const dialog = await render();

    await dialog.title('Camping');
    await dialog.items(`Tent\n${'x'.repeat(201)}`);
    await dialog.submit();

    expect(dialog.close).not.toHaveBeenCalled();
    expect(dialog.errors()[0]).toContain(`“${'x'.repeat(30)}”`);
    expect(dialog.errors()[0]).toContain('At most 200 characters');
  });

  it('shows no error for the items field until it is touched, and keeps the hint', async () => {
    const dialog = await render();

    await dialog.items(`Tent\n${'x'.repeat(201)}`);

    expect(dialog.errors()).toEqual([]);
    expect(dialog.element.textContent).toContain('Optional');
  });
});
