import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { newId } from '@lister/shared/domain';
import { makeUser } from '@lister/shared/testing';
import { LOCAL_DB, LocalDb } from '@lister/web/data-access-local-db';
import { PasswordForm } from './password-form';

let db: LocalDb;
beforeEach(() => {
  db = new LocalDb(`test-${newId()}`);
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: LOCAL_DB, useValue: db },
    ],
  });
});
afterEach(async () => {
  TestBed.inject(HttpTestingController).verify();
  TestBed.resetTestingModule();
  await db.delete();
});

async function render(forced = false) {
  const fixture = TestBed.createComponent(PasswordForm);
  fixture.componentRef.setInput('forced', forced);
  const changed = vi.fn();
  fixture.componentInstance.changed.subscribe(changed);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const fields = () =>
    element.querySelectorAll<HTMLInputElement>('input[type="password"]');
  const fill = async (current: string, next: string, confirm: string) => {
    for (const [i, text] of [current, next, confirm].entries()) {
      fields()[i].value = text;
      fields()[i].dispatchEvent(new Event('input'));
    }
    await fixture.whenStable();
  };
  const submit = async () => {
    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  };
  return { fixture, element, fields, fill, submit, changed };
}

describe('PasswordForm', () => {
  it('changes the password and tells the parent', async () => {
    const page = await render();
    await page.fill('old password', 'new password', 'new password');

    await page.submit();
    const call = TestBed.inject(HttpTestingController).expectOne(
      '/api/auth/password',
    );
    expect(call.request.body).toEqual({
      currentPassword: 'old password',
      newPassword: 'new password',
    });
    call.flush(makeUser());

    await vi.waitFor(() => expect(page.changed).toHaveBeenCalledTimes(1));
    expect(page.fields()[0].value).toBe('');
  });

  it.each([
    [
      'too short',
      'old password',
      'short',
      'short',
      'Use at least 8 characters',
    ],
    [
      'not repeated correctly',
      'old password',
      'new password',
      'new passwort',
      'The passwords do not match',
    ],
    [
      'the same as the current one',
      'old password',
      'old password',
      'old password',
      'must differ from the current one',
    ],
  ])(
    'refuses a new password that is %s, sending nothing',
    async (_, a, b, c, message) => {
      const page = await render();
      await page.fill(a, b, c);

      await page.submit();

      expect(page.element.textContent).toContain(message);
      expect(page.changed).not.toHaveBeenCalled();
    },
  );

  it('shows the server answer when the current password is wrong', async () => {
    const page = await render();
    await page.fill('wrong', 'new password', 'new password');

    await page.submit();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/auth/password')
      .flush(
        { message: 'The current password is wrong' },
        { status: 401, statusText: '' },
      );
    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(
        page.element.querySelector('[role="alert"]')?.textContent,
      ).toContain('The current password is wrong');
    });
    expect(page.changed).not.toHaveBeenCalled();
  });

  it('calls the current password "temporary" in the forced change', async () => {
    const page = await render(true);
    expect(page.element.textContent).toContain('Temporary password');
  });
});
