import type { Routes } from '@angular/router';

/** User administration, mounted under Settings and guarded for admins by the app's route table. */
export const adminRoutes: Routes = [
  {
    path: '',
    title: 'Users · Lister',
    loadComponent: () => import('./users/users-page').then((m) => m.UsersPage),
  },
];
