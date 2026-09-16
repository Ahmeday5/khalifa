import { PagedResponse, PagedQuery } from '../../../core/models/api-response.model';

export type PushNotificationType =
  | 'ContractCreated'
  | 'ContractUpdated'
  | 'InstallmentCollected'
  | 'DownPaymentCollected';

/** Wire shape of a single row from `GET /dashboard/notifications`. */
export interface PushNotificationItem {
  id: number;
  type: PushNotificationType;
  title: string;
  message: string;
  contractId: number | null;
  representativeId: number | null;
  representativeName: string | null;
  amount: number | null;
  /** Read-state is global/shared across all dashboard users, not per-user. */
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export type PushNotificationsPage = PagedResponse<PushNotificationItem>;

export type PushNotificationsQuery = PagedQuery;

export interface UnreadCountResponse {
  count: number;
}

export interface RegisterDevicePayload {
  deviceToken: string;
}
