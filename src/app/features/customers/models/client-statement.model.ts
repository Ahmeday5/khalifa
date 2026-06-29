import { PagedResponse } from '../../../core/models/api-response.model';

// ─── Contracts list (GET /dashboard/clients/{id}/contracts) ──────────────────

/** Single item in the contract list rows. */
export interface ClientContractListItem {
  productId: number | null;
  productName: string;
  quantity: number;
}

/**
 * Wire shape of a single contract row returned by
 * `GET /dashboard/clients/{id}/contracts?PageIndex=&PageSize=`.
 */
export interface ClientContractRow {
  id: number;
  isDirect: boolean;
  items: ClientContractListItem[];
  /** Total quantity across all items. */
  quantity: number;
  dateOfSale: string;
  purchasePrice: number;
  cashPrice: number;
  downPayment: number;
  profitRate: number;
  installmentsCount: number;
  installmentAmount: number;
  paymentFrequency: string;
  firstInstallmentDate: string;
  status: string;
  notes: string | null;
  createdAt: string;
  totalContractAmount: number;
  totalPaid: number;
  remainingAmount: number;
}

export type ClientContractsPage = PagedResponse<ClientContractRow>;

export interface ClientContractsQuery {
  pageIndex?: number;
  pageSize?: number;
}

// ─── Contract details (GET /dashboard/contracts/{id}/details) ────────────────

/** Single item inside the contract details contract object. */
export interface ContractDetailItemRow {
  productId: number | null;
  productName: string;
  warehouseId: number | null;
  warehouseName: string | null;
  quantity: number;
  unitPurchasePrice: number;
}

export interface ContractDetailsContract {
  id: number;
  isDirect: boolean;
  items: ContractDetailItemRow[];
  /** Total quantity across all items. */
  quantity: number;
  dateOfSale: string;
  purchasePrice: number;
  cashPrice: number;
  downPayment: number;
  profitRate: number;
  profitShareRate: number;
  installmentsCount: number;
  installmentAmount: number;
  paymentFrequency: string;
  firstInstallmentDate: string;
  status: string;
  notes: string | null;
  createdAt: string;
  representativeCommission: number;
  /** الخزينة المربوطة بالعقد — مطلوبة لسند دفع المقدم وعرض السيلكت. */
  treasuryId: number | null;
}

export interface ContractDetailsClient {
  id: number;
  fullName: string;
  phoneNumber: string;
  address: string;
  clientCode?: string | null;
  region?: string | null;
  occupation?: string | null;
}

export interface ContractDetailsRepresentative {
  id: number;
  fullName: string;
  phoneNumber: string;
}

export interface ContractDetailsSummary {
  totalContractAmount: number;
  totalPaid: number;
  totalRemaining: number;
  overdueAmount: number;
  paidInstallmentsCount: number;
  totalInstallmentsCount: number;
  progressPercent: number;
}

export interface ContractNextInstallment {
  sequence: number;
  amount: number;
  dueDate: string;
}

/** Single payment transaction returned inside `GET /dashboard/contracts/{id}/details`. */
export interface ContractPaymentRecord {
  voucherNumber: string;
  date: string;
  amount: number;
  kind: string;
  notes: string | null;
}

/**
 * Full contract details shape from `GET /dashboard/contracts/{id}/details`.
 * Items (products + warehouses) are nested inside `contract.items`.
 */
export interface ContractDetails {
  contract: ContractDetailsContract;
  client: ContractDetailsClient;
  representative: ContractDetailsRepresentative | null;
  summary: ContractDetailsSummary;
  nextInstallment: ContractNextInstallment | null;
  installments: ContractInstallmentRow[];
  payments?: ContractPaymentRecord[];
}

// ─── Installments ─────────────────────────────────────────────────────────────

export type ContractInstallmentStatus =
  | 'Paid'
  | 'Partial'
  | 'Upcoming'
  | 'Overdue'
  | string;

export interface ContractInstallmentRow {
  sequence: number;
  dueDate: string;
  dueAmount: number;
  paidAmount: number;
  remaining: number;
  paidDate: string | null;
  status: ContractInstallmentStatus;
  isOverdue: boolean;
  notes: string | null;
}

// ─── Payment ──────────────────────────────────────────────────────────────────

/** POST /installments/pay */
export interface PayInstallmentPayload {
  contractId: number;
  amount: number;
  treasuryId: number;
  paymentDate: string;
  paymentMethod: string;
  notes?: string;
}

export interface PayInstallmentResponse {
  message: string;
}
