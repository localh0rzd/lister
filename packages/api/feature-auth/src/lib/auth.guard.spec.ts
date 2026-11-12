import {
  type ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { CurrentUser } from '@lister/shared/api-contracts';
import { AuthGuard } from './auth.guard';
import type { AuthService } from './auth.service';
import { AdminOnly, AllowMustChangePassword, Public } from './decorators';

class Routes {
  plain() {
    return 1;
  }
  @Public()
  open() {
    return 1;
  }
  @AllowMustChangePassword()
  allowed() {
    return 1;
  }
  @AdminOnly()
  admin() {
    return 1;
  }
}

const user = (overrides: Partial<CurrentUser> = {}): CurrentUser => ({
  id: 'u1',
  username: 'anna',
  displayName: 'Anna',
  isAdmin: false,
  mustChangePassword: false,
  ...overrides,
});

describe('AuthGuard', () => {
  const cookie = vi.fn();
  const authenticate = vi.fn();
  const guard = new AuthGuard(new Reflector(), {
    authenticate,
  } as unknown as AuthService);

  function run(handler: keyof Routes, headers: Record<string, string> = {}) {
    const request: Record<string, unknown> = { headers };
    const context = {
      getType: () => 'http',
      getHandler: () => Routes.prototype[handler],
      getClass: () => Routes,
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ cookie }),
      }),
    } as unknown as ExecutionContext;
    return { result: () => guard.canActivate(context), request };
  }

  beforeEach(() => {
    cookie.mockReset();
    authenticate.mockReset();
  });

  it('lets public routes through without a session', () => {
    expect(run('open').result()).toBe(true);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('answers 401 without a cookie or with an unknown session', () => {
    expect(run('plain').result).toThrow(UnauthorizedException);

    authenticate.mockReturnValue(null);
    expect(run('plain', { cookie: 'lister_session=x' }).result).toThrow(
      UnauthorizedException,
    );
  });

  it('attaches the user to the request', () => {
    authenticate.mockReturnValue({ user: user(), sessionId: 's1' });
    const { result, request } = run('plain', { cookie: 'lister_session=x' });

    expect(result()).toBe(true);
    expect(request['auth']).toEqual({ user: user(), sessionId: 's1' });
    expect(cookie).not.toHaveBeenCalled();
  });

  it('renews the cookie when the session was renewed', () => {
    authenticate.mockReturnValue({
      user: user(),
      sessionId: 's1',
      renewedUntil: 5,
    });

    run('plain', { cookie: 'lister_session=x' }).result();

    expect(cookie).toHaveBeenCalledWith(
      'lister_session',
      'x',
      expect.objectContaining({ httpOnly: true, maxAge: expect.any(Number) }),
    );
  });

  it('blocks everything but the password change while it is forced', () => {
    authenticate.mockReturnValue({
      user: user({ mustChangePassword: true }),
      sessionId: 's1',
    });
    const headers = { cookie: 'lister_session=x' };

    expect(run('plain', headers).result).toThrow(ForbiddenException);
    expect(run('admin', headers).result).toThrow(ForbiddenException);
    expect(run('allowed', headers).result()).toBe(true);
  });

  it('keeps admin routes for admins', () => {
    const headers = { cookie: 'lister_session=x' };
    authenticate.mockReturnValue({ user: user(), sessionId: 's1' });
    expect(run('admin', headers).result).toThrow(ForbiddenException);

    authenticate.mockReturnValue({
      user: user({ isAdmin: true }),
      sessionId: 's1',
    });
    expect(run('admin', headers).result()).toBe(true);
  });
});
