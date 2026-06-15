import { PagedResponse } from '../../../core/models/api-response.model';

/**
 * Wire shape of a single contract row returned by
 * `GET /dashboard/clients/{id}/contracts?PageIndex=&PageSize=`.
 */
export interface ClientContractRow {
  id: number;
  /** `null` for direct contracts that are not linked to an inventory product. */
  productId: number | null;
  productName: string;
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

/**
 * Wire shape of `GET /dashboard/contracts/{id}/details`.
 */
export interface ContractDetails {
  contract: ContractDetailsContract;
  client: ContractDetailsClient;
  /** `null` for direct contracts that are not linked to a catalog product. */
  product: ContractDetailsProduct | null;
  warehouse: ContractDetailsWarehouse | null;
  representative: ContractDetailsRepresentative | null;
  summary: ContractDetailsSummary;
  nextInstallment: ContractNextInstallment | null;
  installments: ContractInstallmentRow[];
}

export interface ContractDetailsContract {
  id: number;
  /** Free-text product name for direct contracts (no catalog product). Null for regular contracts. */
  productName: string | null;
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
  representativeCommission: number;
}

export interface ContractDetailsClient {
  id: number;
  fullName: string;
  phoneNumber: string;
  address: string;
}

export interface ContractDetailsProduct {
  id: number;
  name: string;
}

export interface ContractDetailsWarehouse {
  id: number;
  name: string;
}

export interface ContractDetailsRepresentative {
  id: number;
  name: string;
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
