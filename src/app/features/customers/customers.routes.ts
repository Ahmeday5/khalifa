import { Routes } from '@angular/router';

export const customersRoutes: Routes = [
  // Shell (tab nav + router-outlet) wraps all tab pages
  {
    path: '',
    loadComponent: () =>
      import('./pages/customers-shell/customers-shell.component').then(
        (m) => m.CustomersShellComponent,
      ),
    children: [
      { path: '', redirectTo: 'customer-list', pathMatch: 'full' },
      {
        path: 'customer-list',
        loadComponent: () =>
          import('./pages/customers-list/customers-list.component').then(
            (m) => m.CustomersListComponent,
          ),
      },
      {
        path: 'contract',
        loadComponent: () =>
          import('./pages/contract-new/contract-new.component').then(
            (m) => m.ContractNewComponent,
          ),
      },
      {
        path: 'payment',
        loadComponent: () =>
          import('./pages/payment/payment.component').then(
            (m) => m.PaymentComponent,
          ),
      },
      {
        path: 'statement',
        loadComponent: () =>
          import('./pages/statement/statement.component').then(
            (m) => m.StatementComponent,
          ),
      },
    ],
  },
];
