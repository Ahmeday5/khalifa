import { Routes } from '@angular/router';

export const reportsRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/reports-home/reports-home.component').then(
        (m) => m.ReportsHomeComponent
      ),
  },
];
