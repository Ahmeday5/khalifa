import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
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
import { PagedResponse } from '../../../core/models/api-response.model';
import {
  CommissionPayoutPayload,
  CommissionPayoutResult,
  CommissionPayoutRow,
  CommissionPayoutsQuery,
  CreateRepresentativePayload,
  Representative,
  RepresentativeStatement,
  RepresentativeSubTreasury,
  RepresentativesListResponse,
  RepresentativesQuery,
  UpdateRepresentativePayload,
} from '../models/rep.model';

const REPS_CACHE_KEY = 'representatives';
const REPS_TTL_MS = 5 * 60 * 1000;
/** Lookups are tiny and rarely change â€” cache them a touch longer. */
const REPS_LOOKUP_TTL_MS = 10 * 60 * 1000;
const STATEMENT_TTL_MS = 60 * 1000; // 1 min â€” figures move with every payout

@Injectable({ providedIn: 'root' })
export class RepsService {
  private readonly api = inject(ApiService);

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ reads â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  list(
    query: RepresentativesQuery = {},
  ): Observable<RepresentativesListResponse> {
    return this.api.get<RepresentativesListResponse>(
      API_ENDPOINTS.representatives.base,
      {
        params: this.toParams(query),
        context: withCache({ ttlMs: REPS_TTL_MS }),
      },
    );
  }

  refreshList(
    query: RepresentativesQuery = {},
  ): Observable<RepresentativesListResponse> {
    return this.api.get<RepresentativesListResponse>(
      API_ENDPOINTS.representatives.base,
      {
        params: this.toParams(query),
        context: withCacheBypass(withCache({ ttlMs: REPS_TTL_MS })),
      },
    );
  }

  /**
   * Lightweight `{id,name}` list for the "representative" picker. The
   * backend scopes it by role (an Admin gets everyone; a Representative
   * gets only themselves) so the result is used verbatim.
   */
  lookup(): Observable<LookupItem[]> {
    return this.api
      .get<unknown>(API_ENDPOINTS.representatives.lookup, {
        context: withCache({ ttlMs: REPS_LOOKUP_TTL_MS }),
      })
      .pipe(toList<LookupItem>());
  }

  getById(id: number): Observable<Representative> {
    return this.api.get<Representative>(
      API_ENDPOINTS.representatives.byId(id),
      { context: withCache({ ttlMs: REPS_TTL_MS }) },
    );
  }

  /** Per-representative sub-treasury balances + accumulated commission. */
  subTreasuries(): Observable<RepresentativeSubTreasury[]> {
    return this.api
      .get<unknown>(API_ENDPOINTS.representatives.subTreasuries, {
        context: withCache({ ttlMs: REPS_TTL_MS }),
      })
      .pipe(toList<RepresentativeSubTreasury>());
  }

  /** Force-refresh sub-treasuries, bypassing any cached entry. */
  refreshSubTreasuries(): Observable<RepresentativeSubTreasury[]> {
    return this.api
      .get<unknown>(API_ENDPOINTS.representatives.subTreasuries, {
        context: withCacheBypass(withCache({ ttlMs: REPS_TTL_MS })),
      })
      .pipe(toList<RepresentativeSubTreasury>());
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ account statement â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /** Admin: full account statement for a specific representative. */
  statement(
    id: number,
    query: CommissionPayoutsQuery = {},
    bypassCache = false,
  ): Observable<RepresentativeStatement> {
    const cache = withCache({ ttlMs: STATEMENT_TTL_MS });
    return this.api.get<RepresentativeStatement>(
      API_ENDPOINTS.representatives.statement(id),
      {
        params: this.toParams(query),
        context: bypassCache ? withCacheBypass(cache) : cache,
      },
    );
  }

  /**
   * Representative: own account statement. The backend forbids this for
   * admins (they use `statement(id)` instead).
   */
  myStatement(
    query: CommissionPayoutsQuery = {},
    bypassCache = false,
  ): Observable<RepresentativeStatement> {
    const cache = withCache({ ttlMs: STATEMENT_TTL_MS });
    return this.api.get<RepresentativeStatement>(
      API_ENDPOINTS.representatives.myStatement,
      {
        params: this.toParams(query),
        context: bypassCache ? withCacheBypass(cache) : cache,
      },
    );
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ commission payouts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /** Admin: paginated history of commission payouts (name-searchable). */
  commissionPayouts(
    query: CommissionPayoutsQuery = {},
    bypassCache = false,
  ): Observable<PagedResponse<CommissionPayoutRow>> {
    const cache = withCache({ ttlMs: STATEMENT_TTL_MS });
    return this.api
      .get<unknown>(API_ENDPOINTS.representatives.commissionPayouts, {
        params: this.toParams(query),
        context: bypassCache ? withCacheBypass(cache) : cache,
      })
      .pipe(toPaged<CommissionPayoutRow>());
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ writes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Admin: pays (part of) a representative's outstanding commission. The
   * backend rejects an `amount` greater than what's owed. Invalidates the
   * representatives + treasury scopes so balances/commission re-fetch.
   */
  payCommission(
    id: number,
    payload: CommissionPayoutPayload,
  ): Observable<CommissionPayoutResult> {
    return this.api.post<CommissionPayoutResult>(
      API_ENDPOINTS.representatives.commissionPayout(id),
      payload,
      {
        context: withInlineHandling(
          withCacheInvalidate([REPS_CACHE_KEY, 'treasur']),
        ),
      },
    );
  }

  create(payload: CreateRepresentativePayload): Observable<Representative> {
    return this.api.post<Representative>(
      API_ENDPOINTS.representatives.base,
      this.normalize(payload),
      {
        context: withInlineHandling(
          withCacheInvalidate([REPS_CACHE_KEY, 'treasur']),
        ),
      },
    );
  }

  update(
    id: number,
    payload: UpdateRepresentativePayload,
  ): Observable<Representative> {
    return this.api.put<Representative>(
      API_ENDPOINTS.representatives.byId(id),
      this.normalize(payload),
      {
        context: withInlineHandling(
          withCacheInvalidate([REPS_CACHE_KEY, 'treasur']),
        ),
      },
    );
  }

  delete(id: number): Observable<{ message: string }> {
    return this.api.delete<{ message: string }>(
      API_ENDPOINTS.representatives.byId(id),
      {
        context: withInlineHandling(
          withCacheInvalidate([REPS_CACHE_KEY, 'treasur']),
        ),
      },
    );
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private toParams(query: RepresentativesQuery): Record<string, unknown> {
    return {
      PageIndex: query.pageIndex ?? 1,
      PageSize: query.pageSize ?? 10,
      search: query.search?.trim() || undefined,
    };
  }

 
  private normalize(
    payload: CreateRepresentativePayload,
  ): CreateRepresentativePayload {
    return {
      fullName: payload.fullName.trim(),
      email: payload.email.trim(),
      password: payload.password,
      phoneNumber: payload.phoneNumber.trim(),
      permissions: payload.permissions,
      profitRatePercent: this.clamp(payload.profitRatePercent, 0, 100),
      performanceRating: this.clamp(payload.performanceRating, 0, 5),
      status: payload.status,
    };
  }

  private clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
  }
}

