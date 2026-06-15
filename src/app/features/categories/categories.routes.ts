import { Routes } from '@angular/router';

export const categoriesRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/categories-list/categories-list.component').then(
        (m) => m.CategoriesListComponent,
      ),
  },
];
