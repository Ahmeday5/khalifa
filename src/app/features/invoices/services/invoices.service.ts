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
import { toList } from '../../../core/utils/api-list.util';
import {
  ConfirmPurchaseInvoicePayload,
  CreatePurchaseInvoicePayload,
  PayInvoicePayload,
  PurchaseInvoice,
  PurchaseInvoiceFilters,
  PurchaseInvoiceListItem,
  PurchaseInvoiceSummary,
  UpdatePurchaseInvoicePayload,
} from '../models/invoice.model';

const INVOICES_CACHE_KEY = 'supplier-purchase-invoices';
const INVOICES_TTL_MS = 60 * 1000; // 1 min — list/summary churn with each save

// Invoice confirmation and payments pull money out of a treasury — any
// write that touches a treasury balance must also bust the treasury cache
// so the treasury page reflects the change immediately.
const TREASURY_CACHE_KEY = 'treasur';

@Injectable({ providedIn: 'root' })
export class InvoicesService {
  private readonly api = inject(ApiService);

  // ─────────── reads ───────────

  list(filters: PurchaseInvoiceFilters = {}): Observable<PurchaseInvoiceListItem[]> {
    return this.api
      .get<unknown>(API_ENDPOINTS.purchaseInvoices.base, {
        params: {
          search: filters.search ?? '',
          status: filters.status ?? '',
          supplierId: filters.supplierId ?? '',
        },
        context: withCache({ ttlMs: INVOICES_TTL_MS }),
      })
      .pipe(toList<PurchaseInvoiceListItem>());
  }

  refreshList(filters: PurchaseInvoiceFilters = {}): Observable<PurchaseInvoiceListItem[]> {
    return this.api
      .get<unknown>(API_ENDPOINTS.purchaseInvoices.base, {
        params: {
          search: filters.search ?? '',
          status: filters.status ?? '',
          supplierId: filters.supplierId ?? '',
        },
        context: withCacheBypass(withCache({ ttlMs: INVOICES_TTL_MS })),
      })
      .pipe(toList<PurchaseInvoiceListItem>());
  }

  getSummary(): Observable<PurchaseInvoiceSummary> {
    return this.api.get<PurchaseInvoiceSummary>(
      API_ENDPOINTS.purchaseInvoices.summary,
      { context: withCache({ ttlMs: INVOICES_TTL_MS }) },
    );
  }

  getById(id: number): Observable<PurchaseInvoice> {
    return this.api.get<PurchaseInvoice>(
      API_ENDPOINTS.purchaseInvoices.byId(id),
      { context: withCache({ ttlMs: INVOICES_TTL_MS }) },
    );
  }

  // ─────────── writes ───────────

  create(payload: CreatePurchaseInvoicePayload): Observable<PurchaseInvoice> {
    return this.api.post<PurchaseInvoice>(
      API_ENDPOINTS.purchaseInvoices.base,
      payload,
      {
        context: withInlineHandling(
          withCacheInvalidate([INVOICES_CACHE_KEY]),
        ),
      },
    );
  }

  update(
    id: number,
    payload: UpdatePurchaseInvoicePayload,
  ): Observable<PurchaseInvoice> {
    return this.api.put<PurchaseInvoice>(
      API_ENDPOINTS.purchaseInvoices.byId(id),
      payload,
      {
        context: withInlineHandling(
          withCacheInvalidate([INVOICES_CACHE_KEY]),
        ),
      },
    );
  }

  confirm(
    id: number,
    payload: ConfirmPurchaseInvoicePayload,
  ): Observable<PurchaseInvoice> {
    return this.api.post<PurchaseInvoice>(
      API_ENDPOINTS.purchaseInvoices.confirm(id),
      payload,
      {
        context: withInlineHandling(
          withCacheInvalidate([INVOICES_CACHE_KEY, TREASURY_CACHE_KEY]),
        ),
      },
    );
  }

  /**
   * Records a partial or full payment against a non-Draft invoice.
   * Returns the updated invoice (with new paidAmount / remainingAmount / status).
   * Invalidates both invoice and treasury caches — payment reduces the
   * treasury balance, so the treasury page must re-fetch immediately.
   */
  pay(id: number, payload: PayInvoicePayload): Observable<PurchaseInvoice> {
    return this.api.post<PurchaseInvoice>(
      API_ENDPOINTS.purchaseInvoices.payments(id),
      payload,
      {
        context: withInlineHandling(
          withCacheInvalidate([INVOICES_CACHE_KEY, TREASURY_CACHE_KEY]),
        ),
      },
    );
  }

  /**
   * POST /dashboard/supplier-purchase-invoices/{id}/return
   *
   * Returns / cancels a purchase invoice. The backend rejects this when
   * any payment has already been recorded against the invoice — surface
   * the `message` from the 400 response verbatim.
   */
  returnInvoice(id: number): Observable<{ message: string }> {
    return this.api.post<{ message: string }>(
      API_ENDPOINTS.purchaseInvoices.return(id),
      {},
      {
        context: withInlineHandling(
          withCacheInvalidate([INVOICES_CACHE_KEY, TREASURY_CACHE_KEY, 'warehous']),
        ),
      },
    );
  }
}
