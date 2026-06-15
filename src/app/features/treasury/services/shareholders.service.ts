import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { API_ENDPOINTS } from '../../../core/constants/api-endpoints.const';
import { PagedResponse } from '../../../core/models/api-response.model';
import {
  withCache,
  withCacheBypass,
  withCacheInvalidate,
  withInlineHandling,
  withSkipLoader,
} from '../../../core/http/http-context.tokens';
import { toPaged } from '../../../core/utils/api-list.util';
import {
  CreateShareholderPayload,
  Shareholder,
  ShareholdersQuery,
  UpdateShareholderPayload,
} from '../models/shareholder.model';
import {
  CreateProfitSettlementPayload,
  ProfitSettlement,
  ProfitSettlementPreview,
  ProfitSettlementRow,
  ProfitSettlementsQuery,
} from '../models/profit-settlement.model';
import {
  CapitalizeAllProfitsPayload,
  CapitalizeProfitPayload,
  CapitalTransaction,
  CapitalTransactionsQuery,
  CreateCapitalTransactionPayload,
} from '../models/capital-transaction.model';
import {
  ShareholderStatement,
  StatementQuery,
} from '../models/shareholder-statement.model';
import {
  CompanyProfitStatement,
  CompanyProfitStatementQuery,
} from '../models/company-profit-statement.model';

/**
 * A shareholder's contribution moves capital-treasury money and recomputes
 * every partner's `ownedPercentage`, so writes invalidate both the
 * shareholders list and the treasury scope — balances refetch everywhere.
 */
const SHAREHOLDERS_CACHE_KEY = 'shareholder';
const TREASURY_CACHE_KEY = 'treasur';

/** Short TTL: ownership percentages shift whenever any partner is added/removed. */
const SHAREHOLDERS_TTL_MS = 60 * 1000;

@Injectable({ providedIn: 'root' })
export class ShareholdersService {
  private readonly api = inject(ApiService);

  list(query: ShareholdersQuery = {}): Observable<PagedResponse<Shareholder>> {
    return this.api
      .get<unknown>(API_ENDPOINTS.shareholders.base, {
        params: this.toParams(query),
        context: withCache({ ttlMs: SHAREHOLDERS_TTL_MS }),
      })
      .pipe(toPaged<Shareholder>());
  }

  /** User-driven refresh — bypasses the in-memory cache. */
  refresh(query: ShareholdersQuery = {}): Observable<PagedResponse<Shareholder>> {
    return this.api
      .get<unknown>(API_ENDPOINTS.shareholders.base, {
        params: this.toParams(query),
        context: withCacheBypass(withCache({ ttlMs: SHAREHOLDERS_TTL_MS })),
      })
      .pipe(toPaged<Shareholder>());
  }

  getById(id: number): Observable<Shareholder> {
    return this.api.get<Shareholder>(API_ENDPOINTS.shareholders.byId(id), {
      context: withCache({ ttlMs: SHAREHOLDERS_TTL_MS }),
    });
  }

  create(payload: CreateShareholderPayload): Observable<Shareholder> {
    return this.api.post<Shareholder>(
      API_ENDPOINTS.shareholders.base,
      payload,
      {
        context: withInlineHandling(
          withCacheInvalidate([SHAREHOLDERS_CACHE_KEY, TREASURY_CACHE_KEY]),
        ),
      },
    );
  }

  update(
    id: number,
    payload: UpdateShareholderPayload,
  ): Observable<Shareholder> {
    return this.api.put<Shareholder>(
      API_ENDPOINTS.shareholders.byId(id),
      payload,
      {
        context: withInlineHandling(
          withCacheInvalidate([SHAREHOLDERS_CACHE_KEY, TREASURY_CACHE_KEY]),
        ),
      },
    );
  }

  delete(id: number): Observable<{ message: string }> {
    return this.api.delete<{ message: string }>(
      API_ENDPOINTS.shareholders.byId(id),
      {
        context: withInlineHandling(
          withCacheInvalidate([SHAREHOLDERS_CACHE_KEY, TREASURY_CACHE_KEY]),
        ),
      },
    );
  }

