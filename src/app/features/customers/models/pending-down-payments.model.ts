import { PagedResponse, PagedQuery } from '../../../core/models/api-response.model';

/** One contract with a pending down payment, nested under its client. */
export interface PendingDownPaymentContract {
  contractId: number;
  contractCode: string | null;
  productNames: string;
  downPaymentAmount: number;
  dateOfSale: string;
}

/**
 * Wire shape of a single row returned by
 * `GET /dashboard/clients/pending-down-payments?pageIndex=&pageSize=&search=`.
 */
export interface PendingDownPaymentClientRow {
  clientId: number;
  clientName: string;
  phoneNumber?: string;
  contracts: PendingDownPaymentContract[];
}

export type PendingDownPaymentsPage = PagedResponse<PendingDownPaymentClientRow>;

export type PendingDownPaymentsQuery = PagedQuery;
