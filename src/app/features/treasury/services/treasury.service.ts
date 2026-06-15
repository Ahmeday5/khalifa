import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Treasury,
  CreateTreasuryPayload,
  UpdateTreasuryPayload,
  CreateTreasuryTransferPayload,
  TreasuryTransfer,
  TreasuryTransfersQuery,
  TreasuryOperation,
  TreasuryOperationsQuery,
  MonthlyProfit,
} from '../models/treasury.model';
import { PagedResponse } from '../../../core/models/api-response.model';
import { ApiService } from '../../../core/services/api.service';
import { API_ENDPOINTS } from '../../../core/constants/api-endpoints.const';
import {
  withCache,
  withCacheBypass,
  withCacheInvalidate,
  withInlineHandling,
} from '../../../core/http/http-context.tokens';
import { toList, toPaged } from '../../../core/utils/api-list.util';
import { LookupItem } from '../../../core/models/lookup.model';

const TREASURY_CACHE_KEY = 'treasur';
const TREASURY_TTL_MS = 15 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class TreasuryService {
  private readonly api = inject(ApiService);

  list(): Observable<Treasury[]> {
    return this.api
      .get<unknown>(API_ENDPOINTS.treasuries.base, {
        context: withCache({ ttlMs: TREASURY_TTL_MS }),
      })
      .pipe(toList<Treasury>());
  }

  /** Force-refresh the list, bypassing any cached entry. */
  refreshList(): Observable<Treasury[]> {
    return this.api
      .get<unknown>(API_ENDPOINTS.treasuries.base, {
        context: withCacheBypass(withCache({ ttlMs: TREASURY_TTL_MS })),
      })
      .pipe(toList<Treasury>());
  }
  

  lookup(): Observable<LookupItem[]> {
    return this.api
      .get<unknown>(API_ENDPOINTS.treasuries.lookup, {
        context: withCache({ ttlMs: TREASURY_TTL_MS }),
      })
      .pipe(toList<LookupItem>());
  }

  getById(id: number): Observable<Treasury> {
    return this.api.get<Treasury>(API_ENDPOINTS.treasuries.byId(id), {
      context: withCache({ ttlMs: TREASURY_TTL_MS }),
    });
  }

  create(payload: CreateTreasuryPayload): Observable<Treasury> {
    return this.api.post<Treasury>(API_ENDPOINTS.treasuries.base, payload, {
      context: withInlineHandling(withCacheInvalidate([TREASURY_CACHE_KEY])),
    });
  }

  update(id: number, payload: UpdateTreasuryPayload): Observable<Treasury> {
    return this.api.put<Treasury>(API_ENDPOINTS.treasuries.byId(id), payload, {
      context: withInlineHandling(withCacheInvalidate([TREASURY_CACHE_KEY])),
    });
  }

  delete(id: number): Observable<{ message: string }> {
    return this.api.delete<{ message: string }>(
      API_ENDPOINTS.treasuries.byId(id),
      {
        context: withCacheInvalidate([TREASURY_CACHE_KEY]),
      },
    );
  }

  // ─────────────── transfers ───────────────

  listTransfers(
    query: TreasuryTransfersQuery = {},
  ): Observable<PagedResponse<TreasuryTransfer>> {
    return this.api
      .get<unknown>(API_ENDPOINTS.treasuries.transfers, {
        params: this.toTransferParams(query),
        context: withCache({ ttlMs: TREASURY_TTL_MS }),
      })
      .pipe(toPaged<TreasuryTransfer>());
  }

  refreshTransfers(
    query: TreasuryTransfersQuery = {},
  ): Observable<PagedResponse<TreasuryTransfer>> {
    return this.api
      .get<unknown>(API_ENDPOINTS.treasuries.transfers, {
        params: this.toTransferParams(query),
        context: withCacheBypass(withCache({ ttlMs: TREASURY_TTL_MS })),
      })
      .pipe(toPaged<TreasuryTransfer>());
  }

  /**
   * Records a money movement between two treasuries. Invalidates the
   * `treasury` cache scope so balances on every page re-fetch.
   */
  createTransfer(
    payload: CreateTreasuryTransferPayload,
  ): Observable<TreasuryTransfer> {
    return this.api.post<TreasuryTransfer>(
      API_ENDPOINTS.treasuries.transfers,
      payload,
      {
        context: withInlineHandling(withCacheInvalidate([TREASURY_CACHE_KEY])),
      },
    );
  }

  private toTransferParams(
    query: TreasuryTransfersQuery,
  ): Record<string, unknown> {
    return {
      PageIndex: query.pageIndex ?? 1,
      PageSize: query.pageSize ?? 10,
      fromTreasuryId: query.fromTreasuryId || undefined,
      toTreasuryId: query.toTreasuryId || undefined,
      from: query.from || undefined,
      to: query.to || undefined,
    };
  }

  // ─────────────── operations ───────────────

  listOperations(
    query: TreasuryOperationsQuery = {},
  ): Observable<PagedResponse<TreasuryOperation>> {
    return this.api
      .get<unknown>(API_ENDPOINTS.treasuries.operations, {
        params: this.toOperationsParams(query),
        context: withCache({ ttlMs: TREASURY_TTL_MS }),
      })
      .pipe(toPaged<TreasuryOperation>());
  }

  refreshOperations(
    query: TreasuryOperationsQuery = {},
  ): Observable<PagedResponse<TreasuryOperation>> {
    return this.api
      .get<unknown>(API_ENDPOINTS.treasuries.operations, {
        params: this.toOperationsParams(query),
        context: withCacheBypass(withCache({ ttlMs: TREASURY_TTL_MS })),
      })
      .pipe(toPaged<TreasuryOperation>());
  }

  private toOperationsParams(
    query: TreasuryOperationsQuery,
  ): Record<string, unknown> {
    return {
      PageIndex: query.pageIndex ?? 1,
      PageSize: query.pageSize ?? 10,
      treasuryId: query.treasuryId || undefined,
      from: query.from || undefined,
      to: query.to || undefined,
    };
  }

  // ─────────────── monthly profits ───────────────

  listMonthlyProfits(year?: number): Observable<MonthlyProfit[]> {
    return this.api
      .get<unknown>(API_ENDPOINTS.treasuries.monthlyProfits, {
        params: year ? { year } : {},
        context: withCache({ ttlMs: TREASURY_TTL_MS }),
      })
      .pipe(toList<MonthlyProfit>());
  }

  refreshMonthlyProfits(year?: number): Observable<MonthlyProfit[]> {
    return this.api
      .get<unknown>(API_ENDPOINTS.treasuries.monthlyProfits, {
        params: year ? { year } : {},
        context: withCacheBypass(withCache({ ttlMs: TREASURY_TTL_MS })),
      })
      .pipe(toList<MonthlyProfit>());
  }
}
