import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ConfirmDialog } from './confirm-dialog';

async function render() {
  const close = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: MAT_DIALOG_DATA,
        useValue: {
          heading: 'Sign out?',
          message: '2 changes are not synced.',
          confirm: 'Sign out',
        },
      },
      { provide: MatDialogRef, useValue: { close } },
    ],
  });
  const fixture = TestBed.createComponent(ConfirmDialog);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const button = (name: string) =>
    [...element.querySelectorAll('button')].find((b) =>
      b.textContent?.includes(name),
    ) as HTMLButtonElement;
  return { element, button, close };
}

describe('ConfirmDialog', () => {
  it('shows the question and what the buttons do', async () => {
    const { element, button } = await render();

    expect(element.querySelector('h2')?.textContent).toBe('Sign out?');
    expect(element.textContent).toContain('2 changes are not synced.');
    expect(button('Cancel')).toBeTruthy();
    expect(button('Sign out')).toBeTruthy();
  });

  it('closes with true when confirmed, and with nothing when cancelled', async () => {
    const { button, close } = await render();

    button('Sign out').click();
    expect(close).toHaveBeenCalledWith(true);

    close.mockClear();
    button('Cancel').click();
    expect(close).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalledWith(true);
  });
});
