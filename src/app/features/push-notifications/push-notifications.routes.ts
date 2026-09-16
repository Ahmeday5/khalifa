import { Routes } from '@angular/router';

export const pushNotificationsRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/notifications-inbox/notifications-inbox.component').then(
        (m) => m.NotificationsInboxComponent,
      ),
  },
];
