/** The dev server, which proxies /api to the API in development (the same as sync's origins). */
const DEV_WEB_ORIGIN = 'http://localhost:4200';

export interface WebAuthnConfig {
  /** The relying-party id: the host of the public URL. */
  rpID: string;
  /** The relying-party name the authenticator may show. */
  rpName: string;
  /** Origins a passkey ceremony may happen on. */
  origins: string[];
}

/**
 * Where passkeys are valid: the host (relying-party id) and origin of `PUBLIC_URL`. Without it
 * (development), `localhost` and the dev server's origin, which WebAuthn accepts over plain HTTP.
 * Passkeys are bound to the relying-party id, so changing the host invalidates them.
 */
export function webAuthnConfig(
  env: Record<string, string | undefined>,
): WebAuthnConfig {
  const rpName = 'Lister';
  const publicUrl = env['PUBLIC_URL']?.trim();
  if (!publicUrl) {
    if (env['NODE_ENV'] === 'production') {
      throw new Error(
        'PUBLIC_URL must be set in production (e.g. https://lister.example.com)',
      );
    }
    return { rpID: 'localhost', rpName, origins: [DEV_WEB_ORIGIN] };
  }
  let url: URL;
  try {
    url = new URL(publicUrl);
  } catch {
    throw new Error(`PUBLIC_URL is not a URL: ${publicUrl}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`PUBLIC_URL must be an http(s) URL: ${publicUrl}`);
  }
  return { rpID: url.hostname, rpName, origins: [url.origin] };
}