  private toParams(query: ShareholdersQuery): Record<string, unknown> {
    return {
      PageIndex: query.pageIndex ?? 1,
      PageSize: query.pageSize ?? 10,
      search: query.search?.trim() || undefined,
    };
  }

  // ─────────────── profit settlements ───────────────

  /**
   * Dry-run of the next distribution. Never cached (it must reflect the live
   * profits balance) and runs without the global loader so the modal can show
   * its own spinner.
   */
  previewSettlement(): Observable<ProfitSettlementPreview> {
    return this.api.get<ProfitSettlementPreview>(
      API_ENDPOINTS.shareholders.profitSettlementPreview,
      { context: withSkipLoader() },
    );
  }

  /**
   * Executes the distribution: drains the profits treasury and issues a
   * payment voucher per shareholder. Invalidates shareholders (profit totals)
   * and treasury (balances + vouchers) scopes.
   */
  settleProfits(
    payload: CreateProfitSettlementPayload,
  ): Observable<ProfitSettlement> {
    return this.api.post<ProfitSettlement>(
      API_ENDPOINTS.shareholders.profitSettlement,
      payload,
      {
        context: withInlineHandling(
          withCacheInvalidate([SHAREHOLDERS_CACHE_KEY, TREASURY_CACHE_KEY]),
        ),
      },
    );
  }

  listSettlements(
    query: ProfitSettlementsQuery = {},
  ): Observable<PagedResponse<ProfitSettlementRow>> {
    return this.api
      .get<unknown>(API_ENDPOINTS.shareholders.profitSettlements, {
        params: this.toSettlementParams(query),
        context: withCache({ ttlMs: SHAREHOLDERS_TTL_MS }),
      })
      .pipe(toPaged<ProfitSettlementRow>());
  }

  refreshSettlements(
    query: ProfitSettlementsQuery = {},
  ): Observable<PagedResponse<ProfitSettlementRow>> {
    return this.api
      .get<unknown>(API_ENDPOINTS.shareholders.profitSettlements, {
        params: this.toSettlementParams(query),
        context: withCacheBypass(withCache({ ttlMs: SHAREHOLDERS_TTL_MS })),
      })
      .pipe(toPaged<ProfitSettlementRow>());
  }

  getSettlement(id: number): Observable<ProfitSettlement> {
    return this.api.get<ProfitSettlement>(
      API_ENDPOINTS.shareholders.profitSettlementById(id),
      { context: withCache({ ttlMs: SHAREHOLDERS_TTL_MS }) },
    );
  }

  private toSettlementParams(
    query: ProfitSettlementsQuery,
  ): Record<string, unknown> {
    return {
      PageIndex: query.pageIndex ?? 1,
      PageSize: query.pageSize ?? 10,
    };
  }

  // ─────────────── capital movements ───────────────

  /**
   * Rolls part of a shareholder's accrued profit into their capital, drawn from
   * the profits treasury. Changes both the partner's capital/profit figures and
   * the profits-treasury balance, so it invalidates both scopes.
   */
  capitalizeProfit(
    shareholderId: number,
    payload: CapitalizeProfitPayload,
  ): Observable<CapitalTransaction> {
    return this.api.post<CapitalTransaction>(
      API_ENDPOINTS.shareholders.capitalizeProfit(shareholderId),
      payload,
      {
        context: withInlineHandling(
          withCacheInvalidate([SHAREHOLDERS_CACHE_KEY, TREASURY_CACHE_KEY]),
        ),
      },
    );
  }

  /**
   * Rolls every shareholder's AccruedProfit into their capital in one shot.
   * Invalidates both shareholders and treasury scopes (balances + percentages shift).
   */
  capitalizeAllProfits(
    payload: CapitalizeAllProfitsPayload,
  ): Observable<{ message: string }> {
    return this.api.post<{ message: string }>(
      API_ENDPOINTS.shareholders.capitalizeAllProfits,
      payload,
      {
        context: withInlineHandling(
          withCacheInvalidate([SHAREHOLDERS_CACHE_KEY, TREASURY_CACHE_KEY]),
        ),
      },
    );
  }

