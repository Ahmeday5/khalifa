import { HttpContext, HttpContextToken } from '@angular/common/http';

/**
 * Per-request flags that interceptors honor.
 *
 * Use the `with*` builders below — never read these directly from feature code:
 *
 *   this.api.post(url, body, { context: withSkipLoader() });
 *   this.api.post(url, body, { context: withSilentErrors().set(SKIP_LOADER, true) });
 */

/** Don't toggle the global page loader for this request. */
export const SKIP_LOADER = new HttpContextToken<boolean>(() => false);

/** Don't attach the `Authorization: Bearer` header (e.g. login, refresh). */
export const SKIP_AUTH = new HttpContextToken<boolean>(() => false);

/** Don't surface a toast on error — caller will handle the error inline. */
export const SKIP_ERROR_TOAST = new HttpContextToken<boolean>(() => false);

/**
 * GET requests with `CACHEABLE = true` are served from `HttpCacheService`
 * when a fresh entry exists. Defaults to `false` so caching is opt-in only.
 */
export const CACHEABLE = new HttpContextToken<boolean>(() => false);

/** Time-to-live for a cached GET response, in ms. */
export const CACHE_TTL = new HttpContextToken<number>(() => 15 * 60 * 1000); // 15 min

/**
 * Substring patterns of cached URLs to invalidate after a successful
 * mutating request. e.g. `['app-users']` clears every cached URL containing
 * `app-users`.
 */
export const CACHE_INVALIDATE = new HttpContextToken<readonly string[]>(() => []);

/** Force-bypass the cache for this GET (useful for explicit refresh buttons). */
export const CACHE_BYPASS = new HttpContextToken<boolean>(() => false);

export function withSkipLoader(ctx: HttpContext = new HttpContext()): HttpContext {
  return ctx.set(SKIP_LOADER, true);
}

export function withSkipAuth(ctx: HttpContext = new HttpContext()): HttpContext {
  return ctx.set(SKIP_AUTH, true);
}

export function withSilentErrors(ctx: HttpContext = new HttpContext()): HttpContext {
  return ctx.set(SKIP_ERROR_TOAST, true);
}

/** Common combo for actions with their own button loader + inline error display. */
export function withInlineHandling(ctx: HttpContext = new HttpContext()): HttpContext {
  return ctx.set(SKIP_LOADER, true).set(SKIP_ERROR_TOAST, true);
}

/**
 * Mark a GET request as cacheable.
 *
 *   { context: withCache() }                      → 15 min TTL
 *   { context: withCache({ ttlMs: 60_000 }) }     → 1 min TTL
 */
export function withCache(
  opts: { ttlMs?: number } = {},
  ctx: HttpContext = new HttpContext(),
): HttpContext {
  ctx.set(CACHEABLE, true);
  if (opts.ttlMs !== undefined) ctx.set(CACHE_TTL, opts.ttlMs);
  return ctx;
}

/**
 * Mark a mutating request as a cache invalidator. After a successful response,
 * every cached URL containing any of the given patterns is dropped.
 *
 *   { context: withCacheInvalidate(['app-users']) }
 */
export function withCacheInvalidate(
  patterns: readonly string[],
  ctx: HttpContext = new HttpContext(),
): HttpContext {
  return ctx.set(CACHE_INVALIDATE, patterns);
}

/** Skip the cache lookup for this GET (e.g. user-driven refresh). */
export function withCacheBypass(ctx: HttpContext = new HttpContext()): HttpContext {
  return ctx.set(CACHE_BYPASS, true);
}
