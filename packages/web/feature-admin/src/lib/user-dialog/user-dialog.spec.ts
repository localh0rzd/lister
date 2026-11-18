import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { CurrentUser } from '@lister/shared/api-contracts';
import { UserDialog, type UserDialogData } from './user-dialog';

const saved: CurrentUser = {
  id: 'u1',
  username: 'anna',
  displayName: 'Anna',
  isAdmin: false,
  mustChangePassword: true,
  visibleToOthers: false,
};

async function render(data: UserDialogData) {
  const close = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: { close } },
    ],
  });
  const fixture = TestBed.createComponent(UserDialog);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const type = async (index: number, text: string) => {
    const input = element.querySelectorAll('input')[index];
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const submit = async () => {
    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  };
  return { fixture, element, type, submit, close };
}

afterEach(() => {
  TestBed.inject(HttpTestingController).verify();
  TestBed.resetTestingModule();
});

describe('UserDialog', () => {
  it('creates a user with a temporary password and closes with them', async () => {
    const dialog = await render({});
    expect(dialog.element.querySelector('h2')?.textContent).toBe('Add user');
    await dialog.type(0, 'anna');
    await dialog.type(1, ' Anna ');
    await dialog.type(2, 'temporary one');

    await dialog.submit();
    const call = TestBed.inject(HttpTestingController).expectOne('/api/users');
    expect(call.request.method).toBe('POST');
    expect(call.request.body).toEqual({
      username: 'anna',
      displayName: 'Anna',
      temporaryPassword: 'temporary one',
    });
    call.flush(saved);

    await vi.waitFor(() => expect(dialog.close).toHaveBeenCalledWith(saved));
  });

  it('edits only the username and name of an existing user', async () => {
    const dialog = await render({ user: saved });
    expect(dialog.element.querySelector('h2')?.textContent).toBe('Edit user');
    expect(dialog.element.querySelectorAll('input').length).toBe(2);
    await dialog.type(1, 'Anna B');

    await dialog.submit();
    const call = TestBed.inject(HttpTestingController).expectOne(
      '/api/users/u1',
    );
    expect(call.request.method).toBe('PATCH');
    expect(call.request.body).toEqual({
      username: 'anna',
      displayName: 'Anna B',
    });
    call.flush({ ...saved, displayName: 'Anna B' });

    await vi.waitFor(() => expect(dialog.close).toHaveBeenCalled());
  });

  it('stays open and shows the reason when the server refuses, e.g. a taken username', async () => {
    const dialog = await render({});
    await dialog.type(0, 'anna');
    await dialog.type(1, 'Anna');
    await dialog.type(2, 'temporary one');

    await dialog.submit();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/users')
      .flush(
        { message: 'That username is taken' },
        { status: 409, statusText: '' },
      );

    await vi.waitFor(async () => {
      await dialog.fixture.whenStable();
      expect(
        dialog.element.querySelector('[role="alert"]')?.textContent,
      ).toContain('That username is taken');
    });
    expect(dialog.close).not.toHaveBeenCalled();
  });

  it.each([
    [['', 'Anna', 'temporary one'], 'Choose a username'],
    [['an na', 'Anna', 'temporary one'], 'Use letters, digits'],
    [['anna', '   ', 'temporary one'], 'Enter a name'],
    [['anna', 'Anna', 'short'], 'Use at least 8 characters'],
  ])('checks %j before sending anything', async (values, message) => {
    const dialog = await render({});
    for (const [i, value] of values.entries()) await dialog.type(i, value);

    await dialog.submit();

    expect(dialog.element.textContent).toContain(message);
    expect(dialog.close).not.toHaveBeenCalled();
  });
});
