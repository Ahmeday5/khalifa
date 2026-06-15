export enum CapitalTransactionType {
  Receipt = 'Receipt',
  Payment = 'Payment',
}

export type CapitalTransactionDirection =
  | 'Deposit'
  | 'Payment'
  | 'ProfitCapitalization';

/** Row shape returned by `GET /shareholders/{id}/capital-transactions` (paged). */
export interface CapitalTransaction {
  id: number;
  voucherNumber: string;
  type: CapitalTransactionType;
  direction: CapitalTransactionDirection;
  amount: number;
  /** Shareholder's capital balance immediately after this movement posted. */
  balanceAfter: number;
  /** ISO datetime as returned by the server. */
  date: string;
  treasuryId: number;
  treasuryName: string;
  notes: string | null;
  userName: string;
}

export interface CreateCapitalTransactionPayload {
  type: CapitalTransactionType;
  amount: number;
  treasuryId: number;
  /** `yyyy-MM-dd` — calendar date, not a timestamp. */
  date: string;
  notes: string;
}

export interface CapitalizeProfitPayload {
  profitsTreasuryId: number;
  amount: number;
  /** `yyyy-MM-dd` — calendar date, not a timestamp. */
  date: string;
  notes: string;
}

/** POST /shareholders/capitalize-all-profits — rolls every shareholder's AccruedProfit into capital. */
export interface CapitalizeAllProfitsPayload {
  profitsTreasuryId: number;
  /** `yyyy-MM-dd` — calendar date, not a timestamp. */
  date: string;
  notes: string;
}

/** Query parameters for the paginated capital-transactions history. */
export interface CapitalTransactionsQuery {
  pageIndex?: number;
  pageSize?: number;
}
