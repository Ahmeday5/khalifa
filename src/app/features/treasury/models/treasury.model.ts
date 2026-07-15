import { TreasuryType } from '../enums/treasury-type.enum';

export type TransactionType = 'income' | 'expense' | 'transfer';

/**
 * Treasury entity exactly as returned by `GET /dashboard/treasuries`.
 * No separate "view" DTO — the API shape *is* the view model.
 *
 * `transactions` and `vouchers` are returned as empty arrays by the
 * backend today; typed as optional so they can grow without breaking
 * existing call-sites.
 */
export interface Treasury {
  id: number;
  name: string;
  currentBalance: number;
  type: TreasuryType;
  isActive: boolean;
  /** Set only for `SubRepresentative` treasuries; null otherwise. */
  representativeId?: number | null;
  /** Display name of the linked representative (sub-rep treasuries only). */
  representative?: string | null;
  transactions?: TreasuryTransaction[];
  vouchers?: TreasurySummary[];
}

/**
 * POST /dashboard/treasuries — `initialBalance` is set ONCE at creation.
 * `representativeId` is sent ONLY for `SubRepresentative` treasuries and is
 * `null` for every other type.
 */
export interface CreateTreasuryPayload {
  name: string;
  initialBalance: number;
  type: TreasuryType;
  isActive: boolean;
  representativeId: number | null;
}

/**
 * PUT /dashboard/treasuries/{id} — balance is server-managed, not editable.
 * `representativeId` follows the same rule as on create.
 */
export interface UpdateTreasuryPayload {
  name: string;
  type: TreasuryType;
  isActive: boolean;
  representativeId: number | null;
}

export interface TreasuryTransaction {
  id: string;
  date: string;
  description: string;
  type: TransactionType;
  amount: number;
  balance: number;
  category: string;
}

export interface TreasurySummary {
  mainBalance: number;
  monthlyIncome: number;
  monthlyExpense: number;
  netCashflow: number;
  vatCollected: number;
  vatPaid: number;
}

/* ════════════════════════════════════════════════════════════════
   Treasury transfers (inter-treasury money movements)
   ════════════════════════════════════════════════════════════════ */

/** Lifecycle state of a treasury transfer. */
export type TreasuryTransferStatus = 'Completed' | 'Cancelled';

/** Row shape returned by `GET /dashboard/treasuries/transfers`. */
export interface TreasuryTransfer {
  id: number;
  fromTreasuryId: number;
  fromTreasuryName: string;
  toTreasuryId: number;
  toTreasuryName: string;
  amount: number;
  /** ISO date (server returns date-only or full ISO depending on field). */
  transferDate: string;
  notes: string | null;
  createdAt: string;
  status: TreasuryTransferStatus;
  /** ISO datetime the transfer was cancelled at; `null` while `Completed`. */
  cancelledAt: string | null;
}

/** POST /dashboard/treasuries/transfers body. */
export interface CreateTreasuryTransferPayload {
  fromTreasuryId: number;
  toTreasuryId: number;
  amount: number;
  /** `yyyy-MM-dd` — the backend expects a calendar date, not a timestamp. */
  transferDate: string;
  notes: string;
}

/** Query parameters for the paginated transfers list. */
export interface TreasuryTransfersQuery {
  pageIndex?: number;
  pageSize?: number;
  fromTreasuryId?: number | '';
  toTreasuryId?: number | '';
  /** `yyyy-MM-dd` — inclusive lower bound. */
  from?: string;
  /** `yyyy-MM-dd` — inclusive upper bound. */
  to?: string;
}

/* ════════════════════════════════════════════════════════════════
   Treasury operations (all transactions/movements)
   ════════════════════════════════════════════════════════════════ */

/** Row shape returned by `GET /dashboard/treasuries/operations`. */
export interface TreasuryOperation {
  id: number;
  description: string;
  amount: number;
  signedAmount: number; // positive for Receipt, negative for Payment
  direction: 'Payment' | 'Receipt';
  date: string; // ISO datetime
  userName: string;
  balanceAfter: number;
  treasuryId: number;
  treasuryName: string;
}

/** Query parameters for the paginated operations list. */
export interface TreasuryOperationsQuery {
  pageIndex?: number;
  pageSize?: number;
  treasuryId?: number | '';
  /** `yyyy-MM-dd` — inclusive lower bound. */
  from?: string;
  /** `yyyy-MM-dd` — inclusive upper bound. */
  to?: string;
}

/* ════════════════════════════════════════════════════════════════
   Monthly profits (revenue, expenses, profit analysis)
   ════════════════════════════════════════════════════════════════ */

export interface MonthlyProfit {
  year: number;
  month: number;
  monthName: string;
  revenue: number;
  expenses: number;
  profit: number;
  marginPercent: number;
  isCurrentMonth: boolean;
}
