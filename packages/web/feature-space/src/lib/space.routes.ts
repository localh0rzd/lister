import type { Routes } from '@angular/router';
import { SpacePage } from './space-page';

export const spaceRoutes: Routes = [
  { path: '', title: 'Space · Lister', component: SpacePage },
  {
    path: 'trash',
    title: 'Trash · Lister',
    loadComponent: () => import('./trash/trash-page').then((m) => m.TrashPage),
  },
];
