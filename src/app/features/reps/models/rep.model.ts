import {
  PagedQuery,
  PagedResponse,
} from '../../../core/models/api-response.model';

/**
 * Backend-defined representative permissions. Kept as a union of literal
 * strings so the values travel over the wire unchanged.
 *
 * Only `SalesAndCollection` has been confirmed against the live API at
 * the time of writing; the other variants follow the obvious symmetry
 * and are surfaced in the form for forward compatibility.
 */
export type RepresentativePermission =
  | 'SalesAndCollection'
  | 'SalesOnly'
  | 'CollectionOnly';

export type RepresentativeStatus = 'Active' | 'NotActive';

/** Trimmed `appUser` projection embedded on every representative payload. */
export interface RepresentativeAppUser {
  id: string;
  email: string;
  userName: string;
}

/**
 * Auto-created sub-treasury attached to each representative. The backend
 * creates one on POST and references it by id on every subsequent read.
 */
export interface RepresentativeTreasury {
  id: number;
  name: string;
  currentBalance: number;
  type: string; // backend returns 'SubRepresentative' today
  isActive: boolean;
}

/** Full representative entity, identical between list and getById. */
export interface Representative {
  id: number;
  fullName: string;
  phoneNumber: string;
  permissions: RepresentativePermission;
  /** 0..100. */
  profitRatePercent: number;
  /** 0..5 — backend rejects values outside this range. */
  performanceRating: number;
  status: RepresentativeStatus;
  appUser: RepresentativeAppUser;
  treasury: RepresentativeTreasury;
  /** Outstanding commission — optional, populated in list when available. */
  outstandingCommission?: number;
  /** Accumulated commission total — optional, populated in list when available. */
  accumulatedCommission?: number;
  /** Paid commission total — optional, populated in list when available. */
  paidCommission?: number;
}

/**
 * POST /dashboard/representatives.
 *
 * The backend creates the underlying `AppUser` from `email` + `password`
 * and the sub-treasury automatically — neither id is supplied here.
 */
export interface CreateRepresentativePayload {
  fullName: string;
  email: string;
  password?: string;
  phoneNumber: string;
  permissions: RepresentativePermission;
  profitRatePercent: number;
  performanceRating: number;
  status: RepresentativeStatus;
}

/**
 * PUT /dashboard/representatives/{id}.
 *
 * Same shape as create. `password` is optional on edit semantically, but
 * the API still expects the field — we send the existing value unchanged
 * when the user doesn't supply a new one (handled in the form).
 */
export type UpdateRepresentativePayload = CreateRepresentativePayload;

/**
 * Row shape of `GET /dashboard/representatives/sub-treasuries` — one entry
 * per representative with their auto-created sub-treasury balance plus the
 * full sales / cost / profit / commission breakdown accumulated to date.
 * `lastActivityDate` is `null` when the representative has had no movement
 * yet.
 *
 *   accumulatedCommission = paidCommission + outstandingCommission
 */
export interface RepresentativeSubTreasury {
  representativeId: number;
  representativeName: string;
  treasuryId: number;
  treasuryName: string;
  balance: number;
  lastActivityDate: string | null;
  totalSales: number;
  totalCost: number;
  totalProfit: number;
  accumulatedCommission: number;
  paidCommission: number;
  outstandingCommission: number;
}

// ── Account statement (admin by id / representative "me") ───────────────

/** Trimmed representative header shown atop a statement. */
export interface RepStatementRepresentative {
  id: number;
  fullName: string;
  phoneNumber: string;
  profitRatePercent: number;
  status: RepresentativeStatus;
  treasuryBalance: number;
}

/** Aggregate figures for the whole statement period. */
export interface RepStatementSummary {
  contractsCount: number;
  activeContractsCount: number;
  totalSales: number;
  totalCost: number;
  totalProfit: number;
  totalCommission: number;
  paidCommission: number;
  outstandingCommission: number;
  firstContractDate: string | null;
  lastContractDate: string | null;
}

/** One contract row inside a representative statement. */
export interface RepStatementContractRow {
  contractId: number;
  clientId: number;
  clientName: string;
  productId: number;
  productName: string;
  quantity: number;
  cashPrice: number;
  saleAmount: number;
  cost: number;
  profit: number;
  commission: number;
  status: string;
  dateOfSale: string;
}

/** Wire shape of `data` for both statement endpoints. */
export interface RepresentativeStatement {
  representative: RepStatementRepresentative;
  summary: RepStatementSummary;
  contracts: PagedResponse<RepStatementContractRow>;
}

// ── Commission payout ───────────────────────────────────────────────────

/** POST body for `representatives/{id}/commission-payout`. */
export interface CommissionPayoutPayload {
  amount: number;
  treasuryId: number;
  /** `yyyy-MM-dd`. */
  date: string;
  notes: string;
}

/** `data` returned by a successful commission payout. */
export interface CommissionPayoutResult {
  representativeId: number;
  representativeName: string;
  voucherNumber: string;
  amountPaid: number;
  treasuryId: number;
  treasuryName: string;
  treasuryBalanceAfter: number;
  accruedCommission: number;
  paidCommission: number;
  outstandingCommission: number;
}

/** One row of the commission-payouts history list. */
export interface CommissionPayoutRow {
  id: number;
  voucherNumber: string;
  representativeId: number;
  representativeName: string;
  amount: number;
  date: string;
  treasuryId: number;
  treasuryName: string;
  notes: string;
}

/** Query string for the paginated payouts history. */
export type CommissionPayoutsQuery = PagedQuery;

/** Query string for the paginated list — uses the project's shared shape. */
export type RepresentativesQuery = PagedQuery;

/** Wire shape after envelope unwrap. */
export type RepresentativesListResponse = PagedResponse<Representative>;
