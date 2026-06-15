import { Routes } from '@angular/router';
import { denyRolesGuard } from '../../core/guards/role.guard';

export const invoicesRoutes: Routes = [
  // Tabbed shell hosts the list + new-invoice tabs.
  {
    path: '',
    loadComponent: () =>
      import('./pages/invoices-shell/invoices-shell.component').then(
        (m) => m.InvoicesShellComponent,
      ),
    children: [
      { path: '', redirectTo: 'list', pathMatch: 'full' },
      {
        path: 'list',
        loadComponent: () =>
          import('./pages/invoices-list/invoices-list.component').then(
            (m) => m.InvoicesListComponent,
          ),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./pages/invoice-new/invoice-new.component').then(
            (m) => m.InvoiceNewComponent,
          ),
      },
    ],
  },

  // Edit reuses the new-invoice form (sibling of the shell — full-width,
  // no list/new tab chrome). The component switches to update mode when
  // an `:id` is present in the route.
  {
    // Editing is owners-only — reps may create invoices but never amend them,
    // so block the edit route even if reached by direct URL.
    path: ':id/edit',
    canActivate: [denyRolesGuard(['Representative'])],
    loadComponent: () =>
      import('./pages/invoice-new/invoice-new.component').then(
        (m) => m.InvoiceNewComponent,
      ),
  },

  // Standalone details / preview page — sibling of the shell so the print
  // view doesn't carry the list/new chrome.
  {
    path: ':id',
    loadComponent: () =>
      import('./pages/invoice-details/invoice-details.component').then(
        (m) => m.InvoiceDetailsComponent,
      ),
  },
];
