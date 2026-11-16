import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Passkeys, describePasskeyError } from './passkeys';
import { WebAuthnClient } from './webauthn-client';

let http: HttpTestingController;
let passkeys: Passkeys;
const client = {
  supported: vi.fn(() => true),
  cancel: vi.fn(async () => undefined),
  register: vi.fn(),
  authenticate: vi.fn(),
};

beforeEach(() => {
  client.register.mockReset();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: WebAuthnClient, useValue: client },
    ],
  });
  http = TestBed.inject(HttpTestingController);
  passkeys = TestBed.inject(Passkeys);
});
afterEach(() => {
  http.verify();
  TestBed.resetTestingModule();
});

describe('Passkeys', () => {
  it('reports whether the browser supports passkeys', () => {
    expect(passkeys.supported()).toBe(true);
  });

  it('adds a passkey: server options, the authenticator, then the name and its answer', async () => {
    client.register.mockResolvedValue({ id: 'new' });
    const added = passkeys.add('My phone');

    const options = http.expectOne('/api/passkeys/options');
    expect(options.request.method).toBe('POST');
    options.flush({ challenge: 'c1' });
    await vi.waitFor(() =>
      expect(client.register).toHaveBeenCalledWith({ challenge: 'c1' }),
    );
    const store = http.expectOne('/api/passkeys');
    expect(store.request.body).toEqual({
      name: 'My phone',
      response: { id: 'new' },
    });
    const info = {
      id: 'new',
      name: 'My phone',
      createdAt: 'x',
      lastUsedAt: null,
    };
    store.flush(info);

    expect(await added).toEqual(info);
  });

  it('sends nothing to the server when the authenticator is dismissed', async () => {
    client.register.mockRejectedValue(
      new DOMException('cancelled', 'NotAllowedError'),
    );
    const added = passkeys.add('x');
    http.expectOne('/api/passkeys/options').flush({ challenge: 'c1' });

    await expect(added).rejects.toMatchObject({ name: 'NotAllowedError' });
  });

  it('does not start the prompt, or store anything, when cancelled while the options load', async () => {
    const cancelled = new AbortController();
    const added = passkeys.add('x', cancelled.signal);
    const options = http.expectOne('/api/passkeys/options');

    cancelled.abort();
    options.flush({ challenge: 'c1' });

    await expect(added).rejects.toMatchObject({ name: 'AbortError' });
    expect(client.register).not.toHaveBeenCalled();
  });

  it('stores nothing when cancelled while the prompt was open', async () => {
    const cancelled = new AbortController();
    client.register.mockImplementation(async () => {
      cancelled.abort();
      return { id: 'late' };
    });
    const added = passkeys.add('x', cancelled.signal);
    http.expectOne('/api/passkeys/options').flush({ challenge: 'c1' });

    await expect(added).rejects.toMatchObject({ name: 'AbortError' });
    http.expectNone('/api/passkeys');
  });

  it('stops waiting for a prompt that never answers once cancelled', async () => {
    const cancelled = new AbortController();
    client.register.mockReturnValue(new Promise(() => undefined));
    const added = passkeys.add('x', cancelled.signal);
    http.expectOne('/api/passkeys/options').flush({ challenge: 'c1' });
    await vi.waitFor(() => expect(client.register).toHaveBeenCalled());

    cancelled.abort();

    await expect(added).rejects.toMatchObject({ name: 'AbortError' });
    http.expectNone('/api/passkeys');
  });

  it('cancels the browser prompt through the client', async () => {
    await passkeys.cancel();

    expect(client.cancel).toHaveBeenCalled();
  });

  it('removes a passkey by its id, escaped', async () => {
    const removed = passkeys.remove('a/b');
    const call = http.expectOne('/api/passkeys/a%2Fb');
    expect(call.request.method).toBe('DELETE');
    call.flush(null, { status: 204, statusText: 'No Content' });

    await removed;
  });
});

describe('describePasskeyError', () => {
  it.each([
    [new DOMException('x', 'NotAllowedError'), /declined or timed out/],
    [new DOMException('x', 'InvalidStateError'), /already has a passkey/],
    [
      new HttpErrorResponse({ status: 400, error: { message: 'Expired' } }),
      /Expired/,
    ],
    [new Error('boom'), /Fallback/],
  ])('explains %s', (error, expected) => {
    expect(describePasskeyError(error, 'Fallback')).toMatch(expected);
  });
});
