import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import {
  ADMIN_ONLY_KEY,
  ALLOW_MUST_CHANGE_KEY,
  PUBLIC_KEY,
} from './decorators';
import {
  type AuthRequest,
  type AuthResponse,
  SESSION_COOKIE,
  readSessionToken,
  sessionCookieOptions,
} from './http';
import { SESSION_LIFETIME_MS } from './auth.service';

/**
 * Global guard (registered by `AuthModule`): every HTTP route needs a valid session unless it is
 * `@Public()`. While the user must change their password only `@AllowMustChangePassword()`
 * routes work. `@AdminOnly()` routes need an admin.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const flag = (key: string) =>
      this.reflector.getAllAndOverride<boolean | undefined>(key, [
        context.getHandler(),
        context.getClass(),
      ]);
    if (flag(PUBLIC_KEY)) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<AuthRequest>();
    const token = readSessionToken(request.headers['cookie']);
    const found = token ? this.auth.authenticate(token) : null;
    if (!found) throw new UnauthorizedException('Sign in first');
    request.auth = { user: found.user, sessionId: found.sessionId };

    if (found.renewedUntil !== undefined && token) {
      http
        .getResponse<AuthResponse>()
        .cookie(
          SESSION_COOKIE,
          token,
          sessionCookieOptions(process.env, SESSION_LIFETIME_MS),
        );
    }
    if (found.user.mustChangePassword && !flag(ALLOW_MUST_CHANGE_KEY)) {
      throw new ForbiddenException('You must change your password first');
    }
    if (flag(ADMIN_ONLY_KEY) && !found.user.isAdmin) {
      throw new ForbiddenException('Only admins can do that');
    }
    return true;
  }
}
