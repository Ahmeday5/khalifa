import { Routes } from '@angular/router';
import { denyRolesGuard } from '../../core/guards/role.guard';

export const treasuryRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/treasury-home/treasury-home.component').then(
        (m) => m.TreasuryHomeComponent
      ),
  },
  {
    // Off-limits to Representatives even if the backend grants them
    // Treasury.View — shareholders is owners-only.
    path: 'shareholders',
    canActivate: [denyRolesGuard(['Representative'])],
    loadComponent: () =>
      import('./pages/shareholders/shareholders.component').then(
        (m) => m.ShareholdersComponent
      ),
  },
];
