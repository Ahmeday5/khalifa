import { Observable, EMPTY, from, of } from 'rxjs';
import {
  map,
  expand,
  reduce,
  mergeMap,
  switchMap,
  toArray,
} from 'rxjs/operators';
import { PagedResponse } from '../models/api-response.model';

/**
 * Coerces any list-shaped response into a plain array. Tolerates every
 * shape we've seen from this backend so a single rogue endpoint doesn't
 * blow up the @for that consumes it:
 *
 *   - `T[]`                                      → as-is
 *   - `{ data: T[], pageIndex, count, ... }`     → full paged envelope
 *   - `{ items: T[], total, ... }`               → lite paginated wrapper
 *   - anything else (null, 404, error body, …)   → `[]`
 *
 * Use the rxjs operator wrapper `toList<T>()` instead of calling this
 * directly when piping a service observable — it's the same logic but
 * keeps the `.pipe()` chain readable.
 */
export function asList<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') {
    const data = (value as { data?: unknown }).data;
    if (Array.isArray(data)) return data as T[];
    const items = (value as { items?: unknown }).items;
    if (Array.isArray(items)) return items as T[];
  }
  return [];
}

/**
 * RxJS operator: normalize a list-shaped response stream to `T[]`.
 *
 *   this.api.get<unknown>(url).pipe(toList<Product>())
 */
export function toList<T>() {
  return (source$: Observable<unknown>): Observable<T[]> =>
    source$.pipe(map((v) => asList<T>(v)));
}

const EMPTY_PAGED: PagedResponse<never> = {
  pageIndex: 1,
  pageSize: 0,
  count: 0,
  totalPages: 0,
  data: [],
};

/**
 * Normalizes any "paged" response shape into a canonical `PagedResponse<T>`.
 *
 *   - `{ pageIndex, pageSize, count, totalPages, data: [...] }` → as-is
 *   - `{ data: { pageIndex, ..., data: [...] } }`               → unwrap once
 *     (defensive: catches doubly-wrapped envelopes that slip past `ApiService.unwrap`)
 *   - `T[]`                                                     → wrap as single page
 *   - anything else (null, error body, missing fields, …)       → empty page
 *
 * Pair with `toPaged<T>()` when piping a service observable.
 */
export function asPaged<T>(value: unknown): PagedResponse<T> {
  if (!value || typeof value !== 'object') {
    return Array.isArray(value)
      ? { ...EMPTY_PAGED, pageSize: value.length, count: value.length, totalPages: 1, data: value as T[] }
      : { ...EMPTY_PAGED, data: [] as T[] };
  }

  const candidate = value as Partial<PagedResponse<T>> & { data?: unknown };

  if (Array.isArray(candidate.data)) {
    return {
      pageIndex: typeof candidate.pageIndex === 'number' ? candidate.pageIndex : 1,
      pageSize: typeof candidate.pageSize === 'number' ? candidate.pageSize : candidate.data.length,
      count: typeof candidate.count === 'number' ? candidate.count : candidate.data.length,
      totalPages: typeof candidate.totalPages === 'number' ? candidate.totalPages : 1,
      data: candidate.data as T[],
    };
  }

  // Defensive: doubly-wrapped envelope where the inner `data` is itself a paged shape.
  if (candidate.data && typeof candidate.data === 'object') {
    return asPaged<T>(candidate.data);
  }

  return { ...EMPTY_PAGED, data: [] as T[] };
}

/**
 * RxJS operator: normalize a paged response stream to `PagedResponse<T>`.
 *
 *   this.api.get<unknown>(url).pipe(toPaged<Transfer>())
 */
export function toPaged<T>() {
  return (source$: Observable<unknown>): Observable<PagedResponse<T>> =>
    source$.pipe(map((v) => asPaged<T>(v)));
}

/** Default page size used when draining a paginated endpoint. */
export const FETCH_ALL_PAGE_SIZE = 200;
/**
 * Hard ceiling on page requests so a backend that mis-reports `totalPages`
 * (or `count`) can never spin this into an infinite request loop. 50 pages
 * × 200 rows = 10k items — well past any picker's realistic dataset.
 */
