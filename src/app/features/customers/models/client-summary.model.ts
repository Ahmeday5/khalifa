import { CreatedClient, DashboardClient } from './dashboard-client.model';

/**
 * Header view-model for a single client (statement page). Identity is always
 * known; contract aggregates are `null` when they could not be resolved yet,
 * so the UI shows a placeholder instead of a misleading `0`.
 */
export interface ClientSummary {
  id: number;
  fullName: string;
  phoneNumber: string;
  areaName: string | null;
  totalContractAmount: number | null;
  remainingAmount: number | null;
}

/** From a full roster row (identity + aggregates). */
export function clientSummaryFromRow(row: DashboardClient): ClientSummary {
  return {
    id: row.id,
    fullName: row.fullName,
    phoneNumber: row.phoneNumber,
    areaName: row.areaName,
    totalContractAmount: row.totalContractAmount,
    remainingAmount: row.remainingAmount,
  };
}

/** From a profile, enriched with the roster row's aggregates when available. */
export function toClientSummary(
  profile: CreatedClient,
  row: DashboardClient | undefined,
): ClientSummary {
  return {
    id: profile.id,
    fullName: profile.fullName,
    phoneNumber: profile.phoneNumber,
    areaName: profile.areaName,
    totalContractAmount: row?.totalContractAmount ?? null,
    remainingAmount: row?.remainingAmount ?? null,
  };
}
