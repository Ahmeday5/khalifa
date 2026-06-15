import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { API_ENDPOINTS } from '../../../core/constants/api-endpoints.const';
import {
  withCache,
  withCacheBypass,
  withCacheInvalidate,
  withInlineHandling,
} from '../../../core/http/http-context.tokens';
import { PagedResponse } from '../../../core/models/api-response.model';
import {
  CreateVoucherPayload,
  VoucherDto,
  VouchersQuery,
} from '../models/voucher.model';

/**
 * Creating a voucher moves treasury money, so we invalidate both the
 * vouchers list and the treasury scope — balances on every page refetch.
 */
const VOUCHERS_CACHE_KEYS = ['vouchers', 'treasur'] as const;

/**
 * Vouchers list churns whenever a treasury / invoice / installment payment is
 * recorded — keep the TTL short so users don't see stale rows after a write.
 */
const VOUCHERS_TTL_MS = 60 * 1000;

@Injectable({ providedIn: 'root' })
export class VouchersService {
  private readonly api = inject(ApiService);

  list(query: VouchersQuery = {}): Observable<PagedResponse<VoucherDto>> {
    return this.api.get<PagedResponse<VoucherDto>>(
      API_ENDPOINTS.dashboard.vouchers,
      {
        params: this.toParams(query),
        context: withCache({ ttlMs: VOUCHERS_TTL_MS }),
      },
    );
  }

  /** User-driven refresh — bypasses the in-memory cache. */
  refresh(query: VouchersQuery = {}): Observable<PagedResponse<VoucherDto>> {
    return this.api.get<PagedResponse<VoucherDto>>(
      API_ENDPOINTS.dashboard.vouchers,
      {
        params: this.toParams(query),
        context: withCacheBypass(withCache({ ttlMs: VOUCHERS_TTL_MS })),
      },
    );
  }

  /** Creates a receipt/payment voucher. */
  create(payload: CreateVoucherPayload): Observable<VoucherDto> {
    return this.api.post<VoucherDto>(
      API_ENDPOINTS.dashboard.vouchers,
      payload,
      {
        context: withInlineHandling(
          withCacheInvalidate([...VOUCHERS_CACHE_KEYS]),
        ),
      },
    );
  }

  private toParams(query: VouchersQuery): Record<string, unknown> {
    return {
      PageIndex: query.pageIndex ?? 1,
      PageSize: query.pageSize ?? 10,
      type: query.type || undefined,
      referenceType: query.referenceType || undefined,
      relatedPartyType: query.relatedPartyType || undefined,
      search: query.search?.trim() || undefined,
    };
  }
}
