import { AuthService } from '@lister/api/feature-auth';
import type { TestApp } from './create-test-app';

export const PASSWORD = 'correct horse battery';

/** Creates an account straight through the service (arranging data, not under test). */
export function createAccount(
  api: TestApp,
  username: string,
  options: { isAdmin?: boolean; mustChangePassword?: boolean } = {},
) {
  return api.app.get(AuthService).createUser({
    username,
    displayName: `${username} display`,
    password: PASSWORD,
    isAdmin: options.isAdmin ?? false,
    mustChangePassword: options.mustChangePassword ?? false,
  });
}

/** The session cookie out of a response's `Set-Cookie`, as `lister_session=…`, or null. */
export function sessionCookieOf(response: Response): string | null {
  const header = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith('lister_session='));
  return header ? header.split(';')[0] : null;
}

/** A JSON request, optionally with a session cookie and extra headers. */
export function send(
  api: TestApp,
  method: string,
  path: string,
  options: {
    body?: unknown;
    cookie?: string | null;
    headers?: Record<string, string>;
  } = {},
): Promise<Response> {
  return fetch(`${api.url}/api${path}`, {
    method,
    headers: {
      ...(options.body === undefined
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

/** Signs in and returns the session cookie. */
export async function signIn(
  api: TestApp,
  username: string,
  password = PASSWORD,
): Promise<string> {
  const response = await send(api, 'POST', '/auth/login', {
    body: { username, password },
  });
  const cookie = sessionCookieOf(response);
  if (response.status !== 200 || !cookie) {
    throw new Error(`Sign-in failed with ${response.status}`);
  }
  return cookie;
}
