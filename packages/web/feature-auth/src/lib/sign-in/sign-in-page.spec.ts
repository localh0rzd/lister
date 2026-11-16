import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import type { CurrentUser } from '@lister/shared/api-contracts';
import { newId } from '@lister/shared/domain';
import { PageNavigator, WebAuthnClient } from '@lister/web/data-access-auth';
import { LOCAL_DB, LocalDb } from '@lister/web/data-access-local-db';
import { SignInPage } from './sign-in-page';

const anna: CurrentUser = {
  id: newId(),
  username: 'anna',
  displayName: 'Anna',
  isAdmin: false,
  mustChangePassword: false,
};

let db: LocalDb;
const load = vi.fn();
const webAuthn = {
  supported: vi.fn(() => true),
  cancel: vi.fn(async () => undefined),
  authenticate: vi.fn(),
  register: vi.fn(),
};

beforeEach(() => {
  load.mockClear();
  webAuthn.supported.mockReturnValue(true);
  webAuthn.authenticate.mockReset();
  webAuthn.cancel.mockClear();
  db = new LocalDb(`test-${newId()}`);
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: LOCAL_DB, useValue: db },
      { provide: PageNavigator, useValue: { load } },
      { provide: WebAuthnClient, useValue: webAuthn },
    ],
  });
});
afterEach(async () => {
  TestBed.inject(HttpTestingController).verify();
  TestBed.resetTestingModule();
  await db.delete();
});

