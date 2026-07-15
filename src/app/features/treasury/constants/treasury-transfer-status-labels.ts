import { BadgeType } from '../../../shared/components/badge/badge.component';
import { TreasuryTransferStatus } from '../models/treasury.model';

/** O(1) Arabic label lookup keyed by transfer status. */
export const TREASURY_TRANSFER_STATUS_LABELS: Readonly<
  Record<TreasuryTransferStatus, string>
> = {
  Completed: 'مكتمل',
  Cancelled: 'ملغي',
};

/** Visual badge tone per transfer status. */
export const TREASURY_TRANSFER_STATUS_BADGE: Readonly<
  Record<TreasuryTransferStatus, BadgeType>
> = {
  Completed: 'ok',
  Cancelled: 'bad',
};
