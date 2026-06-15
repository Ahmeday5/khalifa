import { HttpEvent, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { HttpCacheService } from '../services/http-cache.service';
import {
  CACHEABLE,
  CACHE_BYPASS,
  CACHE_INVALIDATE,
  CACHE_TTL,
} from '../http/http-context.tokens';

/**
 * Smart caching interceptor.
 *
 *   - GET + `CACHEABLE` + cache hit → resolve from memory/disk, skip network
 *   - GET + `CACHEABLE` + cache miss → forward, store the body on success
 *   - POST/PUT/PATCH/DELETE + `CACHE_INVALIDATE` → forward, then drop matching
 *     cached entries on success
 *
 * Place EARLY in the interceptor chain so a cache hit short-circuits the
 * loader/auth/error chain entirely.
 */
export const cacheInterceptor: HttpInterceptorFn = (req, next) => {
  const cache = inject(HttpCacheService);

  if (req.method === 'GET') {
    const isCacheable = req.context.get(CACHEABLE);
    const bypass = req.context.get(CACHE_BYPASS);
    if (!isCacheable) return next(req);

    const key = cacheKey(req.urlWithParams);

    if (!bypass) {
      const hit = cache.get<unknown>(key);
      if (hit !== null) {
        return of(
          new HttpResponse({ body: hit, status: 200, url: req.urlWithParams }),
        ) as Observable<HttpEvent<unknown>>;
      }
    }

    const ttl = req.context.get(CACHE_TTL);
    return next(req).pipe(
      tap((event) => {
        if (event instanceof HttpResponse && event.status >= 200 && event.status < 300) {
          cache.set(key, event.body, ttl);
        }
      }),
    );
  }

  if (isMutation(req.method)) {
    const patterns = req.context.get(CACHE_INVALIDATE);
    if (!patterns?.length) return next(req);

    return next(req).pipe(
      tap((event) => {
        if (event instanceof HttpResponse && event.status >= 200 && event.status < 300) {
          cache.invalidateMany(patterns);
        }
      }),
    );
  }

  return next(req);
};

function isMutation(method: string): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

/** Strip the protocol/host so cached entries are reusable across env URLs. */
function cacheKey(urlWithParams: string): string {
  try {
    if (urlWithParams.startsWith('http')) {
      const u = new URL(urlWithParams);
      return u.pathname + u.search;
    }
  } catch {
    /* fall through */
  }
  return urlWithParams;
}
