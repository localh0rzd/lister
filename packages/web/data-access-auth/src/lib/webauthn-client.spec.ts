import { TestBed } from '@angular/core/testing';
import { WebAuthnClient } from './webauthn-client';

afterEach(() => {
  vi.unstubAllGlobals();
  TestBed.resetTestingModule();
});

describe('WebAuthnClient', () => {
  it('knows at once that a browser with PublicKeyCredential supports passkeys', () => {
    vi.stubGlobal('PublicKeyCredential', class {});

    expect(TestBed.inject(WebAuthnClient).supported()).toBe(true);
  });

  it('knows at once that a browser without it does not', () => {
    vi.stubGlobal('PublicKeyCredential', undefined);

    expect(TestBed.inject(WebAuthnClient).supported()).toBe(false);
  });

  it('cancels without a ceremony running, harmlessly', async () => {
    await expect(
      TestBed.inject(WebAuthnClient).cancel(),
    ).resolves.toBeUndefined();
  });
});
