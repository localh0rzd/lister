import type { Route } from '@angular/router';
import { adminGuard, signedInGuard } from '@lister/web/data-access-auth';

export const appRoutes: Route[] = [
  // Sign-in, first-run setup and the forced password change: open to people who aren't signed in.
  {
    path: 'sign-in',
    loadChildren: () =>
      import('@lister/web/feature-auth').then((m) => m.signInRoutes),
  },
  {
    path: 'setup',
    loadChildren: () =>
      import('@lister/web/feature-auth').then((m) => m.setupRoutes),
  },
  {
    path: 'change-password',
    loadChildren: () =>
      import('@lister/web/feature-auth').then((m) => m.changePasswordRoutes),
  },
  // Everything else needs a session. An expired one keeps the app usable offline (the guard
  // falls back to the last known user) and the sync badge asks for sign-in.
  {
    path: '',
    canActivate: [signedInGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'lists' },
      {
        path: 'lists',
        loadChildren: () =>
          import('@lister/web/feature-lists').then((m) => m.listsRoutes),
      },
      {
        path: 'runs',
        loadChildren: () =>
          import('@lister/web/feature-runs').then((m) => m.runsRoutes),
      },
      {
        path: 'space',
        children: [
          {
            path: 'profile',
            loadChildren: () =>
              import('@lister/web/feature-auth').then((m) => m.profileRoutes),
          },
          {
            path: 'users',
            canActivateChild: [adminGuard],
            loadChildren: () =>
              import('@lister/web/feature-admin').then((m) => m.adminRoutes),
          },
          {
            path: '',
            loadChildren: () =>
              import('@lister/web/feature-space').then((m) => m.spaceRoutes),
          },
        ],
      },
      { path: '**', redirectTo: 'lists' },
    ],
  },
];
