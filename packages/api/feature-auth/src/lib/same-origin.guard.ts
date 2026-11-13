import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Logger,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

/** Methods that never change anything, so another site may send them. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

interface WriteRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
}

const header = (request: WriteRequest, name: string): string | undefined => {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
};

/**
 * Stops cross-site request forgery on every HTTP route that changes something. Sessions are a
 * cookie, and `SameSite=Lax` still lets another site sign a visitor in to the attacker's account
 * with a plain HTML form (the cookie is *set* on a top-level POST), and lets a sibling subdomain
 * send any request with the visitor's cookie. So every request that isn't GET, HEAD or OPTIONS:
 *
 * - must not come from a page on another origin: a browser always sends `Origin` on such
 *   requests, and it must be one of `origins` (the origin of `PUBLIC_URL`, see `allowedOrigins`).
 *   Requests without `Origin` don't come from a cross-origin page (curl, server-to-server).
 * - may only carry a JSON body. A cross-origin page can't send `application/json` without a CORS
 *   preflight, which this server never answers, so no HTML form or simple fetch gets through.
 *
 * Registered app-wide by `configureApp` with `useGlobalGuards`, which appends to the `APP_GUARD`
 * list, so it runs after `AuthModule`'s `AuthGuard`. The order is harmless today: the sign-in
 * routes are public, and `AuthGuard` only reads the session and changes nothing, so a refused
 * write still gets its 403/415 and no route handler runs either way.
 */
export class SameOriginGuard implements CanActivate {
  private readonly logger = new Logger(SameOriginGuard.name);

  constructor(private readonly origins: readonly string[]) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest<WriteRequest>();
    if (SAFE_METHODS.has(request.method.toUpperCase())) return true;

    const origin = header(request, 'origin');
    if (origin !== undefined && !this.origins.includes(origin)) {
      this.logger.warn(
        `Refused a ${request.method} from ${origin}; PUBLIC_URL allows ${this.origins.join(', ')}`,
      );
      throw new ForbiddenException('Requests from other sites are not allowed');
    }
    const contentType = header(request, 'content-type');
    if (contentType !== undefined) {
      const mediaType = contentType.split(';')[0].trim().toLowerCase();
      if (mediaType !== 'application/json') {
        this.logger.warn(
          `Refused a ${request.method} with content type ${mediaType}; only application/json is allowed`,
        );
        throw new UnsupportedMediaTypeException('Send the body as JSON');
      }
    }
    return true;
  }
}
