import type { Routes } from '@angular/router';
import { RunPage } from './run-page';
import { RunsPage } from './runs-page';

export const runsRoutes: Routes = [
  { path: '', title: 'Runs · Lister', component: RunsPage },
  { path: ':runId', title: 'Run · Lister', component: RunPage },
];
