import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ResetPasswordDialog } from './reset-password-dialog';

async function render() {
  const close = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: MAT_DIALOG_DATA,
        useValue: { user: { id: 'u1', displayName: 'Anna' } },
      },
      { provide: MatDialogRef, useValue: { close } },
    ],
  });
  const fixture = TestBed.createComponent(ResetPasswordDialog);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const submit = async (password: string) => {
    const input = element.querySelector('input') as HTMLInputElement;
    input.value = password;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  };
  return { fixture, element, submit, close };
}

afterEach(() => {
  TestBed.inject(HttpTestingController).verify();
  TestBed.resetTestingModule();
});

describe('ResetPasswordDialog', () => {
  it('sets the temporary password and closes', async () => {
    const dialog = await render();
    expect(dialog.element.textContent).toContain('temporary password for Anna');

    await dialog.submit('temporary one');
    const call = TestBed.inject(HttpTestingController).expectOne(
      '/api/users/u1/password',
    );
    expect(call.request.body).toEqual({ temporaryPassword: 'temporary one' });
    call.flush(null, { status: 204, statusText: '' });

    await vi.waitFor(() => expect(dialog.close).toHaveBeenCalledWith(true));
  });

  it('refuses a short password without asking the server', async () => {
    const dialog = await render();

    await dialog.submit('short');

    expect(dialog.element.textContent).toContain('Use at least 8 characters');
    expect(dialog.close).not.toHaveBeenCalled();
  });
});
