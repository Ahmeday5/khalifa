import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { Permission } from '../constants/permissions.const';

type PermissionRequirement =
  | Permission
  | string
  | ReadonlyArray<Permission | string>;

interface PermissionGuardOptions {
  /** "all" → user must hold every permission; "any" → at least one. Default: "all". */
  mode?: 'all' | 'any';
  /** Where to redirect on denial. Default: `/dashboard`. */
  fallback?: string;
  /** Toast shown on denial. Defaults to a generic Arabic message. */
  message?: string;
}

/**
 * Restricts a route to users who hold the specified permission(s).
 *
 *   { path: 'users', canActivate: [authGuard, permissionGuard('UserManagement')] }
 *   { path: 'treasury', canActivate: [authGuard, permissionGuard(
 *       ['Treasury.View', 'Treasury.FullAccess'], { mode: 'any' }
 *     )] }
 *
 * Pair with `authGuard` higher in the route tree — this guard assumes the
 * user is already authenticated, and only fails open with a redirect to
 * `/auth/login` when that turns out to be false.
 */
export const permissionGuard = (
  required: PermissionRequirement,
  options: PermissionGuardOptions = {},
): CanActivateFn => () => {
  const auth = inject(AuthService);
  const toast = inject(ToastService);
  const router = inject(Router);

  if (!auth.isLoggedIn()) {
    return router.createUrlTree(['/auth/login']);
  }

  const list = (
    Array.isArray(required) ? required : [required as string]
  ) as readonly string[];

  const granted =
    options.mode === 'any'
      ? auth.hasAnyPermission(list)
      : auth.hasPermission(list);

  if (granted) return true;

  toast.error(options.message ?? 'ليس لديك صلاحية للوصول إلى هذه الصفحة');
  return router.createUrlTree([options.fallback ?? '/dashboard']);
};
