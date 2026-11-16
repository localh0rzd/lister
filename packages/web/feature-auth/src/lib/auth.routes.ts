import type { Routes } from '@angular/router';
import { guestGuard, sessionGuard } from '@lister/web/data-access-auth';

// Each screen is its own set of routes, so the app mounts it at its own path and only loads
// the code of the screen that is visited.

/** Sign-in. Whoever is signed in is sent home. */
export const signInRoutes: Routes = [
  {
    path: '',
    title: 'Sign in · Lister',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./sign-in/sign-in-page').then((m) => m.SignInPage),
  },
];

/** First-run setup with the token from the server log. */
export const setupRoutes: Routes = [
  {
    path: '',
    title: 'Setup · Lister',
    canActivate: [guestGuard],
    loadComponent: () => import('./setup/setup-page').then((m) => m.SetupPage),
  },
];

/** The forced password change after an admin set a temporary password (D9). */
export const changePasswordRoutes: Routes = [
  {
    path: '',
    title: 'New password · Lister',
    canActivate: [sessionGuard],
    loadComponent: () =>
      import('./password/change-password-page').then(
        (m) => m.ChangePasswordPage,
      ),
  },
];

/** The signed-in user's profile, mounted under Settings. */
export const profileRoutes: Routes = [
  {
    path: '',
    title: 'Profile · Lister',
    loadComponent: () =>
      import('./profile/profile-page').then((m) => m.ProfilePage),
  },
];
