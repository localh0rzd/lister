import { TestBed } from '@angular/core/testing';
import {
  type CanActivateFn,
  type RouterStateSnapshot,
  Router,
  UrlTree,
  provideRouter,
} from '@angular/router';
import type { CurrentUser } from '@lister/shared/api-contracts';
import { makeUser } from '@lister/shared/testing';
import { AuthSession } from './auth-session';
import { adminGuard, guestGuard, sessionGuard, signedInGuard } from './guards';

const user = (changes: Partial<CurrentUser> = {}): CurrentUser =>
  makeUser({ id: 'u1', ...changes });

function setup(known: CurrentUser | null) {
  const ensure = vi.fn(() => Promise.resolve(known));
  const refresh = vi.fn(() => Promise.resolve(known));
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthSession, useValue: { ensure, refresh } },
    ],
  });
  return { ensure, refresh };
}

const run = async (guard: CanActivateFn, url = '/lists') =>
  TestBed.runInInjectionContext(() =>
    guard({} as never, { url } as RouterStateSnapshot),
  ) as Promise<boolean | UrlTree>;

const where = (result: boolean | UrlTree) =>
  result instanceof UrlTree
    ? TestBed.inject(Router).serializeUrl(result)
    : result;

describe('guards', () => {
  describe('signedInGuard', () => {
    it('lets a signed-in user through', async () => {
      setup(user());
      expect(await run(signedInGuard)).toBe(true);
    });

    it('sends anyone else to sign-in, remembering where they wanted to go', async () => {
      setup(null);
      expect(where(await run(signedInGuard, '/lists/abc'))).toBe(
        '/sign-in?returnUrl=%2Flists%2Fabc',
      );
      expect(where(await run(signedInGuard, '/'))).toBe('/sign-in');
    });

    it('sends a user who must change their password to that page', async () => {
      setup(user({ mustChangePassword: true }));
      expect(where(await run(signedInGuard))).toBe('/change-password');
    });
  });

  describe('sessionGuard', () => {
    it('lets in anyone with a session, even one who must change their password', async () => {
      setup(user({ mustChangePassword: true }));
      expect(await run(sessionGuard)).toBe(true);
    });

    it('sends nobody to sign-in', async () => {
      setup(null);
      expect(where(await run(sessionGuard))).toBe('/sign-in');
    });
  });

  describe('guestGuard', () => {
    it('asks the server afresh and lets a signed-out visitor in', async () => {
      const { refresh, ensure } = setup(null);
      expect(await run(guestGuard)).toBe(true);
      expect(refresh).toHaveBeenCalled();
      expect(ensure).not.toHaveBeenCalled();
    });

    it('sends a signed-in user home, or to the forced password change', async () => {
      setup(user());
      expect(where(await run(guestGuard))).toBe('/');
      TestBed.resetTestingModule();
      setup(user({ mustChangePassword: true }));
      expect(where(await run(guestGuard))).toBe('/change-password');
    });
  });

  describe('adminGuard', () => {
    it.each([
      [user({ isAdmin: true }), true],
      [user(), '/settings'],
      [null, '/settings'],
    ])('for %j answers %j', async (known, expected) => {
      setup(known);
      expect(where(await run(adminGuard as CanActivateFn))).toBe(expected);
    });
  });
});
