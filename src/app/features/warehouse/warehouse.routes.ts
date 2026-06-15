import { Routes } from '@angular/router';

export const warehouseRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/warehouse-home/warehouse-home.component').then(
        (m) => m.WarehouseHomeComponent
      ),
  },
  {
    path: 'alerts',
    loadComponent: () =>
      import('./pages/inv-alerts/inv-alerts.component').then(
        (m) => m.InvAlertsComponent
      ),
  },
];
