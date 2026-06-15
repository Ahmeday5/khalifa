/**
 * Local catalog product (still mock-backed). Distinct from the warehouse
 * Product entity — only the catalog page reads it today.
 */
export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  costPrice: number;
  stock: number;
  minStock: number;
  sku: string;
  warehouseName?: string;
  serialStart?: string;
  serialEnd?: string;
  serialLabel?: string;
}

export interface CartItem {
  product: Product;
  qty: number;
}

export interface InstallmentCalculation {
  cashPrice: number;
  downPayment: number;
  profitAmount: number;
  totalAmount: number;
  installmentAmount: number;
  installmentsCount: number;
  period: string;
}

export type InstallmentPeriod = 'شهري' | 'أسبوعي' | 'ربع سنوي' | 'نصف سنوي';

// ─────────────────────────────────────────────────────────────────
//  Client orders coming from the customer-app
//  GET /dashboard/client-orders
// ─────────────────────────────────────────────────────────────────

export type ClientOrderStatus =
  | 'Pending'
  | 'Accepted'
  | 'Approved'
  | 'Rejected'
  | 'Converted'
  | 'Cancelled';

export type PaymentMethod = 'Cash' | 'Installments';

export interface ClientOrderItem {
  productId: number;
  productName: string;
  quantity: number;
  price: number;
  lineTotal: number;
  paymentMethod: PaymentMethod;
  installmentMonths: number | null;
  downPayment: number;
  monthlyInstallment: number;
}

/** Exact shape returned by the backend. */
export interface ClientOrder {
  id: number;
  clientName: string;
  clientPhone: string;
  orderDate: string;
  paymentMethod: PaymentMethod;
  totalAmount: number;
  downPayment: number;
  installmentsCount: number;
  installmentAmount: number;
  status: ClientOrderStatus;
  notes: string | null;
  deliveryAddress: string;
  preferredDeliveryDate: string;
  items: ClientOrderItem[];
}

/**
 * Query parameters for `GET /dashboard/client-orders`.
 *
 * The endpoint is server-paginated and (confirmed against the live Swagger)
 * accepts **only** `PageIndex` / `PageSize` — there is no `Status`/`Search`
 * filter, so status filtering stays client-side per page.
 */
export interface ClientOrdersQuery {
  pageIndex?: number;
  pageSize?: number;
}

/** POST /dashboard/client-orders/{id}/convert-to-contract */
export interface ConvertToContractPayload {
  warehouseId: number;
  treasuryId: number;
  representativeId?: number;
  dateOfSale: string;
  firstInstallmentDate: string;
  notes: string;
}
