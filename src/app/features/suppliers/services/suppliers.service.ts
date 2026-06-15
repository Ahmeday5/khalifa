import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from '../../../core/services/api.service';
import { API_ENDPOINTS } from '../../../core/constants/api-endpoints.const';
import { PagedQuery } from '../../../core/models/api-response.model';
import {
  withCache,
  withCacheBypass,
  withCacheInvalidate,
  withInlineHandling,
} from '../../../core/http/http-context.tokens';
import { asPaged, fetchAllPages, toList } from '../../../core/utils/api-list.util';
import { LookupItem } from '../../../core/models/lookup.model';
import {
  CreateSupplierPayload,
  Supplier,
  SuppliersListResponse,
  SupplierStatement,
  SupplierStatementQuery,
  SupplierPaymentPayload,
  SupplierPaymentResponse,
  UpdateSupplierPayload,
} from '../models/supplier.model';

const SUPPLIERS_CACHE_KEY = 'suppliers';
const SUPPLIERS_TTL_MS = 5 * 60 * 1000; // 5 min — list churns whenever a supplier is added/edited
const STATEMENT_TTL_MS = 60 * 1000; // 1 min — figures move with every payment/draft

@Injectable({ providedIn: 'root' })
export class SuppliersService {
  private readonly api = inject(ApiService);

  // ─────────── reads ───────────

  list(query: PagedQuery = {}): Observable<SuppliersListResponse> {
    return this.api.get<SuppliersListResponse>(API_ENDPOINTS.suppliers.base, {
      params: this.toParams(query),
      context: withCache({ ttlMs: SUPPLIERS_TTL_MS }),
    });
  }

  refreshList(query: PagedQuery = {}): Observable<SuppliersListResponse> {
    return this.api.get<SuppliersListResponse>(API_ENDPOINTS.suppliers.base, {
      params: this.toParams(query),
      context: withCacheBypass(withCache({ ttlMs: SUPPLIERS_TTL_MS })),
    });
  }

  /** Flat list for dropdowns — drains every page. */
  listAll(): Observable<Supplier[]> {
    return fetchAllPages<Supplier>((pageIndex, pageSize) =>
      this.list({ pageIndex, pageSize }).pipe(
        map((res) => asPaged<Supplier>(res?.items)),
      ),
    );
  }

  /**
   * Lightweight `{id,name}` list for the supplier picker. Preferred over
   * {@link listAll} for ID pickers: it's a single role-scoped call (a
   * Representative gets only the suppliers the backend allows) instead of
   * draining the paged `Suppliers.View`-gated list endpoint.
   */
  lookup(): Observable<LookupItem[]> {
    return this.api
      .get<unknown>(API_ENDPOINTS.suppliers.lookup, {
        context: withCache({ ttlMs: SUPPLIERS_TTL_MS }),
      })
      .pipe(toList<LookupItem>());
  }

  getById(id: number): Observable<Supplier> {
    return this.api.get<Supplier>(API_ENDPOINTS.suppliers.byId(id), {
      context: withCache({ ttlMs: SUPPLIERS_TTL_MS }),
    });
  }

  // ─────────── account statement ───────────

  statement(
    id: number,
    query: SupplierStatementQuery = {},
  ): Observable<SupplierStatement> {
    return this.api.get<SupplierStatement>(
      API_ENDPOINTS.suppliers.statement(id),
      {
        params: this.toStatementParams(query),
        context: withCache({ ttlMs: STATEMENT_TTL_MS }),
      },
    );
  }

  /** User-driven refresh — bypasses the in-memory cache. */
  refreshStatement(
    id: number,
    query: SupplierStatementQuery = {},
  ): Observable<SupplierStatement> {
    return this.api.get<SupplierStatement>(
      API_ENDPOINTS.suppliers.statement(id),
      {
        params: this.toStatementParams(query),
        context: withCacheBypass(withCache({ ttlMs: STATEMENT_TTL_MS })),
      },
    );
  }

  private toStatementParams(
    query: SupplierStatementQuery,
  ): Record<string, unknown> {
    return {
      from: query.from || undefined,
      to: query.to || undefined,
      includeDrafts: query.includeDrafts ?? false,
    };
  }

  // ─────────── payments ───────────

  /**
   * Record a direct payment to a supplier (not tied to a specific invoice).
   * POST /dashboard/suppliers/{id}/payments
   */
  pay(
    supplierId: number,
    payload: SupplierPaymentPayload,
  ): Observable<SupplierPaymentResponse> {
    return this.api.post<SupplierPaymentResponse>(
      API_ENDPOINTS.suppliers.payments(supplierId),
      payload,
      {
        context: withInlineHandling(
          withCacheInvalidate([SUPPLIERS_CACHE_KEY, 'treasur', 'financial-separation']),
        ),
      },
    );
  }

  // ─────────── writes ───────────

  create(payload: CreateSupplierPayload): Observable<Supplier> {
    return this.api.post<Supplier>(
      API_ENDPOINTS.suppliers.base,
      this.normalize(payload),
      {
        context: withInlineHandling(
          withCacheInvalidate([SUPPLIERS_CACHE_KEY]),
        ),
      },
    );
  }

  update(id: number, payload: UpdateSupplierPayload): Observable<Supplier> {
    return this.api.put<Supplier>(
      API_ENDPOINTS.suppliers.byId(id),
      this.normalize(payload),
      {
        context: withInlineHandling(
          withCacheInvalidate([SUPPLIERS_CACHE_KEY]),
        ),
      },
    );
  }

  delete(id: number): Observable<{ message: string }> {
    return this.api.delete<{ message: string }>(
      API_ENDPOINTS.suppliers.byId(id),
      {
        context: withInlineHandling(
          withCacheInvalidate([SUPPLIERS_CACHE_KEY]),
        ),
      },
    );
  }

  // ─────────── helpers ───────────

  private toParams(query: PagedQuery): Record<string, unknown> {
    return {
      PageIndex: query.pageIndex ?? 1,
      PageSize: query.pageSize ?? 10,
      search: query.search ?? '',
    };
  }

  private normalize(payload: CreateSupplierPayload): CreateSupplierPayload {
    return {
      fullName: payload.fullName.trim(),
      address: payload.address.trim(),
      phoneNumber: payload.phoneNumber.trim(),
    };
  }
}
