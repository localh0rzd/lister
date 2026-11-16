import type { Routes } from '@angular/router';
import { SettingsPage } from './settings-page';

/** The Settings page; profile and users are mounted next to it by the app's route table. */
export const settingsRoutes: Routes = [
  { path: '', title: 'Settings · Lister', component: SettingsPage },
];
