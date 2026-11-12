import type { CurrentUser } from '@lister/shared/api-contracts';

/** The parts of an Express request this library reads (no direct dependency on `express`). */
export interface AuthRequest {
  headers: Record<string, string | string[] | undefined>;
  /** The client address; behind a trusted proxy Express takes it from `X-Forwarded-For`. */
  ip?: string;
  /** Set by `AuthGuard` for routes that aren't `@Public()`. */
  auth?: AuthContext;
}

export interface AuthResponse {
  cookie(name: string, value: string, options: CookieOptions): unknown;
  clearCookie(name: string, options: CookieOptions): unknown;
  setHeader(name: string, value: string | number): unknown;
}

export interface CookieOptions {
  httpOnly: boolean;
  sameSite: 'lax';
  secure: boolean;
  path: string;
  maxAge?: number;
}

/** Who is calling: the user and the session the request came with. */
export interface AuthContext {
  user: CurrentUser;
  sessionId: string;
}

export const SESSION_COOKIE = 'lister_session';

/** `Secure` only when the public URL is https, so plain-HTTP local development still works. */
export function sessionCookieOptions(
  env: NodeJS.ProcessEnv,
  maxAgeMs?: number,
): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: (env['PUBLIC_URL'] ?? '').startsWith('https://'),
    path: '/',
    ...(maxAgeMs === undefined ? {} : { maxAge: maxAgeMs }),
  };
}

/** The session token in a `Cookie` header, if any. */
export function readSessionToken(
  cookieHeader: string | string[] | undefined,
): string | undefined {
  const header = Array.isArray(cookieHeader)
    ? cookieHeader.join(';')
    : cookieHeader;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === SESSION_COOKIE) {
      return part.slice(index + 1).trim() || undefined;
    }
  }
  return undefined;
}
