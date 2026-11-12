import type { Route } from '@angular/router';

export const appRoutes: Route[] = [
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
    loadChildren: () =>
      import('@lister/web/feature-space').then((m) => m.spaceRoutes),
  },
  { path: '**', redirectTo: 'lists' },
];
