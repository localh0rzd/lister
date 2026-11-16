import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import type { PasskeyInfo } from '@lister/shared/api-contracts';
import { WebAuthnClient } from '@lister/web/data-access-auth';
import { Notifier } from '@lister/web/util-notify';
import { PasskeysSection } from './passkeys-section';

const phone: PasskeyInfo = {
  id: 'p1',
  name: 'My phone',
  createdAt: '2026-11-01T10:00:00.000Z',
  lastUsedAt: null,
};
const laptop: PasskeyInfo = {
  id: 'p2',
  name: 'Laptop',
  createdAt: '2026-11-02T10:00:00.000Z',
  lastUsedAt: '2026-11-05T10:00:00.000Z',
};

const webAuthn = {
  supported: vi.fn(() => true),
  cancel: vi.fn(async () => undefined),
  register: vi.fn(),
  authenticate: vi.fn(),
};

function setup(dialogResult: boolean | undefined = true) {
  const open = vi.fn(() => ({ afterClosed: () => of(dialogResult) }));
  const notify = vi.fn(async () => 'dismissed');
  webAuthn.supported.mockReturnValue(true);
  webAuthn.register.mockReset();
  webAuthn.cancel.mockClear();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: WebAuthnClient, useValue: webAuthn },
      { provide: MatDialog, useValue: { open } },
      { provide: Notifier, useValue: { notify } },
    ],
  });
  return {
    http: TestBed.inject(HttpTestingController),
    open,
    notify,
  };
}

