export type AuditAction =
  | 'create' | 'update' | 'delete' | 'login' | 'logout' | 'payment' | 'export';

export interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: string;
  action: AuditAction;
  entity: string;
  entityId: string | null;
  description: string;
  ipAddress: string;
}
