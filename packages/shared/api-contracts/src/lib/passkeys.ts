/**
 * Passkeys (WebAuthn, design §2.3). The options and responses are the JSON that
 * `@simplewebauthn/server` produces and `@simplewebauthn/browser` consumes; shared code can import
 * neither package, so they are typed loosely here and the two ends know their real types.
 */
export type WebAuthnJson = Record<string, unknown>;

/** One of the signed-in user's own passkeys. Times are ISO strings. */
export interface PasskeyInfo {
  /** The credential id (base64url). */
  id: string;
  name: string;
  createdAt: string;
  /** `null` until the passkey has been used to sign in. */
  lastUsedAt: string | null;
}

/** Body of `POST /api/passkeys`: finishes adding a passkey with the browser's response. */
export interface AddPasskeyRequest {
  name: string;
  /** The `startRegistration()` result for the options from `POST /api/passkeys/options`. */
  response: WebAuthnJson;
}

/** Body of `POST /api/auth/passkey/login`: signs in with the browser's response. */
export interface PasskeyLoginRequest {
  /** The `startAuthentication()` result for the options from `POST /api/auth/passkey/options`. */
  response: WebAuthnJson;
}

/** Longest name a passkey can have. */
export const PASSKEY_NAME_MAX = 60;