export const FETCH_ALL_MAX_PAGES = 50;

/**
 * Max page requests in flight at once while draining. Bounded so a large
 * roster never floods the API (or the browser's per-host connection pool).
 */
export const FETCH_ALL_CONCURRENCY = 4;

/**
 * Drains *every* page of a server-paginated endpoint into a single flat
 * array — the safe replacement for the "one oversized `pageSize: 1000`
 * page" trick that silently truncates once the real row count grows past
 * the hard-coded number.
 *
 * `fetchPage(pageIndex, pageSize)` must resolve to a canonical
 * `PagedResponse<T>` (normalize with `asPaged`/`toPaged` inside the
 * callback when the endpoint nests its page).
 *
 * Strategy:
 *   1. Page 1 is fetched alone — it reveals the server's real page size
 *      (it may cap the requested one) and the total (`totalPages`/`count`).
 *   2. If the total is known, pages 2..N are fetched IN PARALLEL with
 *      bounded concurrency, then re-assembled in page order. Latency is
 *      ~2 round-trips instead of N sequential ones.
 *   3. If the server reports no total, falls back to walking pages
 *      sequentially until a short/empty page.
 *
 * `maxPages` caps the request count in every mode, so a backend that
 * mis-reports its totals can never trigger an unbounded request storm.
 */
export function fetchAllPages<T>(
  fetchPage: (pageIndex: number, pageSize: number) => Observable<PagedResponse<T>>,
  pageSize: number = FETCH_ALL_PAGE_SIZE,
  maxPages: number = FETCH_ALL_MAX_PAGES,
  concurrency: number = FETCH_ALL_CONCURRENCY,
): Observable<T[]> {
  return fetchPage(1, pageSize).pipe(
    switchMap((first) => {
      const firstRows = first.data ?? [];
      // Detect a server-side page-size cap: if we asked for 200 but the
      // backend honoured only 50, page with 50 — otherwise we'd see
      // 50 < 200, declare ourselves done, and drop everything after row 50.
      const serverPageSize = first.pageSize > 0 ? first.pageSize : pageSize;
      const effectiveSize = Math.min(pageSize, serverPageSize);

      if (firstRows.length === 0) return of([] as T[]);

      const totalPages = resolveTotalPages(first, effectiveSize);
      if (totalPages === null) {
        return drainSequentially(of(first), fetchPage, effectiveSize, maxPages);
      }

      const lastPage = Math.min(totalPages, maxPages);
      if (lastPage <= 1) return of(firstRows);

      const remaining = Array.from({ length: lastPage - 1 }, (_, i) => i + 2);
      return from(remaining).pipe(
        mergeMap(
          (index) =>
            fetchPage(index, effectiveSize).pipe(
              map((page) => ({ index, rows: page.data ?? [] })),
            ),
          concurrency,
        ),
        toArray(),
        map((pages) =>
          pages
            .sort((a, b) => a.index - b.index)
            .reduce((acc, page) => acc.concat(page.rows), firstRows),
        ),
      );
    }),
  );
}

/** Total page count from the server's paging metadata, or `null` if unreported. */
function resolveTotalPages<T>(page: PagedResponse<T>, size: number): number | null {
  if (page.totalPages > 0) return page.totalPages;
  if (page.count > 0 && size > 0) return Math.ceil(page.count / size);
  return null;
}

/** Fallback for endpoints without totals: walk pages until a short/empty one. */
function drainSequentially<T>(
  first$: Observable<PagedResponse<T>>,
  fetchPage: (pageIndex: number, pageSize: number) => Observable<PagedResponse<T>>,
  size: number,
  maxPages: number,
): Observable<T[]> {
  return first$.pipe(
    expand((page) => {
      const rows = page.data?.length ?? 0;
      const next = (page.pageIndex || 1) + 1;
      const lastPageReached = rows === 0 || rows < size || next > maxPages;
      return lastPageReached ? EMPTY : fetchPage(next, size);
    }),
    reduce((acc, page) => acc.concat(page.data ?? []), [] as T[]),
  );
}
