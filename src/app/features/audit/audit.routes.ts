import { Routes } from '@angular/router';

export const auditRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/audit-log/audit-log.component').then(
        (m) => m.AuditLogComponent
      ),
  },
];
