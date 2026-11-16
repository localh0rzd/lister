import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import type { CurrentUser } from '@lister/shared/api-contracts';
import { newId } from '@lister/shared/domain';
import { PageNavigator } from '@lister/web/data-access-auth';
import { LOCAL_DB, LocalDb } from '@lister/web/data-access-local-db';
import { RegisterPage } from './register-page';

let db: LocalDb;
const load = vi.fn();

beforeEach(() => {
  load.mockClear();
  db = new LocalDb(`test-${newId()}`);
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: LOCAL_DB, useValue: db },
      { provide: PageNavigator, useValue: { load } },
    ],
  });
});
afterEach(async () => {
  TestBed.inject(HttpTestingController).verify();
  TestBed.resetTestingModule();
  await db.delete();
});

async function render(token = '') {
  const fixture = TestBed.createComponent(RegisterPage);
  fixture.componentRef.setInput('token', token);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const type = async (autocomplete: string, index: number, text: string) => {
    const input = element.querySelectorAll<HTMLInputElement>(
      `input[autocomplete="${autocomplete}"]`,
    )[index];
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const fill = async (password = 'a long password') => {
    await type('off', 0, ' abcd1234wxyz ');
    await type('username', 0, 'anna');
    await type('name', 0, ' Anna A ');
    await type('new-password', 0, password);
  };
  const submit = async () => {
    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  };
  return { fixture, element, fill, submit, type };
}

describe('RegisterPage', () => {
  it('registers with the token and loads the app signed in', async () => {
    const page = await render();
    await page.fill();

    await page.submit();
    const call = TestBed.inject(HttpTestingController).expectOne(
      '/api/auth/register',
    );
    expect(call.request.body).toEqual({
      token: 'abcd1234wxyz',
      username: 'anna',
      displayName: 'Anna A',
      password: 'a long password',
    });
    call.flush({
      id: newId(),
      username: 'anna',
      displayName: 'Anna A',
      isAdmin: false,
      mustChangePassword: false,
    } satisfies CurrentUser);

    await vi.waitFor(() => expect(load).toHaveBeenCalledWith('/'));
  });

  it('says so when the token is no longer valid', async () => {
    const page = await render();
    await page.fill();

    await page.submit();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/auth/register')
      .flush(
        { message: 'This registration link is not valid.' },
        { status: 403, statusText: 'Forbidden' },
      );
    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(
        page.element.querySelector('[role="alert"]')?.textContent,
      ).toContain('registration link is not valid');
    });
    expect(load).not.toHaveBeenCalled();
  });

  it('checks the fields before sending anything', async () => {
    const page = await render();
    await page.fill('short');

    await page.submit();

    expect(page.element.textContent).toContain('Use at least 8 characters');
  });

  it('starts with the token from the link, which stays editable', async () => {
    const page = await render('ABCD1234WXYZ');
    const input = page.element.querySelector(
      'input[autocomplete="off"]',
    ) as HTMLInputElement;
    expect(input.value).toBe('ABCD1234WXYZ');

    input.value = 'OTHER000TOKN';
    input.dispatchEvent(new Event('input'));
    await page.fixture.whenStable();
    await page.type('username', 0, 'anna');
    await page.type('name', 0, 'Anna');
    await page.type('new-password', 0, 'a long password');
    await page.submit();

    const call = TestBed.inject(HttpTestingController).expectOne(
      '/api/auth/register',
    );
    expect(call.request.body.token).toBe('OTHER000TOKN');
    call.flush({}, { status: 403, statusText: 'Forbidden' });
    await page.fixture.whenStable();
  });
});
