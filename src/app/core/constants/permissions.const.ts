/**
 * Permission catalogue. Values are the exact strings the backend returns
 * from `GET /dashboard/auth/me/permissions` — DO NOT translate or normalize
 * them on the client (case-sensitive equality).
 *
 *   Source of truth: backend role-policy matrix.
 *   Mirrored doc:    permission-system docs sent by the API team.
 *
 * Every string the backend may issue MUST be listed here: `AuthService`
 * drops unknown strings defensively, so a permission missing from this
 * catalogue is silently treated as "not granted".
 */
export const PERMISSIONS = {
  dashboardView:               'Dashboard.View',
  clientsView:                 'Clients.View',
  clientsFullAccess:           'Clients.FullAccess',
  suppliersView:               'Suppliers.View',
  suppliersFullAccess:         'Suppliers.FullAccess',
  purchaseInvoicesView:        'PurchaseInvoices.View',
  purchaseInvoicesFullAccess:  'PurchaseInvoices.FullAccess',
  treasuryView:                'Treasury.View',
  treasuryFullAccess:          'Treasury.FullAccess',
  vouchersFullAccess:          'Vouchers.FullAccess',
  subAccountsView:             'SubAccounts.View',
  subAccountsFullAccess:       'SubAccounts.FullAccess',
  shareholdersView:            'Shareholders.View',
  shareholdersFullAccess:      'Shareholders.FullAccess',
  userManagement:              'UserManagement',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** All permissions a server may issue. Used by `AuthService` to validate input. */
export const ALL_PERMISSIONS: ReadonlyArray<Permission> = Object.freeze(
  Object.values(PERMISSIONS),
);

/** Every permission — the owner roles hold the full catalogue. */
const FULL_ACCESS: ReadonlyArray<Permission> = ALL_PERMISSIONS;

/**
 * Static role → permission map. Mirrors the backend's policy table so the
 * frontend can derive permissions defensively when the API omits them
 * (e.g. older builds, partial responses). The backend remains the source of
 * truth: when it returns `permissions`, we trust them verbatim instead of
 * consulting this map.
 */
export const ROLE_PERMISSIONS: Readonly<
  Record<string, ReadonlyArray<Permission>>
> = Object.freeze({
  Admin: FULL_ACCESS,
  GeneralManager: FULL_ACCESS,
  Supervisor: [
    PERMISSIONS.dashboardView,
    PERMISSIONS.clientsView,
    PERMISSIONS.clientsFullAccess,
    PERMISSIONS.suppliersView,
    PERMISSIONS.suppliersFullAccess,
    PERMISSIONS.purchaseInvoicesView,
    PERMISSIONS.purchaseInvoicesFullAccess,
    PERMISSIONS.treasuryView,
  ],
  Accountant: [
    PERMISSIONS.dashboardView,
    PERMISSIONS.clientsView,
    PERMISSIONS.suppliersView,
    PERMISSIONS.suppliersFullAccess,
    PERMISSIONS.purchaseInvoicesView,
    PERMISSIONS.purchaseInvoicesFullAccess,
    PERMISSIONS.treasuryView,
    PERMISSIONS.treasuryFullAccess,
    PERMISSIONS.vouchersFullAccess,
  ],
  // Representatives work their own clients only: sales (contracts) and
  // collection (installments + down payments). Everything else is 403.
  Representative: [
    PERMISSIONS.dashboardView,
    PERMISSIONS.clientsView,
    PERMISSIONS.clientsFullAccess,
  ],
});
