import type { Routes } from '@angular/router';
import { ListEditorPage } from './list-editor-page';
import { ListsPage } from './lists-page';

export const listsRoutes: Routes = [
  { path: '', title: 'Lists · Lister', component: ListsPage },
  { path: ':listId', title: 'List · Lister', component: ListEditorPage },
];
