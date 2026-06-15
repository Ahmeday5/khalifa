import {
  HttpErrorResponse,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { SKIP_AUTH } from '../http/http-context.tokens';
import { API_ENDPOINTS } from '../constants/api-endpoints.const';
import { isJwtExpired } from '../utils/jwt.util';

/**
 * Attaches `Authorization: Bearer <token>` to every request unless the caller
 * opts out via `SKIP_AUTH`, and recovers from a 401 by delegating to
 * `AuthService.refreshToken()` — which is shared, so concurrent 401s only
 * trigger one round-trip.
 *
 * Proactive freshness: if the stored access token is already expired (or
 * within a 10-second window of expiry), the interceptor refreshes BEFORE
 * sending. This eliminates the 401 → refresh → retry round-trip on startup
 * and prevents the ERR_HTTP2_PROTOCOL_ERROR storm caused by racing expired
 * requests hitting the server simultaneously.
 *
 * Auth endpoints (login / refresh / logout) are excluded from both paths to
 * avoid recursion.
 */

/** Safety margin: treat a token expiring within this window as already expired. */
const EXPIRY_BUFFER_MS = 10_000;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.context.get(SKIP_AUTH)) return next(req);

  const auth = inject(AuthService);
  const token = auth.getAccessToken();

  // Proactively refresh if the token is expired or about to expire.
  // `refreshToken()` is shared across concurrent callers so N startup
  // requests all hitting this path still produce only one network round-trip.
  if (token && isJwtExpired(token, EXPIRY_BUFFER_MS)) {
    return auth.refreshToken().pipe(
      switchMap((tokens) => next(withAuthHeader(req, tokens.accessToken))),
      catchError((err) => throwError(() => err)),
    );
  }

  const authReq = token ? withAuthHeader(req, token) : req;

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || isAuthEndpoint(req.url)) {
        return throwError(() => err);
      }
      return retryAfterRefresh(req, next, auth);
    })
  );
};

function retryAfterRefresh(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  auth: AuthService,
) {
  return auth.refreshToken().pipe(
    switchMap((tokens) => next(withAuthHeader(req, tokens.accessToken))),
    catchError((refreshErr) =>
      // refreshToken() already cleared the session and redirected — just
      // surface the error so the original caller's stream completes.
      throwError(() => refreshErr)
    )
  );
}

function withAuthHeader(
  req: HttpRequest<unknown>,
  token: string,
): HttpRequest<unknown> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

function isAuthEndpoint(url: string): boolean {
  return (
    url.includes(API_ENDPOINTS.auth.login) ||
    url.includes(API_ENDPOINTS.auth.refresh) ||
    url.includes(API_ENDPOINTS.auth.logout)
  );
}
