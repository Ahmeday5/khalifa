import { Routes } from '@angular/router';

export const vouchersRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/vouchers-list/vouchers-list.component').then(
        (m) => m.VouchersListComponent,
      ),
  },
];