async function render(returnUrl?: string) {
  const fixture = TestBed.createComponent(SignInPage);
  if (returnUrl !== undefined)
    fixture.componentRef.setInput('returnUrl', returnUrl);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const type = async (label: string, text: string) => {
    const input = element.querySelector<HTMLInputElement>(
      `input[autocomplete="${label}"]`,
    ) as HTMLInputElement;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const submit = async () => {
    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  };
  return { fixture, element, type, submit };
}

describe('SignInPage', () => {
  it('signs in with the typed credentials and loads the page the user wanted', async () => {
    const page = await render('/lists/abc');
    await page.type('username', '  anna ');
    await page.type('current-password', 'a password');

    await page.submit();
    const call = TestBed.inject(HttpTestingController).expectOne(
      '/api/auth/login',
    );
    expect(call.request.body).toEqual({
      username: 'anna',
      password: 'a password',
    });
    call.flush(anna);

    await vi.waitFor(() => expect(load).toHaveBeenCalledWith('/lists/abc'));
  });

  it('never leaves the app after signing in', async () => {
    const page = await render('https://evil.example/');
    await page.type('username', 'anna');
    await page.type('current-password', 'a password');

    await page.submit();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/auth/login')
      .flush(anna);

    await vi.waitFor(() => expect(load).toHaveBeenCalledWith('/'));
  });

  it('goes to the forced password change without reloading when the password must change', async () => {
    const navigate = vi
      .spyOn(TestBed.inject(Router), 'navigateByUrl')
      .mockResolvedValue(true);
    const page = await render();
    await page.type('username', 'anna');
    await page.type('current-password', 'temporary');

    await page.submit();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/auth/login')
      .flush({ ...anna, mustChangePassword: true });

    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/change-password'),
    );
    expect(load).not.toHaveBeenCalled();
  });

  it('shows the server answer and stays put when the credentials are wrong', async () => {
    const page = await render();
    await page.type('username', 'anna');
    await page.type('current-password', 'wrong');

    await page.submit();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/auth/login')
      .flush(
        { message: 'Wrong username or password' },
        { status: 401, statusText: 'Unauthorized' },
      );
    await vi.waitFor(async () => {
      await page.fixture.whenStable();
      expect(
        page.element.querySelector('[role="alert"]')?.textContent,
      ).toContain('Wrong username or password');
    });
    expect(load).not.toHaveBeenCalled();
  });

  it('asks for both fields before sending anything', async () => {
    const page = await render();

    await page.submit();

    expect(page.element.textContent).toContain('Enter your username');
    expect(page.element.textContent).toContain('Enter your password');
  });

  it('links to first-run setup', async () => {
    const page = await render();
    expect(
      page.element.querySelector('a[href="/setup"]')?.textContent,
    ).toContain('First-run setup');
  });
  describe('with a passkey', () => {
    const passkeyButton = (element: HTMLElement) =>
      [...element.querySelectorAll('button')].find((b) =>
        b.textContent?.includes('Sign in with a passkey'),
      );

    async function signInWithPasskey(page: Awaited<ReturnType<typeof render>>) {
      const http = TestBed.inject(HttpTestingController);
      passkeyButton(page.element)?.click();
      http.expectOne('/api/auth/passkey/options').flush({ challenge: 'c1' });
      await vi.waitFor(() => expect(webAuthn.authenticate).toHaveBeenCalled());
      return http;
    }

    it('offers it without asking for a username', async () => {
      const page = await render();

      expect(passkeyButton(page.element)).toBeTruthy();
    });

    it('shows the offer in the first render, so nothing below it moves', () => {
      const fixture = TestBed.createComponent(SignInPage);
      fixture.detectChanges();

      expect(passkeyButton(fixture.nativeElement as HTMLElement)).toBeTruthy();
    });

    it('hides the offer when the browser has no passkeys', async () => {
      webAuthn.supported.mockReturnValue(false);
      const page = await render();

      expect(passkeyButton(page.element)).toBeUndefined();
    });

    it('signs in with the authenticator’s answer and loads the page the user wanted', async () => {
      webAuthn.authenticate.mockResolvedValue({ id: 'cred' });
      const page = await render('/lists/abc');

      const http = await signInWithPasskey(page);
      const call = http.expectOne('/api/auth/passkey/login');
      expect(call.request.body).toEqual({ response: { id: 'cred' } });
      call.flush(anna);

      await vi.waitFor(() => expect(load).toHaveBeenCalledWith('/lists/abc'));
    });

    it('goes to the forced password change when the password must change', async () => {
      const navigate = vi
        .spyOn(TestBed.inject(Router), 'navigateByUrl')
        .mockResolvedValue(true);
      webAuthn.authenticate.mockResolvedValue({ id: 'cred' });
      const page = await render();

      const http = await signInWithPasskey(page);
      http
        .expectOne('/api/auth/passkey/login')
        .flush({ ...anna, mustChangePassword: true });

      await vi.waitFor(() =>
        expect(navigate).toHaveBeenCalledWith('/change-password'),
      );
      expect(load).not.toHaveBeenCalled();
    });

    it('says so when the request is refused, and stays put', async () => {
      webAuthn.authenticate.mockRejectedValue(
        new DOMException('cancelled', 'NotAllowedError'),
      );
      const page = await render();

      passkeyButton(page.element)?.click();
      TestBed.inject(HttpTestingController)
        .expectOne('/api/auth/passkey/options')
        .flush({ challenge: 'c1' });

      await vi.waitFor(async () => {
        await page.fixture.whenStable();
        expect(
          page.element.querySelector('[role="alert"]')?.textContent,
        ).toContain('declined or timed out');
      });
      expect(load).not.toHaveBeenCalled();
    });

    it('shows the server answer when the passkey is refused', async () => {
      webAuthn.authenticate.mockResolvedValue({ id: 'cred' });
      const page = await render();

      const http = await signInWithPasskey(page);
      http
        .expectOne('/api/auth/passkey/login')
        .flush(
          { message: 'Passkey sign-in failed' },
          { status: 401, statusText: 'Unauthorized' },
        );

      await vi.waitFor(async () => {
        await page.fixture.whenStable();
        expect(
          page.element.querySelector('[role="alert"]')?.textContent,
        ).toContain('Passkey sign-in failed');
      });
      expect(load).not.toHaveBeenCalled();
    });

    describe('while the authenticator has not answered', () => {
      /** A ceremony that never settles, as when the browser shows nothing or the prompt is ignored. */
      function pending() {
        let reject: (error: unknown) => void = () => undefined;
        webAuthn.authenticate.mockReturnValue(
          new Promise((_, r) => {
            reject = r;
          }),
        );
        return { reject };
      }

      async function start() {
        const page = await render();
        const http = TestBed.inject(HttpTestingController);
        passkeyButton(page.element)?.click();
        http.expectOne('/api/auth/passkey/options').flush({ challenge: 'c1' });
        await vi.waitFor(() =>
          expect(webAuthn.authenticate).toHaveBeenCalled(),
        );
        await page.fixture.whenStable();
        return { ...page, http };
      }

      const button = (element: HTMLElement, name: string) =>
        [...element.querySelectorAll('button')].find((b) =>
          b.textContent?.trim().endsWith(name),
        );

      it('leaves the password form and its Sign in button usable', async () => {
        pending();
        const { element } = await start();

        expect(button(element, 'Sign in')?.disabled).toBe(false);
        expect(
          element.querySelector<HTMLInputElement>(
            'input[autocomplete="username"]',
          )?.disabled,
        ).toBe(false);
      });

      it('turns the passkey button into a Cancel that stops the ceremony without an error', async () => {
        pending();
        const { element, fixture } = await start();
        expect(button(element, 'Sign in with a passkey')).toBeUndefined();

        button(element, 'Cancel')?.click();
        await fixture.whenStable();

        expect(webAuthn.cancel).toHaveBeenCalled();
        expect(button(element, 'Sign in with a passkey')?.disabled).toBe(false);
        expect(element.querySelector('[role="alert"]')).toBeNull();
      });

      it('shows no error when the browser reports the cancelled ceremony', async () => {
        const { reject } = pending();
        const { element, fixture } = await start();

        button(element, 'Cancel')?.click();
        reject(new DOMException('aborted', 'AbortError'));
        await fixture.whenStable();

        expect(element.querySelector('[role="alert"]')).toBeNull();
        expect(button(element, 'Sign in with a passkey')).toBeTruthy();
      });

      it('cancels the ceremony when a password sign-in starts', async () => {
        pending();
        const { element, fixture, type, submit, http } = await start();
        await type('username', 'anna');
        await type('current-password', 'a password');

        await submit();

        expect(webAuthn.cancel).toHaveBeenCalled();
        http.expectOne('/api/auth/login').flush(anna);
        await vi.waitFor(() => expect(load).toHaveBeenCalledWith('/'));
        expect(element.querySelector('[role="alert"]')).toBeNull();
        await fixture.whenStable();
      });

      it('never starts the ceremony when it was cancelled while the options were still loading', async () => {
        pending();
        const page = await render();
        const http = TestBed.inject(HttpTestingController);
        passkeyButton(page.element)?.click();
        await page.fixture.whenStable();

        button(page.element, 'Cancel')?.click();
        http.expectOne('/api/auth/passkey/options').flush({ challenge: 'c1' });
        await page.fixture.whenStable();

        expect(webAuthn.authenticate).not.toHaveBeenCalled();
        expect(page.element.querySelector('[role="alert"]')).toBeNull();
        expect(button(page.element, 'Sign in with a passkey')).toBeTruthy();
      });

      it('re-enables everything and says why when the ceremony times out', async () => {
        const { reject } = pending();
        const { element, fixture } = await start();

        reject(new DOMException('timed out', 'NotAllowedError'));
        await vi.waitFor(async () => {
          await fixture.whenStable();
          expect(
            element.querySelector('[role="alert"]')?.textContent,
          ).toContain('declined or timed out');
        });

        expect(button(element, 'Sign in with a passkey')?.disabled).toBe(false);
        expect(button(element, 'Sign in')?.disabled).toBe(false);
      });
    });
  });
});
