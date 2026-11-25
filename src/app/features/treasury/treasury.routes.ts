import { Routes } from '@angular/router';
import { accessGuard } from '../../core/guards/access.guard';
import { ACCESS_RULES } from '../../core/constants/access-rules.const';

export const treasuryRoutes: Routes = [
  {
    path: '',
    canActivate: [accessGuard(ACCESS_RULES.treasury)],
    loadComponent: () =>
      import('./pages/treasury-home/treasury-home.component').then(
        (m) => m.TreasuryHomeComponent
      ),
  },
  {
    // Shareholders has its own permission, independent of Treasury.View.
    path: 'shareholders',
    canActivate: [accessGuard(ACCESS_RULES.shareholders)],
    loadComponent: () =>
      import('./pages/shareholders/shareholders.component').then(
        (m) => m.ShareholdersComponent
      ),
  },
];
