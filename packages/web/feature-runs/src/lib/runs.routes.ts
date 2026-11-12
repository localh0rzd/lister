import type { Routes } from '@angular/router';
import { RunsPage } from './runs-page';

export const runsRoutes: Routes = [
  { path: '', title: 'Runs · Lister', component: RunsPage },
];
