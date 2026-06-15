import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import {
  CreateWarehousePayload,
  UpdateWarehousePayload,
  Warehouse,
  WarehouseInventoryItem,
  WarehouseInventoryQuery,
  WarehouseSummary,
} from '../models/warehouse.model';
import { ApiService } from '../../../core/services/api.service';
import { API_ENDPOINTS } from '../../../core/constants/api-endpoints.const';
import { PagedResponse } from '../../../core/models/api-response.model';
import {
  withCache,
  withCacheBypass,
  withCacheInvalidate,
  withInlineHandling,
} from '../../../core/http/http-context.tokens';
import { toList } from '../../../core/utils/api-list.util';
import { LookupItem } from '../../../core/models/lookup.model';

const WAREHOUSE_CACHE_KEY = 'warehouse';
const WAREHOUSE_TTL_MS = 15 * 60 * 1000; // 15 minutes

@Injectable({ providedIn: 'root' })
export class WarehouseService {
  private readonly api = inject(ApiService);

  // ─────────────────────────────────────────────────────────────────
  //  Live API — /dashboard/warehouses
  // ─────────────────────────────────────────────────────────────────

  list(): Observable<Warehouse[]> {
    return this.api
      .get<unknown>(API_ENDPOINTS.warehouses.base, {
        context: withCache({ ttlMs: WAREHOUSE_TTL_MS }),
      })
      .pipe(toList<Warehouse>());
  }

  /** Force-refresh the list, bypassing any cached entry. */
  refreshList(): Observable<Warehouse[]> {
    return this.api
      .get<unknown>(API_ENDPOINTS.warehouses.base, {
        context: withCacheBypass(withCache({ ttlMs: WAREHOUSE_TTL_MS })),
      })
      .pipe(toList<Warehouse>());
  }

  /** Lightweight `{id,name}` list for the warehouse picker. */
  lookup(): Observable<LookupItem[]> {
    return this.api
      .get<unknown>(API_ENDPOINTS.warehouses.lookup, {
        context: withCache({ ttlMs: WAREHOUSE_TTL_MS }),
      })
      .pipe(toList<LookupItem>());
  }

  getById(id: number): Observable<Warehouse> {
    return this.api.get<Warehouse>(API_ENDPOINTS.warehouses.byId(id), {
      context: withCache({ ttlMs: WAREHOUSE_TTL_MS }),
    });
  }

  create(payload: CreateWarehousePayload): Observable<Warehouse> {
    return this.api.post<Warehouse>(API_ENDPOINTS.warehouses.base, payload, {
      context: withInlineHandling(withCacheInvalidate([WAREHOUSE_CACHE_KEY])),
    });
  }

  update(id: number, payload: UpdateWarehousePayload): Observable<Warehouse> {
    return this.api.put<Warehouse>(
      API_ENDPOINTS.warehouses.byId(id),
      payload,
      {
        context: withInlineHandling(withCacheInvalidate([WAREHOUSE_CACHE_KEY])),
      },
    );
  }

  delete(id: number): Observable<{ message: string }> {
    return this.api.delete<{ message: string }>(
      API_ENDPOINTS.warehouses.byId(id),
      {
        context: withCacheInvalidate([WAREHOUSE_CACHE_KEY]),
      },
    );
  }

  // ─────────────────────────────────────────────────────────────────
  //  Live API — /dashboard/warehouses/summary
  //  Each row is a warehouse plus aggregate stock + value stats.
  // ─────────────────────────────────────────────────────────────────

  summary(): Observable<WarehouseSummary[]> {
    return this.api
      .get<unknown>(API_ENDPOINTS.warehouses.summary, {
        context: withCache({ ttlMs: WAREHOUSE_TTL_MS }),
      })
      .pipe(toList<WarehouseSummary>());
  }

  refreshSummary(): Observable<WarehouseSummary[]> {
    return this.api
      .get<unknown>(API_ENDPOINTS.warehouses.summary, {
        context: withCacheBypass(withCache({ ttlMs: WAREHOUSE_TTL_MS })),
      })
      .pipe(toList<WarehouseSummary>());
  }

  // ─────────────────────────────────────────────────────────────────
  //  Live API — /dashboard/warehouses/inventory
  //  Per-warehouse paginated inventory rows (with name search).
  // ─────────────────────────────────────────────────────────────────

  inventory(
    query: WarehouseInventoryQuery,
  ): Observable<PagedResponse<WarehouseInventoryItem>> {
    return this.api.get<PagedResponse<WarehouseInventoryItem>>(
      API_ENDPOINTS.warehouses.inventory,
      {
        params: this.toInventoryParams(query),
        context: withCache({ ttlMs: WAREHOUSE_TTL_MS }),
      },
    );
  }

  refreshInventory(
    query: WarehouseInventoryQuery,
  ): Observable<PagedResponse<WarehouseInventoryItem>> {
    return this.api.get<PagedResponse<WarehouseInventoryItem>>(
      API_ENDPOINTS.warehouses.inventory,
      {
        params: this.toInventoryParams(query),
        context: withCacheBypass(withCache({ ttlMs: WAREHOUSE_TTL_MS })),
      },
    );
  }

  private toInventoryParams(query: WarehouseInventoryQuery): Record<string, unknown> {
    return {
      warehouseId: query.warehouseId,
      PageIndex: query.pageIndex ?? 1,
      PageSize: query.pageSize ?? 10,
      search: query.search ?? '',
    };
  }
}
