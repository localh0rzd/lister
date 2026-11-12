import {
  type ExecutionContext,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import type { CurrentUser } from '@lister/shared/api-contracts';
import type { AuthContext, AuthRequest } from './http';

export const PUBLIC_KEY = 'auth:public';
export const ALLOW_MUST_CHANGE_KEY = 'auth:allowMustChangePassword';
export const ADMIN_ONLY_KEY = 'auth:adminOnly';

/** The route needs no sign-in (login, setup, health). Every other route does. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** The route also works while the user must change their password (me, logout, change). */
export const AllowMustChangePassword = () =>
  SetMetadata(ALLOW_MUST_CHANGE_KEY, true);

/** Only admins may call the route (403 for everyone else). */
export const AdminOnly = () => SetMetadata(ADMIN_ONLY_KEY, true);

function context(executionContext: ExecutionContext): AuthContext {
  const request = executionContext.switchToHttp().getRequest<AuthRequest>();
  if (!request.auth)
    throw new Error('No signed-in user: is the route @Public()?');
  return request.auth;
}

/** The signed-in user (not on `@Public()` routes). */
export const SignedInUser = createParamDecorator(
  (_data: unknown, executionContext: ExecutionContext): CurrentUser =>
    context(executionContext).user,
);

/** The id of the session the request came with (not on `@Public()` routes). */
export const SessionId = createParamDecorator(
  (_data: unknown, executionContext: ExecutionContext): string =>
    context(executionContext).sessionId,
);
