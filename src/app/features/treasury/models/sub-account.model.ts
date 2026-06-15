import { PagedResponse } from '../../../core/models/api-response.model';
import { VoucherType } from '../../vouchers/enums/voucher.enums';

/**
 * Sub-account (حساب فرعي) — a standalone cash ledger held inside the treasury
 * for a named party (e.g. a partner, a petty-cash holder). Each receipt /
 * payment voucher moves only this account's own `balance`; it is independent
 * of the company treasuries. Admin + GeneralManager only.
 *
 * Shapes mirror the `dashboard/sub-accounts` endpoints exactly.
 */

/** Row / detail shape returned by `GET /dashboard/sub-accounts[/{id}]`. */
export interface SubAccount {
  id: number;
  name: string;
  phoneNumber: string;
  /** Running balance after every receipt/payment — server-managed. */
  balance: number;
  createdAt: string;
  /** Linked representative — null when not assigned. */
  representativeId: number | null;
  representativeName: string | null;
}

/** POST /dashboard/sub-accounts and PUT /dashboard/sub-accounts/{id} body. */
export interface SubAccountPayload {
  name: string;
  phoneNumber: string;
  /** Omit entirely when no rep is assigned — never send 0 or null. */
  representativeId?: number;
}

/** Query for `GET /dashboard/sub-accounts` — `search` matches name or phone. */
export interface SubAccountsQuery {
  pageIndex?: number;
  pageSize?: number;
  search?: string;
}

/**
 * A single voucher belonging to a sub-account. Returned by the create-voucher
 * endpoint, the per-account statement, and the all-vouchers list — one shape
 * for all three. `balanceAfter` is the account balance immediately after this
 * voucher posted (the basis for a running-balance ledger view).
 */
export interface SubAccountVoucher {
  id: number;
  voucherNumber: string;
  subAccountId: number;
  subAccountName: string;
  type: VoucherType;
  amount: number;
  balanceAfter: number;
  /** ISO timestamp (date-only at midnight, e.g. `2026-05-24T00:00:00`). */
  date: string;
  notes: string | null;
}

/**
 * POST /dashboard/sub-accounts/{id}/vouchers body. `date` is a calendar date
 * (`yyyy-MM-dd`); a `Receipt` raises the balance, a `Payment` lowers it.
 */
export interface CreateSubAccountVoucherPayload {
  treasuryId: number;
  type: VoucherType;
  amount: number;
  date: string;
  notes: string;
}

/** Query for `GET /dashboard/sub-accounts/vouchers` (all-vouchers log). */
export interface SubAccountVouchersQuery {
  pageIndex?: number;
  pageSize?: number;
  search?: string;
  type?: VoucherType | '';
  subAccountId?: number | '';
}

/** Query for `GET /dashboard/sub-accounts/{id}/statement`. */
export interface SubAccountStatementQuery {
  pageIndex?: number;
  pageSize?: number;
}

/**
 * `data` shape of the per-account statement: the account header plus a paged
 * envelope of its vouchers.
 */
export interface SubAccountStatement {
  account: SubAccount;
  vouchers: PagedResponse<SubAccountVoucher>;
}
