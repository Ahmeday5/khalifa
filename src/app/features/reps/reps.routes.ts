import { Routes } from '@angular/router';

export const repsRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/reps-list/reps-list.component').then(
        (m) => m.RepsListComponent,
      ),
  },
];
