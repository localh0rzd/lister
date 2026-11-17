import type { Routes } from '@angular/router';
import { AllItemsPage } from './all-items-page';
import { ListEditorPage } from './list-editor-page';
import { ListsPage } from './lists-page';

export const listsRoutes: Routes = [
  { path: '', title: 'Lists · Lister', component: ListsPage },
  { path: 'items', title: 'All items · Lister', component: AllItemsPage },
  { path: ':listId', title: 'List · Lister', component: ListEditorPage },
];
