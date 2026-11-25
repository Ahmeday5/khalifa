import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { AccessService } from '../services/access.service';
import { AccessRequirement } from '../constants/access-rules.const';

/** Route the user lands on when they reach a screen they can't use. */
export const FORBIDDEN_ROUTE = '/forbidden';

/**
 * Restricts a route to users satisfying an {@link AccessRequirement}
 * (any listed permission OR any listed role).
 *
 *   { path: 'treasury', canActivate: [accessGuard(ACCESS_RULES.treasury)] }
 *
 * Denied users — typically someone typing a URL by hand — are redirected to
 * the "not authorized" page instead of being shown an error toast, so the
 * guard never produces noise for links the UI already hides.
 *
 * Pair with `authGuard` higher in the route tree; this guard only redirects
 * to the login page if the session has disappeared in between.
 */
export const accessGuard =
  (requirement: AccessRequirement): CanActivateFn =>
  () => {
    const auth = inject(AuthService);
    const access = inject(AccessService);
    const router = inject(Router);

    if (!auth.isLoggedIn()) return router.createUrlTree(['/auth/login']);
    return access.satisfies(requirement)
      ? true
      : router.createUrlTree([FORBIDDEN_ROUTE]);
  };