  /**
   * Records a deposit (`Receipt`) or withdrawal (`Payment`) against a
   * shareholder's capital, moving money in/out of the chosen treasury.
   * Recomputes every partner's ownership %, so both scopes are invalidated.
   */
  createCapitalTransaction(
    shareholderId: number,
    payload: CreateCapitalTransactionPayload,
  ): Observable<CapitalTransaction> {
    return this.api.post<CapitalTransaction>(
      API_ENDPOINTS.shareholders.capitalTransactions(shareholderId),
      payload,
      {
        context: withInlineHandling(
          withCacheInvalidate([SHAREHOLDERS_CACHE_KEY, TREASURY_CACHE_KEY]),
        ),
      },
    );
  }

  listCapitalTransactions(
    shareholderId: number,
    query: CapitalTransactionsQuery = {},
  ): Observable<PagedResponse<CapitalTransaction>> {
    return this.api
      .get<unknown>(API_ENDPOINTS.shareholders.capitalTransactions(shareholderId), {
        params: this.toCapitalTxParams(query),
        context: withCache({ ttlMs: SHAREHOLDERS_TTL_MS }),
      })
      .pipe(toPaged<CapitalTransaction>());
  }

  refreshCapitalTransactions(
    shareholderId: number,
    query: CapitalTransactionsQuery = {},
  ): Observable<PagedResponse<CapitalTransaction>> {
    return this.api
      .get<unknown>(API_ENDPOINTS.shareholders.capitalTransactions(shareholderId), {
        params: this.toCapitalTxParams(query),
        context: withCacheBypass(withCache({ ttlMs: SHAREHOLDERS_TTL_MS })),
      })
      .pipe(toPaged<CapitalTransaction>());
  }

  private toCapitalTxParams(
    query: CapitalTransactionsQuery,
  ): Record<string, unknown> {
    return {
      PageIndex: query.pageIndex ?? 1,
      PageSize: query.pageSize ?? 10,
    };
  }

  // ─────────────── shareholder statement ───────────────

  getStatement(
    shareholderId: number,
    query: StatementQuery = {},
  ): Observable<ShareholderStatement> {
    return this.api.get<ShareholderStatement>(
      API_ENDPOINTS.shareholders.statement(shareholderId),
      {
        params: this.toStatementParams(query),
        context: withCache({ ttlMs: SHAREHOLDERS_TTL_MS }),
      },
    );
  }

  refreshStatement(
    shareholderId: number,
    query: StatementQuery = {},
  ): Observable<ShareholderStatement> {
    return this.api.get<ShareholderStatement>(
      API_ENDPOINTS.shareholders.statement(shareholderId),
      {
        params: this.toStatementParams(query),
        context: withCacheBypass(withCache({ ttlMs: SHAREHOLDERS_TTL_MS })),
      },
    );
  }

  private toStatementParams(query: StatementQuery): Record<string, unknown> {
    return {
      PageIndex: query.pageIndex ?? 1,
      PageSize: query.pageSize ?? 10,
      ...(query.fromDate ? { fromDate: query.fromDate } : {}),
      ...(query.toDate ? { toDate: query.toDate } : {}),
    };
  }

  // ─────────────── company profit statement ───────────────

  getCompanyProfitStatement(
    query: CompanyProfitStatementQuery = {},
  ): Observable<CompanyProfitStatement> {
    return this.api.get<CompanyProfitStatement>(
      API_ENDPOINTS.shareholders.companyProfitStatement,
      {
        params: this.toCompanyStatementParams(query),
        context: withCache({ ttlMs: SHAREHOLDERS_TTL_MS }),
      },
    );
  }

  refreshCompanyProfitStatement(
    query: CompanyProfitStatementQuery = {},
  ): Observable<CompanyProfitStatement> {
    return this.api.get<CompanyProfitStatement>(
      API_ENDPOINTS.shareholders.companyProfitStatement,
      {
        params: this.toCompanyStatementParams(query),
        context: withCacheBypass(withCache({ ttlMs: SHAREHOLDERS_TTL_MS })),
      },
    );
  }

  private toCompanyStatementParams(
    query: CompanyProfitStatementQuery,
  ): Record<string, unknown> {
    return {
      PageIndex: query.pageIndex ?? 1,
      PageSize: query.pageSize ?? 10,
      ...(query.fromDate ? { fromDate: query.fromDate } : {}),
      ...(query.toDate ? { toDate: query.toDate } : {}),
    };
  }
}
