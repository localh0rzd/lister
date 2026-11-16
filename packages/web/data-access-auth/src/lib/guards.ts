import { inject } from '@angular/core';
import {
  type CanActivateChildFn,
  type CanActivateFn,
  Router,
} from '@angular/router';
import { AuthSession } from './auth-session';

/**
 * For every page of the app: signed in, and past the forced password change. Anyone else is
 * sent to sign-in, remembering where they wanted to go.
 */
export const signedInGuard: CanActivateFn = async (_route, state) => {
  const router = inject(Router);
  const user = await inject(AuthSession).ensure();
  if (!user) {
    return router.createUrlTree(['/sign-in'], {
      queryParams: state.url === '/' ? {} : { returnUrl: state.url },
    });
  }
  return user.mustChangePassword
    ? router.createUrlTree(['/change-password'])
    : true;
};

/** For the forced password change: needs a session, whether the password must change or not. */
export const sessionGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const user = await inject(AuthSession).ensure();
  return user ? true : router.createUrlTree(['/sign-in']);
};

/**
 * For sign-in and setup: whoever is signed in has no business there. It asks the server again
 * every time, because the session may have expired since the app opened (the sync engine then
 * sends people here).
 */
export const guestGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const user = await inject(AuthSession).refresh();
  if (!user) return true;
  return router.createUrlTree([
    user.mustChangePassword ? '/change-password' : '/',
  ]);
};

/** For administration: admins only. */
export const adminGuard: CanActivateChildFn = async () => {
  const router = inject(Router);
  const user = await inject(AuthSession).ensure();
  return user?.isAdmin ? true : router.createUrlTree(['/settings']);
};
