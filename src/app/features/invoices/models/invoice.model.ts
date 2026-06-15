/**
 * Models for `/dashboard/supplier-purchase-invoices`.
 *
 * Fields mirror the backend exactly — the page never mutates them, so
 * keeping the names in sync with the API spares us a translation layer
 * and keeps the network shape obvious from any consumer site.
 */

export type PurchaseInvoiceStatus =
  | 'Draft'
  | 'Pending'
  | 'PartiallyPaid'
  | 'Paid'
  | 'Confirmed'
  | 'Cancelled';

// ─────────────────────────────────────────────────────────────────
//  Summary card on the list page
//  GET /dashboard/supplier-purchase-invoices/summary
// ─────────────────────────────────────────────────────────────────

export interface PurchaseInvoiceSummary {
  totalPurchases: number;
  totalPaid: number;
  totalOutstanding: number;
  invoicesThisMonth: number;
}

// ─────────────────────────────────────────────────────────────────
//  Lite shape for the list table (subset of the full invoice)
//  GET /dashboard/supplier-purchase-invoices?search=&status=&supplierId=
// ─────────────────────────────────────────────────────────────────

export interface PurchaseInvoiceListItem {
  id: number;
  invoiceNumber: string;
  supplierName: string;
  itemsSummary: string;
  quantity: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  invoiceDate: string;
  status: PurchaseInvoiceStatus;
}

export interface PurchaseInvoiceFilters {
  search?: string;
  status?: PurchaseInvoiceStatus | '';
  supplierId?: number | '';
}

// ─────────────────────────────────────────────────────────────────
//  Full invoice (read + write)
// ─────────────────────────────────────────────────────────────────

export interface PurchaseInvoiceItem {
  productId: number;
  productName?: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  /** Server-computed; only present in responses. */
  lineTotal?: number;
}

export interface PurchaseInvoice {
  id: number;
  invoiceNumber: string;
  supplierId: number;
  supplierName: string;
  warehouseId: number;
  warehouseName: string;
  invoiceDate: string;
  dueDate: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  treasuryId: number | null;
  status: PurchaseInvoiceStatus;
  notes: string;
  items: PurchaseInvoiceItem[];
}

/** POST /dashboard/supplier-purchase-invoices */
export interface CreatePurchaseInvoicePayload {
  supplierId: number;
  warehouseId: number;
  /** ISO 8601 string (UTC). */
  invoiceDate: string;
  /** ISO 8601 string (UTC). */
  dueDate: string;
  /** Whole number percentage, e.g. `15` for 15% VAT. */
  taxRatePercent: number;
  paidAmount: number;
  treasuryId: number | null;
  /** Backend default is `true` — the form must opt out explicitly. */
  isDraft: boolean;
  /** Skip stock auto-posting on draft saves. */
  autoPostInventory: boolean;
  notes: string;
  items: CreatePurchaseInvoiceItem[];
}

export interface CreatePurchaseInvoiceItem {
  productId: number;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
}

/**
 * PUT /dashboard/supplier-purchase-invoices/{id}. The backend accepts the
 * exact same body as create, so the type is shared rather than duplicated.
 */
export type UpdatePurchaseInvoicePayload = CreatePurchaseInvoicePayload;

/** POST /dashboard/supplier-purchase-invoices/{id}/confirm */
export interface ConfirmPurchaseInvoicePayload {
  treasuryId: number;
}

/** POST /dashboard/supplier-purchase-invoices/{id}/payments */
export interface PayInvoicePayload {
  treasuryId: number;
  amount: number;
  /** `yyyy-MM-dd` — calendar date, not a timestamp. */
  paymentDate: string;
  notes: string;
}

// ─────────────────────────────────────────────────────────────────
//  Display helpers
// ─────────────────────────────────────────────────────────────────

export interface PurchaseInvoiceStatusView {
  label: string;
  /** Matches the global `.b.b{ok|warn|bad|info}` palette. */
  variant: 'ok' | 'warn' | 'bad' | 'info';
}

export const PURCHASE_INVOICE_STATUS_VIEW: Record<
  PurchaseInvoiceStatus,
  PurchaseInvoiceStatusView
> = {
  Draft:         { label: 'مسودة',     variant: 'info' },
  Pending:       { label: 'بانتظار الدفع', variant: 'warn' },
  PartiallyPaid: { label: 'جزئية',     variant: 'warn' },
  Paid:          { label: 'مسددة',     variant: 'ok'   },
  Confirmed:     { label: 'مؤكدة',     variant: 'ok'   },
  Cancelled:     { label: 'ملغية',     variant: 'bad'  },
};

