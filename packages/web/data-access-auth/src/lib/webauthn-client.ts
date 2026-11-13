import { DOCUMENT, Service, inject } from '@angular/core';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import type { WebAuthnJson } from '@lister/shared/api-contracts';

/**
 * The browser's WebAuthn ceremonies (`@simplewebauthn/browser`, loaded on first use so it stays
 * out of the initial bundle). A seam for tests, which can't talk to an authenticator.
 */
@Service()
export class WebAuthnClient {
  private readonly window = inject(DOCUMENT).defaultView as
    (Window & { PublicKeyCredential?: unknown }) | null;

  /**
   * Whether this browser can do WebAuthn at all: the same test as `browserSupportsWebAuthn()`,
   * but known at once, without loading the library, so pages render their final layout the
   * first time.
   */
  supported(): boolean {
    return typeof this.window?.PublicKeyCredential === 'function';
  }

  /** Asks the authenticator to create a passkey; resolves with the JSON the server verifies. */
  async register(options: WebAuthnJson): Promise<WebAuthnJson> {
    const { startRegistration } = await import('@simplewebauthn/browser');
    const response = await startRegistration({
      optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON,
    });
    return response as unknown as WebAuthnJson;
  }

  /** Asks the authenticator to sign the challenge with one of its passkeys for this site. */
  async authenticate(options: WebAuthnJson): Promise<WebAuthnJson> {
    const { startAuthentication } = await import('@simplewebauthn/browser');
    const response = await startAuthentication({
      optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON,
    });
    return response as unknown as WebAuthnJson;
  }
}
