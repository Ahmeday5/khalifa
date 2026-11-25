import { APP_INITIALIZER, Provider, inject } from '@angular/core';
import { firstValueFrom, of } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

/**
 * Upper bound on how long app start-up may wait for the permission sync.
 * Past it we boot with the cached permissions — the backend still enforces
 * the real policy, and the next login refreshes the cache.
 */
const PERMISSIONS_SYNC_TIMEOUT_MS = 4_000;

/**
 * Refreshes a restored session's role + permissions before the first
 * navigation, so route guards and the sidebar evaluate the backend's
 * *current* policy rather than whatever was cached at the last login.
 *
 * Fail-open by design: a slow or failing sync never blocks start-up.
 */
export function provideSessionPermissionsSync(): Provider {
  return {
    provide: APP_INITIALIZER,
    multi: true,
    useFactory: () => {
      const auth = inject(AuthService);
      return () =>
        firstValueFrom(
          auth.syncPermissions().pipe(
            timeout({ first: PERMISSIONS_SYNC_TIMEOUT_MS }),
            catchError(() => of(undefined)),
          ),
        );
    },
  };
}
