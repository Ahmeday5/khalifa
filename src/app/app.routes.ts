import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';
import { permissionGuard } from './core/guards/permission.guard';
import { roleGuard } from './core/guards/role.guard';
import { accessGuard } from './core/guards/access.guard';
import { PERMISSIONS } from './core/constants/permissions.const';

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
        canActivate: [permissionGuard(PERMISSIONS.dashboardView)],
        loadChildren: () =>
          import('./features/dashboard/dashboard.routes').then(
            (m) => m.dashboardRoutes,
          ),
      },
      {
        path: 'customers',
        canActivate: [permissionGuard(PERMISSIONS.clientsView)],
        loadChildren: () =>
          import('./features/customers/customers.routes').then(
            (m) => m.customersRoutes,
          ),
      },
      {
        path: 'catalog',
        canActivate: [permissionGuard(PERMISSIONS.clientsView)],
        loadChildren: () =>
          import('./features/catalog/catalog.routes').then(
            (m) => m.catalogRoutes,
          ),
      },
      {
        path: 'suppliers',
        canActivate: [permissionGuard(PERMISSIONS.suppliersView)],
        loadChildren: () =>
          import('./features/suppliers/suppliers.routes').then(
            (m) => m.suppliersRoutes,
          ),
      },
      {
        // Suppliers-permission holders, plus Representatives (who own the
        // purchase workflow but carry no supplier permission).
        path: 'invoices',
        canActivate: [
          accessGuard({
            anyPermission: [PERMISSIONS.suppliersView],
            anyRole: ['Representative'],
          }),
        ],
        loadChildren: () =>
          import('./features/invoices/invoices.routes').then(
            (m) => m.invoicesRoutes,
          ),
      },
      {
        path: 'warehouse',
        canActivate: [permissionGuard(PERMISSIONS.suppliersView)],
        loadChildren: () =>
          import('./features/warehouse/warehouse.routes').then(
            (m) => m.warehouseRoutes,
          ),
      },
      {
        path: 'products',
        canActivate: [
          accessGuard({
            anyPermission: [PERMISSIONS.suppliersView],
            anyRole: ['Representative'],
          }),
        ],
        loadChildren: () =>
          import('./features/products/products.routes').then(
            (m) => m.productsRoutes,
          ),
      },
      {
        path: 'categories',
        canActivate: [
          accessGuard({
            anyPermission: [PERMISSIONS.suppliersView],
            anyRole: ['Representative'],
          }),
        ],
        loadChildren: () =>
          import('./features/categories/categories.routes').then(
            (m) => m.categoriesRoutes,
          ),
      },
      {
        path: 'treasury',
        canActivate: [permissionGuard(PERMISSIONS.treasuryView)],
        loadChildren: () =>
          import('./features/treasury/treasury.routes').then(
            (m) => m.treasuryRoutes,
          ),
      },
      {
        path: 'vouchers',
        canActivate: [permissionGuard(PERMISSIONS.treasuryView)],
        loadChildren: () =>
          import('./features/vouchers/vouchers.routes').then(
            (m) => m.vouchersRoutes,
          ),
      },
      {
        path: 'users',
        canActivate: [permissionGuard(PERMISSIONS.userManagement)],
        loadChildren: () =>
          import('./features/users/users.routes').then((m) => m.usersRoutes),
      },
      {
        path: 'reports',
        canActivate: [permissionGuard(PERMISSIONS.dashboardView)],
        loadChildren: () =>
          import('./features/reports/reports.routes').then(
            (m) => m.reportsRoutes,
          ),
      },
      {
        path: 'audit',
        canActivate: [permissionGuard(PERMISSIONS.userManagement)],
        loadChildren: () =>
          import('./features/audit/audit.routes').then((m) => m.auditRoutes),
      },
      {
        path: 'notifications',
        canActivate: [permissionGuard(PERMISSIONS.clientsView)],
        loadChildren: () =>
          import('./features/notifications/notifications.routes').then(
            (m) => m.notificationsRoutes,
          ),
      },
      {
        path: 'contracts',
        canActivate: [permissionGuard(PERMISSIONS.clientsView)],
        loadChildren: () =>
          import('./features/contracts/contracts.routes').then(
            (m) => m.contractsRoutes,
          ),
      },
      {
        path: 'reps',
        canActivate: [permissionGuard(PERMISSIONS.userManagement)],
        loadChildren: () =>
          import('./features/reps/reps.routes').then((m) => m.repsRoutes),
      },
      {
        // Representative-only self-service account statement.
        path: 'my-account',
        canActivate: [roleGuard(['Representative'])],
        loadComponent: () =>
          import('./features/reps/pages/my-account/my-account.component').then(
            (m) => m.MyAccountComponent,
          ),
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },

  { path: '**', redirectTo: '/dashboard' },
];
