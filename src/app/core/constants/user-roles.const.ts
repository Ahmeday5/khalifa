import { UserRole } from '../models/auth.model';

/**
 * Display names for every backend role. Single source of truth — both the
 * topbar and the role guards read from here so adding a new role only needs
 * one edit.
 */
export const ROLE_LABELS_AR: Record<UserRole, string> = {
  Admin: 'مدير النظام',
  GeneralManager: 'مدير عام',
  Supervisor: 'مشرف',
  Accountant: 'محاسب',
  Representative: 'مندوب',
  Client: 'عميل',
};

/** Compile-time list of all roles. */
export const ALL_ROLES: ReadonlyArray<UserRole> = [
  'Admin',
  'GeneralManager',
  'Supervisor',
  'Accountant',
  'Representative',
  'Client',
];

export function roleLabel(role: UserRole | null | undefined): string {
  return role ? (ROLE_LABELS_AR[role] ?? role) : '';
}
