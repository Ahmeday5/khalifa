import { Observable, EMPTY } from 'rxjs';
import { map, expand, reduce } from 'rxjs/operators';
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
 * Drains *every* page of a server-paginated endpoint into a single flat
 * array — the safe replacement for the "one oversized `pageSize: 1000`
 * page" trick that silently truncates once the real row count grows past
 * the hard-coded number.
 *
 * `fetchPage(pageIndex, pageSize)` must resolve to a canonical
 * `PagedResponse<T>` (normalize with `asPaged`/`toPaged` inside the
 * callback when the endpoint nests its page). Iteration walks pages
 * sequentially from 1 and stops at the first of:
 *
 *   - a short page (fewer rows than `pageSize` → last page reached)
 *   - the reported `totalPages`
 *   - the `maxPages` safety cap
 *
 * so a single tolerant pass works whether the backend reports
 * `totalPages`, only `count`, or neither.
 */
export function fetchAllPages<T>(
  fetchPage: (pageIndex: number, pageSize: number) => Observable<PagedResponse<T>>,
  pageSize: number = FETCH_ALL_PAGE_SIZE,
  maxPages: number = FETCH_ALL_MAX_PAGES,
): Observable<T[]> {
  return fetchPage(1, pageSize).pipe(
    expand((page) => {
      const rows = page.data?.length ?? 0;
      const next = (page.pageIndex || 1) + 1;
      // Detect a server-side page-size cap: if we asked for 200 but the
      // backend honoured only 50, treat 50 as the threshold for a "short"
      // (i.e. last) page — otherwise we'd see 50 < 200, declare ourselves
      // done, and silently drop everything after row 50.
      const serverPageSize = page.pageSize > 0 ? page.pageSize : pageSize;
      const effectiveSize = Math.min(pageSize, serverPageSize);
      // When `count` is reported, trust it: keep going until we've accumulated
      // every row the server says exists — even if a single page came back
      // short due to a server quirk.
      const haveMoreByCount =
        page.count > 0 && (page.pageIndex || 1) * effectiveSize < page.count;
      const lastPageReached =
        rows === 0 ||
        next > maxPages ||
        (page.totalPages > 0 && next > page.totalPages) ||
        (!haveMoreByCount && rows < effectiveSize);
      return lastPageReached ? EMPTY : fetchPage(next, effectiveSize);
    }),
    reduce((acc, page) => acc.concat(page.data ?? []), [] as T[]),
  );
}
