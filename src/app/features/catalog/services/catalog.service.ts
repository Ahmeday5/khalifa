import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '../../../core/services/api.service';
import { API_ENDPOINTS } from '../../../core/constants/api-endpoints.const';
import {
  withCacheBypass,
  withCacheInvalidate,
  withInlineHandling,
  withCache,
} from '../../../core/http/http-context.tokens';
import { PagedResponse } from '../../../core/models/api-response.model';
import { toPaged } from '../../../core/utils/api-list.util';
import {
  ClientOrder,
  ClientOrdersQuery,
  ConvertToContractPayload,
} from '../models/catalog.model';

const CLIENT_ORDERS_CACHE_KEY = 'client-orders';
const CLIENT_ORDERS_TTL_MS = 60 * 1000;
const DEFAULT_PAGE_SIZE = 10;
/**
 * The endpoint has no server-side `Status` filter, so the "pending" badge
 * count is derived by scanning one oversized page. This caps badge accuracy
 * at this many orders — far above any realistic pending backlog, and the
 * full list is still correctly paginated on the page itself.
 */
const PENDING_SCAN_PAGE_SIZE = 500;

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly api = inject(ApiService);

  // ─────────────────────────────────────────────────────────────────
  //  Live API — /dashboard/client-orders
  // ─────────────────────────────────────────────────────────────────

  /** One server-paginated page of client orders. */
  listClientOrders(
    query: ClientOrdersQuery = {},
  ): Observable<PagedResponse<ClientOrder>> {
    return this.api
      .get<unknown>(API_ENDPOINTS.clientOrders.base, {
        params: this.toParams(query),
        context: withCache({ ttlMs: CLIENT_ORDERS_TTL_MS }),
      })
      .pipe(toPaged<ClientOrder>());
  }

  /** Force-refresh a page, bypassing the cache (used after manual reload). */
  refreshClientOrders(
    query: ClientOrdersQuery = {},
  ): Observable<PagedResponse<ClientOrder>> {
    return this.api
      .get<unknown>(API_ENDPOINTS.clientOrders.base, {
        params: this.toParams(query),
        context: withCacheBypass(withCache({ ttlMs: CLIENT_ORDERS_TTL_MS })),
      })
      .pipe(toPaged<ClientOrder>());
  }

  /**
   * Total count of `Pending` orders, for the sidebar/topbar badge.
   *
   * There is no server-side status filter, so we scan a single oversized
   * page and count locally — see {@link PENDING_SCAN_PAGE_SIZE}.
   */
  pendingClientOrdersCount(force = false): Observable<number> {
    const base = withCache({ ttlMs: CLIENT_ORDERS_TTL_MS });
    return this.api
      .get<unknown>(API_ENDPOINTS.clientOrders.base, {
        params: { PageIndex: 1, PageSize: PENDING_SCAN_PAGE_SIZE },
        context: force ? withCacheBypass(base) : base,
      })
      .pipe(
        toPaged<ClientOrder>(),
        map((page) => page.data.filter((o) => o.status === 'Pending').length),
      );
  }

  private toParams(query: ClientOrdersQuery): Record<string, unknown> {
    return {
      PageIndex: query.pageIndex ?? 1,
      PageSize: query.pageSize ?? DEFAULT_PAGE_SIZE,
    };
  }

  rejectClientOrder(id: number): Observable<{ message?: string }> {
    return this.api.post<{ message?: string }>(
      API_ENDPOINTS.clientOrders.reject(id),
      {},
      {
        context: withInlineHandling(
          withCacheInvalidate([CLIENT_ORDERS_CACHE_KEY]),
        ),
      },
    );
  }

  convertClientOrderToContract(
    id: number,
    payload: ConvertToContractPayload,
  ): Observable<unknown> {
    return this.api.post<unknown>(
      API_ENDPOINTS.clientOrders.convertToContract(id),
      payload,
      {
        context: withInlineHandling(
          withCacheInvalidate([CLIENT_ORDERS_CACHE_KEY]),
        ),
      },
    );
  }
}
