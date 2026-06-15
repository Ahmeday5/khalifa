import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { API_ENDPOINTS } from '../../../core/constants/api-endpoints.const';
import { PagedResponse } from '../../../core/models/api-response.model';
import {
  withCache,
  withCacheBypass,
  withCacheInvalidate,
  withInlineHandling,
} from '../../../core/http/http-context.tokens';
import { asPaged, toPaged } from '../../../core/utils/api-list.util';
import {
  CreateSubAccountVoucherPayload,
  SubAccount,
  SubAccountPayload,
  SubAccountStatement,
  SubAccountStatementQuery,
  SubAccountsQuery,
  SubAccountVoucher,
  SubAccountVouchersQuery,
} from '../models/sub-account.model';

/**
 * Every write (account CRUD, voucher) recomputes a sub-account balance, so it
 * invalidates the single `sub-account` scope — lists, the all-vouchers log and
 * any open statement all refetch. Sub-accounts are self-contained ledgers, so
 * the company `treasury` scope is intentionally left untouched.
 */
const SUB_ACCOUNTS_CACHE_KEY = 'sub-account';

/** Short TTL: balances move on every receipt/payment. */
const SUB_ACCOUNTS_TTL_MS = 60 * 1000;

@Injectable({ providedIn: 'root' })
export class SubAccountsService {
  private readonly api = inject(ApiService);

  // ─────────────── accounts ───────────────

  list(query: SubAccountsQuery = {}): Observable<PagedResponse<SubAccount>> {
    return this.api
      .get<unknown>(API_ENDPOINTS.subAccounts.base, {
        params: this.toListParams(query),
        context: withCache({ ttlMs: SUB_ACCOUNTS_TTL_MS }),
      })
      .pipe(toPaged<SubAccount>());
  }

  /** User-driven refresh — bypasses the in-memory cache. */
  refresh(query: SubAccountsQuery = {}): Observable<PagedResponse<SubAccount>> {
    return this.api
      .get<unknown>(API_ENDPOINTS.subAccounts.base, {
        params: this.toListParams(query),
        context: withCacheBypass(withCache({ ttlMs: SUB_ACCOUNTS_TTL_MS })),
      })
      .pipe(toPaged<SubAccount>());
  }

  getById(id: number): Observable<SubAccount> {
    return this.api.get<SubAccount>(API_ENDPOINTS.subAccounts.byId(id), {
      context: withCache({ ttlMs: SUB_ACCOUNTS_TTL_MS }),
    });
  }

  create(payload: SubAccountPayload): Observable<SubAccount> {
    return this.api.post<SubAccount>(API_ENDPOINTS.subAccounts.base, payload, {
      context: withInlineHandling(
        withCacheInvalidate([SUB_ACCOUNTS_CACHE_KEY]),
      ),
    });
  }

  update(id: number, payload: SubAccountPayload): Observable<SubAccount> {
    return this.api.put<SubAccount>(
      API_ENDPOINTS.subAccounts.byId(id),
      payload,
      {
        context: withInlineHandling(
          withCacheInvalidate([SUB_ACCOUNTS_CACHE_KEY]),
        ),
      },
    );
  }

  // ─────────────── vouchers ───────────────

  /** Records a receipt/payment against one sub-account. */
  createVoucher(
    subAccountId: number,
    payload: CreateSubAccountVoucherPayload,
  ): Observable<SubAccountVoucher> {
    return this.api.post<SubAccountVoucher>(
      API_ENDPOINTS.subAccounts.vouchers(subAccountId),
      payload,
      {
        context: withInlineHandling(
          withCacheInvalidate([SUB_ACCOUNTS_CACHE_KEY]),
        ),
      },
    );
  }

  listVouchers(
    query: SubAccountVouchersQuery = {},
  ): Observable<PagedResponse<SubAccountVoucher>> {
    return this.api
      .get<unknown>(API_ENDPOINTS.subAccounts.allVouchers, {
        params: this.toVoucherParams(query),
        context: withCache({ ttlMs: SUB_ACCOUNTS_TTL_MS }),
      })
      .pipe(toPaged<SubAccountVoucher>());
  }

  refreshVouchers(
    query: SubAccountVouchersQuery = {},
  ): Observable<PagedResponse<SubAccountVoucher>> {
    return this.api
      .get<unknown>(API_ENDPOINTS.subAccounts.allVouchers, {
        params: this.toVoucherParams(query),
        context: withCacheBypass(withCache({ ttlMs: SUB_ACCOUNTS_TTL_MS })),
      })
      .pipe(toPaged<SubAccountVoucher>());
  }

  // ─────────────── statement ───────────────

  statement(
    id: number,
    query: SubAccountStatementQuery = {},
  ): Observable<SubAccountStatement> {
    return this.api
      .get<unknown>(API_ENDPOINTS.subAccounts.statement(id), {
        params: this.toStatementParams(query),
        context: withCache({ ttlMs: SUB_ACCOUNTS_TTL_MS }),
      })
      .pipe(map((res) => this.toStatement(res)));
  }

  refreshStatement(
    id: number,
    query: SubAccountStatementQuery = {},
  ): Observable<SubAccountStatement> {
    return this.api
      .get<unknown>(API_ENDPOINTS.subAccounts.statement(id), {
        params: this.toStatementParams(query),
        context: withCacheBypass(withCache({ ttlMs: SUB_ACCOUNTS_TTL_MS })),
      })
      .pipe(map((res) => this.toStatement(res)));
  }

  // ─────────────── param + shape mappers ───────────────

  private toListParams(query: SubAccountsQuery): Record<string, unknown> {
    return {
      PageIndex: query.pageIndex ?? 1,
      PageSize: query.pageSize ?? 10,
      search: query.search?.trim() || undefined,
    };
  }

  private toVoucherParams(
    query: SubAccountVouchersQuery,
  ): Record<string, unknown> {
    return {
      PageIndex: query.pageIndex ?? 1,
      PageSize: query.pageSize ?? 10,
      search: query.search?.trim() || undefined,
      type: query.type || undefined,
      subAccountId: query.subAccountId || undefined,
    };
  }

  private toStatementParams(
    query: SubAccountStatementQuery,
  ): Record<string, unknown> {
    return {
      PageIndex: query.pageIndex ?? 1,
      PageSize: query.pageSize ?? 10,
    };
  }

  /** Normalizes the `{ account, vouchers }` envelope, hardening the inner page. */
  private toStatement(res: unknown): SubAccountStatement {
    const body = (res ?? {}) as Partial<SubAccountStatement>;
    return {
      account: (body.account ?? null) as SubAccount,
      vouchers: asPaged<SubAccountVoucher>(body.vouchers),
    };
  }
}
