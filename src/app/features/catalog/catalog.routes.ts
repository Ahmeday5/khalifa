import { Routes } from '@angular/router';

export const catalogRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/catalog-home/catalog-home.component').then(
        (m) => m.CatalogHomeComponent
      ),
  },
];
