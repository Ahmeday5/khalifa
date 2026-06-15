/**
 * Rating tier returned by every dashboard list endpoint. The backend uses
 * the literal letter "A".."D"; we keep it as a wider `string` at the boundary
 * because the server has been observed to return blanks under some states.
 */
export type ClientRating = 'A' | 'B' | 'C' | 'D' | string;

/** Raw shape of `GET /dashboard/charts/profits-last-6-months`. */
export interface ProfitMonthDto {
  month: string;
  profitAmount: number;
  /** Pre-formatted short form (e.g. "978.29k") — use as-is for the bar label. */
  formattedProfit: string;
}

/** Raw shape of `GET /dashboard/clients/top-this-month`. */
export interface TopClientDto {
  clientName: string;
  rating: ClientRating;
  statusText: string;
  amount: number;
}

/** Raw shape of `GET /dashboard/installments/due-this-week`. */
export interface DueInstallmentDto {
  clientName: string;
  productName: string;
  /** Backend-formatted progress, e.g. "1/3". */
  installmentProgress: string;
  amount: number;
  /** Backend-formatted Arabic date, e.g. "11 مايو". */
  dueDate: string;
  paymentType: string;
  remainingAmount: number;
  rating: ClientRating;
  statusText: string;
}

export interface HomeSummaryDto {
  installmentClients: {
    count: number;
    addedThisMonth: number;
  };

  totalDues: {
    amount: number;
    clientsCount: number;
  };

  collectedThisMonth: {
    amount: number;
    growthPercent: number;
  };

  mainTreasury: {
    balance: number;
  };

  monthlyProfit: {
    amount: number;
    marginPercent: number;
  };

  collectionRate: {
    percent: number;
    targetPercent: number;
  };

  delinquent: {
    clientsCount: number;
    amount: number;
  };

  excellentRating: {
    clientsCount: number;
    percent: number;
  };

  lowStock: {
    productsCount: number;
  };

  quarterTax: {
    amount: number;
  };
}