async function render(http: HttpTestingController, passkeys: PasskeyInfo[]) {
  const fixture = TestBed.createComponent(PasskeysSection);
  fixture.detectChanges();
  const list = await vi.waitFor(() => http.expectOne('/api/passkeys'));
  list.flush(passkeys);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const button = (text: string) =>
    [...element.querySelectorAll('button')].find((b) =>
      (b.getAttribute('aria-label') ?? b.textContent ?? '').includes(text),
    ) as HTMLButtonElement;
  const typeName = async (name: string) => {
    const input = element.querySelector('input') as HTMLInputElement;
    input.value = name;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  const submit = async () => {
    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  };
  return { fixture, element, button, typeName, submit };
}

afterEach(() => {
  TestBed.inject(HttpTestingController).verify();
  TestBed.resetTestingModule();
});

describe('PasskeysSection', () => {
  it('lists the passkeys with when they were added and last used', async () => {
    const { http } = setup();
    const { element } = await render(http, [phone, laptop]);

    const rows = [...element.querySelectorAll('li')].map(
      (li) => li.textContent,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('My phone');
    expect(rows[0]).toContain('Never used');
    expect(rows[1]).toContain('Laptop');
    expect(rows[1]).toContain('Last used');
  });

  it('says when there are none', async () => {
    const { http } = setup();
    const { element } = await render(http, []);

    expect(element.textContent).toContain('You have no passkeys yet');
    expect(element.querySelector('ul')).toBeNull();
  });

  it('says when the list cannot be loaded', async () => {
    const { http } = setup();
    const fixture = TestBed.createComponent(PasskeysSection);
    fixture.detectChanges();
    const list = await vi.waitFor(() => http.expectOne('/api/passkeys'));
    list.flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')
        ?.textContent,
    ).toContain('could not be loaded');
  });

  it('adds a passkey under its trimmed name, then reloads the list and says so', async () => {
    const { http, notify } = setup();
    webAuthn.register.mockResolvedValue({ id: 'new' });
    const { fixture, element, typeName, submit } = await render(http, []);
    await typeName('  Tablet ');

    await submit();
    (await vi.waitFor(() => http.expectOne('/api/passkeys/options'))).flush({
      challenge: 'c1',
    });
    await vi.waitFor(() => expect(webAuthn.register).toHaveBeenCalled());
    const store = await vi.waitFor(() =>
      http.expectOne((r) => r.method === 'POST' && r.url === '/api/passkeys'),
    );
    expect(store.request.method).toBe('POST');
    expect(store.request.body).toEqual({
      name: 'Tablet',
      response: { id: 'new' },
    });
    store.flush({ ...phone, id: 'new', name: 'Tablet' });
    (await vi.waitFor(() => http.expectOne('/api/passkeys'))).flush([phone]);
    await fixture.whenStable();

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Tablet') }),
    );
    expect(element.querySelector('input')?.value).toBe('');
    // The button that was used is gone or disabled: focus must not fall back to the page.
    expect(document.activeElement).toBe(element.querySelector('input'));
  });

  it('asks for a name before doing anything', async () => {
    const { http } = setup();
    const { element, submit } = await render(http, []);

    await submit();

    expect(element.textContent).toContain('Give the passkey a name');
    expect(webAuthn.register).not.toHaveBeenCalled();
  });

  it('explains a refused request without claiming it was cancelled, and keeps the name', async () => {
    const { http } = setup();
    webAuthn.register.mockRejectedValue(
      new DOMException('x', 'NotAllowedError'),
    );
    const { fixture, element, typeName, submit } = await render(http, []);
    await typeName('Tablet');

    await submit();
    (await vi.waitFor(() => http.expectOne('/api/passkeys/options'))).flush({
      challenge: 'c1',
    });

    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(element.querySelector('[role="alert"]')?.textContent).toContain(
        'declined or timed out',
      );
    });
    expect(element.querySelector('input')?.value).toBe('Tablet');
  });

  it('removes a passkey after confirming, and says so', async () => {
    const { http, open, notify } = setup(true);
    const { fixture, element, button } = await render(http, [phone, laptop]);

    button('Remove passkey Laptop').click();

    const call = await vi.waitFor(() => http.expectOne('/api/passkeys/p2'));
    expect(call.request.method).toBe('DELETE');
    expect(open).toHaveBeenCalled();
    call.flush(null, { status: 204, statusText: 'No Content' });
    await vi.waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('Laptop') }),
      ),
    );
    (await vi.waitFor(() => http.expectOne('/api/passkeys'))).flush([phone]);
    await fixture.whenStable();
    expect(document.activeElement).toBe(element.querySelector('input'));
  });

  it('keeps the passkey when the confirmation is declined', async () => {
    const { http, open } = setup(false);
    const { button } = await render(http, [phone]);

    button('Remove passkey My phone').click();
    await vi.waitFor(() => expect(open).toHaveBeenCalled());

    http.expectNone('/api/passkeys/p1');
  });

  it('hides the form when the browser cannot create passkeys', async () => {
    const { http } = setup();
    webAuthn.supported.mockReturnValue(false);
    const { element, fixture } = await render(http, []);
    await fixture.whenStable();

    expect(element.querySelector('form')).toBeNull();
    expect(element.textContent).toContain("can't create passkeys");
  });

  it('says why a passkey was not removed, also when the browser cannot create passkeys', async () => {
    const { http } = setup(true);
    webAuthn.supported.mockReturnValue(false);
    const { fixture, element, button } = await render(http, [phone]);

    button('Remove passkey My phone').click();
    (await vi.waitFor(() => http.expectOne('/api/passkeys/p1'))).flush(
      { message: 'Nope' },
      { status: 500, statusText: 'Server Error' },
    );

    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(element.querySelector('[role="alert"]')?.textContent).toContain(
        'Nope',
      );
    });
  });

  describe('while the authenticator has not answered', () => {
    async function start() {
      const { http } = setup();
      webAuthn.register.mockReturnValue(new Promise(() => undefined));
      const page = await render(http, []);
      await page.typeName('Tablet');
      await page.submit();
      (await vi.waitFor(() => http.expectOne('/api/passkeys/options'))).flush({
        challenge: 'c1',
      });
      await vi.waitFor(() => expect(webAuthn.register).toHaveBeenCalled());
      await page.fixture.whenStable();
      return { ...page, http };
    }

    it('turns the button into a Cancel that gives the form back, keeping the name, without an error', async () => {
      const { element, fixture, button } = await start();
      expect(button('Add a passkey')).toBeUndefined();

      button('Cancel').click();
      await fixture.whenStable();

      expect(webAuthn.cancel).toHaveBeenCalled();
      expect(button('Add a passkey').disabled).toBe(false);
      expect(element.querySelector('input')?.value).toBe('Tablet');
      expect(element.querySelector('[role="alert"]')).toBeNull();
    });

    it('lets the user try again after cancelling a prompt that never answered', async () => {
      const { http, button, fixture, element } = await start();
      button('Cancel').click();
      await fixture.whenStable();

      webAuthn.register.mockRejectedValue(
        new DOMException('x', 'NotAllowedError'),
      );
      button('Add a passkey').click();
      (await vi.waitFor(() => http.expectOne('/api/passkeys/options'))).flush({
        challenge: 'c2',
      });

      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(element.querySelector('[role="alert"]')?.textContent).toContain(
          'declined or timed out',
        );
      });
      expect(webAuthn.register).toHaveBeenCalledTimes(2);
      expect(button('Add a passkey').disabled).toBe(false);
    });

    it('stores nothing when the ceremony was cancelled', async () => {
      const { http, button, fixture } = await start();

      button('Cancel').click();
      await fixture.whenStable();

      http.expectNone((r) => r.method === 'POST' && r.url === '/api/passkeys');
    });

    it('does not start the prompt when cancelled while the options were loading', async () => {
      const { http } = setup();
      const { fixture, button, typeName, submit } = await render(http, []);
      await typeName('Tablet');
      await submit();
      const options = await vi.waitFor(() =>
        http.expectOne('/api/passkeys/options'),
      );

      button('Cancel').click();
      options.flush({ challenge: 'c1' });
      await fixture.whenStable();

      expect(webAuthn.register).not.toHaveBeenCalled();
      expect(button('Add a passkey')).toBeTruthy();
    });
  });
});
