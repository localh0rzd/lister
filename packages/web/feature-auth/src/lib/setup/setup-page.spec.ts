import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import type { CurrentUser } from '@lister/shared/api-contracts';
import { newId } from '@lister/shared/domain';
import { makeUser } from '@lister/shared/testing';
import { PageNavigator } from '@lister/web/data-access-auth';
import { LOCAL_DB, LocalDb } from '@lister/web/data-access-local-db';
import { SetupPage } from './setup-page';

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

async function render() {
  const fixture = TestBed.createComponent(SetupPage);
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
    await type('off', 0, ' token-123 ');
    await type('username', 0, 'anna');
    await type('name', 0, ' Anna A ');
    await type('new-password', 0, password);
  };
  const submit = async () => {
    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  };
  return { fixture, element, fill, submit };
}

describe('SetupPage', () => {
  it('creates the first account with the token and loads the app signed in', async () => {
    const page = await render();
    await page.fill();

    await page.submit();
    const call = TestBed.inject(HttpTestingController).expectOne(
      '/api/auth/setup',
    );
    expect(call.request.body).toEqual({
      token: 'token-123',
      username: 'anna',
      displayName: 'Anna A',
      password: 'a long password',
    });
    call.flush(
      makeUser({ displayName: 'Anna A', isAdmin: true }) satisfies CurrentUser,
    );

    await vi.waitFor(() => expect(load).toHaveBeenCalledWith('/'));
  });

  it('says so when setup is closed or the token is wrong', async () => {
    const page = await render();
    await page.fill();

    await page.submit();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/auth/setup')
      .flush(
        { message: 'Setup is not available' },
        { status: 404, statusText: 'Not Found' },
      );
    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(
        page.element.querySelector('[role="alert"]')?.textContent,
      ).toContain('Setup is not available');
    });
    expect(load).not.toHaveBeenCalled();
  });

  it('checks the fields before sending anything', async () => {
    const page = await render();
    await page.fill('short');

    await page.submit();

    expect(page.element.textContent).toContain('Use at least 8 characters');
  });
});
