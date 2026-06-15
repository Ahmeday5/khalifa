import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { UserRole } from '../models/auth.model';

/**
 * Restricts a route to specific roles.
 *
 *   { path: 'users', canActivate: [authGuard, roleGuard(['admin'])], ... }
 */
export const roleGuard = (allowed: ReadonlyArray<UserRole>): CanActivateFn =>
  () => {
    const auth = inject(AuthService);
    const toast = inject(ToastService);
    const router = inject(Router);

    if (!auth.isLoggedIn()) {
      return router.createUrlTree(['/auth/login']);
    }
    if (auth.hasAnyRole(allowed)) return true;

    toast.error('ليس لديك صلاحية للوصول إلى هذه الصفحة');
    return router.createUrlTree(['/dashboard']);
  };

/**
 * Inverse of {@link roleGuard} — denies the listed roles and lets everyone
 * else through. Use it to carve a role out of a route it would otherwise
 * reach via permissions (e.g. block a Representative from `shareholders`
 * even when the backend grants them `Treasury.View`).
 *
 *   { path: 'shareholders', canActivate: [denyRolesGuard(['Representative'])] }
 */
export const denyRolesGuard = (
  blocked: ReadonlyArray<UserRole>,
): CanActivateFn => () => {
  const auth = inject(AuthService);
  const toast = inject(ToastService);
  const router = inject(Router);

  if (!auth.isLoggedIn()) {
    return router.createUrlTree(['/auth/login']);
  }
  if (auth.hasAnyRole(blocked)) {
    toast.error('ليس لديك صلاحية للوصول إلى هذه الصفحة');
    return router.createUrlTree(['/dashboard']);
  }
  return true;
};
