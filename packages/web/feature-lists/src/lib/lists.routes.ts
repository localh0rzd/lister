import type { Routes } from '@angular/router';
import { ListsPage } from './lists-page';

export const listsRoutes: Routes = [
  { path: '', title: 'Lists · Lister', component: ListsPage },
];
