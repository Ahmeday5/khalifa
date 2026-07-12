import { PagedResponse } from '../../../core/models/api-response.model';

/**
 * Backend status enum returned by `GET /dashboard/clients`.
 *
 *   New             — client has no contract yet
 *   OnTrack         — has contract(s); zero overdue installments
 *   OneOverdue      — exactly one installment overdue
 *   MultipleOverdue — two or more installments overdue
 */
export type DashboardClientStatus =
  | 'New'
  | 'OnTrack'
  | 'OneOverdue'
  | 'MultipleOverdue';

/**
 * Server-computed credit rating. `null` when `status === 'New'` (the client
 * has no contract on which to base a rating).
 *
 *   A — 0 overdue installments
 *   B — 1 overdue installment
 *   C — 2 or 3 overdue installments
 *   D — 4 or more overdue installments
 */
export type DashboardClientRating = 'A' | 'B' | 'C' | 'D';

/**
 * Wire shape of a single row in the clients list. Aggregate fields
 * (`goods`, `installmentProgress`, etc.) are `null` for clients without
 * a contract — keep them optional/nullable so the renderer can fall back
 * to a placeholder rather than crashing.
 */
export interface DashboardClient {
  id: number;
  fullName: string;
  phoneNumber: string;
  areaId: number | null;
  areaName: string | null;
  // ── extended profile (may be absent in list response) ──
  clientCode?: string | null;
  /** Free-text occupation/work field — labeled "العمل" in the UI. */
  region?: string | null;
  occupation?: string | null;

  // ── contract aggregates (null for `status === 'New'`) ──
  goods: string | null;
  /** Display string in `paid/total` form, e.g. "3/12". */
  installmentProgress: string | null;
  installmentAmount: number | null;
  /** Backend label, e.g. "Monthly". Translated at render time. */
  paymentFrequency: string | null;
  totalContractAmount: number;
  remainingAmount: number;

  rating: DashboardClientRating | null;
  status: DashboardClientStatus;
}

/** Query params accepted by `GET /dashboard/clients`. */
export interface DashboardClientsQuery {
  pageIndex?: number;
  pageSize?: number;
  /** Text search — name, phone, address. */
  search?: string;
  /** When true, restrict the result set to overdue clients only. */
  onlyOverdue?: boolean;
  /** Barcode / client-code exact search. */
  clientCode?: string;
}

/**
 * Wire shape of `data` after the standard `ApiResponse` envelope is
 * unwrapped — a paged client list plus the total count of overdue
 * clients (computed against the full dataset, not the current page).
 */
export interface DashboardClientsResponse {
  overdueClientsCount: number;
  clients: PagedResponse<DashboardClient>;
}

/** POST /dashboard/clients body. */
export interface CreateClientPayload {
  fullName: string;
  nationalId: string;
  areaId: number;
  phoneNumber: string;
  whatsappNumber: string;
  // ── extended profile ──
  clientCode?: string;
  region?: string;
  occupation?: string;
  building?: string;
  floor?: string;
  department?: string;
}

/** PUT /dashboard/clients/{id} body. */
export interface UpdateClientPayload {
  fullName: string;
  nationalId: string;
  areaId: number;
  phoneNumber: string;
  whatsappNumber: string;
  // ── extended profile ──
  clientCode?: string;
  region?: string;
  occupation?: string;
  building?: string;
  floor?: string;
  department?: string;
}

/**
 * Full client record returned by POST /dashboard/clients and
 * GET/PUT /dashboard/clients/{id}. `nationalId` is nullable since it is
 * optional on creation.
 */
export interface CreatedClient {
  id: number;
  fullName: string;
  nationalId: string | null;
  areaId: number | null;
  areaName: string | null;
  phoneNumber: string;
  whatsappNumber: string;
  createdAt: string;
  // ── extended profile (nullable — may not have been set) ──
  clientCode: string | null;
  region: string | null;
  occupation: string | null;
  building: string | null;
  floor: string | null;
  department: string | null;
}
