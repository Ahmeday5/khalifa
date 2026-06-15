import { PagedResponse } from '../../../core/models/api-response.model';

/**
 * Supplier as it comes back from the backend. The list endpoint returns
 * the full shape (with purchasing aggregates); the create/update/getById
 * endpoints return only the contact essentials. Aggregate fields are
 * therefore optional so a single interface covers both shapes.
 */
export interface Supplier {
  id: number;
  fullName: string;
  address: string;
  phoneNumber: string;

  // ── server-computed aggregates (list endpoint only) ──
  /** Most-purchased item or short summary of supplied goods. */
  goods?: string | null;
  /** Total units purchased from this supplier across all invoices. */
  quantity?: number;
  /** Average unit price weighted across all invoices. */
  unitPrice?: number;
  /** Sum of all invoice totals for this supplier. */
  totalAmount?: number;
  /** Sum of all amounts paid to this supplier. */
  paidAmount?: number;
  /** Outstanding balance owed to this supplier. */
  remainingAmount?: number;
  /** ISO datetime of the most recent purchase invoice (or `null`). */
  lastSupplyDate?: string | null;
}

/** POST /dashboard/suppliers — only the contact essentials are writable. */
export interface CreateSupplierPayload {
  fullName: string;
  address: string;
  phoneNumber: string;
}

/** PUT /dashboard/suppliers/{id} — same fields as create. */
export type UpdateSupplierPayload = CreateSupplierPayload;

/**
 * Aggregate purchase totals returned alongside the supplier list. They
 * reflect the full filtered set, not just the current page.
 */
export interface SuppliersSummary {
  totalPurchases: number;
  totalPaid: number;
  totalRemaining: number;
}

/**
 * Wire shape for `GET /dashboard/suppliers` after the standard envelope
 * is unwrapped — `summary` next to a paged `items` envelope.
 */
export interface SuppliersListResponse {
  summary: SuppliersSummary;
  items: PagedResponse<Supplier>;
}

// ─────────────────────────────────────────────────────────────────
//  Live API: GET /dashboard/suppliers/{id}/statement
//  Per-supplier account statement with optional date range +
//  `includeDrafts` toggle. Backend reuses purchase-invoice statuses
//  (Draft / Pending / PartiallyPaid / Paid / Confirmed / Cancelled).
// ─────────────────────────────────────────────────────────────────

/** Status values returned on `StatementInvoice`. Mirrors the invoices feature. */
export type SupplierStatementInvoiceStatus =
  | 'Draft'
  | 'Pending'
  | 'PartiallyPaid'
  | 'Paid'
  | 'Confirmed'
  | 'Cancelled';

export interface SupplierStatementQuery {
  /** ISO date (YYYY-MM-DD) — inclusive lower bound. */
  from?: string;
  /** ISO date (YYYY-MM-DD) — inclusive upper bound. */
  to?: string;
  /** Include `Draft` invoices in the response. Defaults to `false` server-side. */
  includeDrafts?: boolean;
}

/** Trimmed supplier projection embedded in the statement payload. */
export interface SupplierStatementParty {
  id: number;
  fullName: string;
  phoneNumber: string;
  address: string;
}

/** Resolved period — `null` on both ends when the request omitted the filter. */
export interface SupplierStatementPeriod {
  from: string | null;
  to: string | null;
}

export interface SupplierStatementSummary {
  invoicesCount: number;
  totalPurchases: number;
  totalPaid: number;
  /** Portion of totalPaid applied directly against invoice balances. */
  invoicePaidTotal: number;
  /** Portion of totalPaid made as standalone supplier payments. */
  standalonePaidTotal: number;
  totalRemaining: number;
  firstSupplyDate: string | null;
  lastSupplyDate: string | null;
}

export interface SupplierStatementItem {
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  lineTotal: number;
}

export interface SupplierStatementInvoice {
  id: number;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  status: SupplierStatementInvoiceStatus;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  items: SupplierStatementItem[];
}

export interface SupplierStatementPayment {
  id: number;
  voucherNumber: string;
  date: string;
  amount: number;
  notes: string | null;
}

export interface SupplierStatement {
  supplier: SupplierStatementParty;
  period: SupplierStatementPeriod;
  summary: SupplierStatementSummary;
  invoices: SupplierStatementInvoice[];
  payments: SupplierStatementPayment[];
}

// ─────────────────────────────────────────────────────────────────
//  POST /dashboard/suppliers/{id}/payments
//  Direct supplier payment — not tied to a specific invoice.
// ─────────────────────────────────────────────────────────────────

export interface SupplierPaymentPayload {
  treasuryId: number;
  amount: number;
  /** ISO date YYYY-MM-DD. */
  paymentDate: string;
  notes?: string;
}

export interface SupplierPaymentResponse {
  voucherId: number;
  voucherNumber: string;
  supplierId: number;
  supplierName: string;
  amount: number;
  date: string;
  treasuryId: number;
  treasuryName: string;
  treasuryBalanceAfter: number;
  supplierOwedBefore: number;
  supplierOwedAfter: number;
  notes: string;
}
