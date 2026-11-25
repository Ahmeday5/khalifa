import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';
import { accessGuard } from './core/guards/access.guard';
import { ACCESS_RULES } from './core/constants/access-rules.const';

export const routes: Routes = [
  // Auth area — only reachable when NOT signed in
  {
    path: 'auth',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./layouts/auth/auth-layout.component').then(
        (m) => m.AuthLayoutComponent,
      ),
    children: [
      {
        path: 'login',
        loadComponent: () =>
          import('./features/auth/pages/login/login.component').then(
            (m) => m.LoginComponent,
          ),
      },
      { path: '', redirectTo: 'login', pathMatch: 'full' },
    ],
  },

  // Authenticated app shell
  {
    path: '',
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    loadComponent: () =>
      import('./layouts/admin/admin-layout.component').then(
        (m) => m.AdminLayoutComponent,
      ),
    children: [
      {
        path: 'dashboard',
        canActivate: [accessGuard(ACCESS_RULES.dashboard)],
        loadChildren: () =>
          import('./features/dashboard/dashboard.routes').then(
            (m) => m.dashboardRoutes,
          ),
      },
      {
        path: 'customers',
        canActivate: [accessGuard(ACCESS_RULES.clients)],
        loadChildren: () =>
          import('./features/customers/customers.routes').then(
            (m) => m.customersRoutes,
          ),
      },
      {
        path: 'catalog',
        canActivate: [accessGuard(ACCESS_RULES.clients)],
        loadChildren: () =>
          import('./features/catalog/catalog.routes').then(
            (m) => m.catalogRoutes,
          ),
      },
      {
        path: 'suppliers',
        canActivate: [accessGuard(ACCESS_RULES.suppliers)],
        loadChildren: () =>
          import('./features/suppliers/suppliers.routes').then(
            (m) => m.suppliersRoutes,
          ),
      },
      {
        path: 'invoices',
        canActivate: [accessGuard(ACCESS_RULES.purchaseInvoices)],
        loadChildren: () =>
          import('./features/invoices/invoices.routes').then(
            (m) => m.invoicesRoutes,
          ),
      },
      {
        path: 'warehouse',
        canActivate: [accessGuard(ACCESS_RULES.inventory)],
        loadChildren: () =>
          import('./features/warehouse/warehouse.routes').then(
            (m) => m.warehouseRoutes,
          ),
      },
      {
        path: 'products',
        canActivate: [accessGuard(ACCESS_RULES.inventory)],
        loadChildren: () =>
          import('./features/products/products.routes').then(
            (m) => m.productsRoutes,
          ),
      },
      {
        path: 'categories',
        canActivate: [accessGuard(ACCESS_RULES.inventory)],
        loadChildren: () =>
          import('./features/categories/categories.routes').then(
            (m) => m.categoriesRoutes,
          ),
      },
      {
        // Guarded per child: the treasury page and shareholders carry
        // independent permissions (see treasury.routes.ts).
        path: 'treasury',
        loadChildren: () =>
          import('./features/treasury/treasury.routes').then(
            (m) => m.treasuryRoutes,
          ),
      },
      {
        path: 'vouchers',
        canActivate: [accessGuard(ACCESS_RULES.vouchers)],
        loadChildren: () =>
          import('./features/vouchers/vouchers.routes').then(
            (m) => m.vouchersRoutes,
          ),
      },
      {
        path: 'users',
        canActivate: [accessGuard(ACCESS_RULES.userManagement)],
        loadChildren: () =>
          import('./features/users/users.routes').then((m) => m.usersRoutes),
      },
      {
        path: 'reports',
        canActivate: [accessGuard(ACCESS_RULES.dashboard)],
        loadChildren: () =>
          import('./features/reports/reports.routes').then(
            (m) => m.reportsRoutes,
          ),
      },
      {
        path: 'audit',
        canActivate: [accessGuard(ACCESS_RULES.userManagement)],
        loadChildren: () =>
          import('./features/audit/audit.routes').then((m) => m.auditRoutes),
      },
      {
        path: 'notifications',
        canActivate: [accessGuard(ACCESS_RULES.clients)],
        loadChildren: () =>
          import('./features/notifications/notifications.routes').then(
            (m) => m.notificationsRoutes,
          ),
      },
      {
        path: 'push-notifications',
        loadChildren: () =>
          import('./features/push-notifications/push-notifications.routes').then(
            (m) => m.pushNotificationsRoutes,
          ),
      },
      {
        path: 'reps',
        canActivate: [accessGuard(ACCESS_RULES.userManagement)],
        loadChildren: () =>
          import('./features/reps/reps.routes').then((m) => m.repsRoutes),
      },
      {
        // Representative-only self-service account statement.
        path: 'my-account',
        canActivate: [accessGuard(ACCESS_RULES.representativeSelfService)],
        loadComponent: () =>
          import('./features/reps/pages/my-account/my-account.component').then(
            (m) => m.MyAccountComponent,
          ),
      },
      {
        // Landing page for access-guard denials (hand-typed / stale URLs).
        path: 'forbidden',
        loadComponent: () =>
          import('./features/errors/pages/forbidden/forbidden.component').then(
            (m) => m.ForbiddenComponent,
          ),
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },

  { path: '**', redirectTo: '/dashboard' },
];
