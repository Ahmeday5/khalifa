/**
 * Permission catalogue. Values are the exact strings the backend returns
 * in the `permissions` claim of the login response — DO NOT translate or
 * normalize them on the client (case-sensitive equality).
 *
 *   Source of truth: backend role-policy matrix.
 *   Mirrored doc:    permission-system docs sent by the API team.
 */
export const PERMISSIONS = {
  dashboardView:       'Dashboard.View',
  clientsView:         'Clients.View',
  clientsFullAccess:   'Clients.FullAccess',
  suppliersView:       'Suppliers.View',
  suppliersFullAccess: 'Suppliers.FullAccess',
  treasuryView:          'Treasury.View',
  treasuryFullAccess:    'Treasury.FullAccess',
  subAccountsView:       'SubAccounts.View',
  subAccountsFullAccess: 'SubAccounts.FullAccess',
  userManagement:        'UserManagement',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** All permissions a server may issue. Used by guards to validate input. */
export const ALL_PERMISSIONS: ReadonlyArray<Permission> = Object.freeze(
  Object.values(PERMISSIONS),
);

/**
 * Static role → permission map. Mirrors the backend's policy table so the
 * frontend can derive permissions defensively when the API omits them
 * (e.g. older builds, partial responses). The backend remains the source of
 * truth: when the login response includes `permissions`, we trust it
 * verbatim instead of consulting this map.
 */
export const ROLE_PERMISSIONS: Readonly<
  Record<string, ReadonlyArray<Permission>>
> = Object.freeze({
  Admin: [
    PERMISSIONS.dashboardView,
    PERMISSIONS.clientsView,
    PERMISSIONS.clientsFullAccess,
    PERMISSIONS.suppliersView,
    PERMISSIONS.suppliersFullAccess,
    PERMISSIONS.treasuryView,
    PERMISSIONS.treasuryFullAccess,
    PERMISSIONS.userManagement,
  ],
  GeneralManager: [
    PERMISSIONS.dashboardView,
    PERMISSIONS.clientsView,
    PERMISSIONS.clientsFullAccess,
    PERMISSIONS.suppliersView,
    PERMISSIONS.suppliersFullAccess,
    PERMISSIONS.treasuryView,
    PERMISSIONS.treasuryFullAccess,
    PERMISSIONS.userManagement,
  ],
  Supervisor: [
    PERMISSIONS.dashboardView,
    PERMISSIONS.clientsView,
    PERMISSIONS.clientsFullAccess,
    PERMISSIONS.suppliersView,
    PERMISSIONS.suppliersFullAccess,
    PERMISSIONS.treasuryView,
  ],
  Accountant: [
    PERMISSIONS.dashboardView,
    PERMISSIONS.clientsView,
    PERMISSIONS.suppliersView,
    PERMISSIONS.suppliersFullAccess,
    PERMISSIONS.treasuryView,
    PERMISSIONS.treasuryFullAccess,
  ],
  Representative: [
    PERMISSIONS.dashboardView,
    PERMISSIONS.clientsView,
    PERMISSIONS.clientsFullAccess,
    PERMISSIONS.treasuryView,
    PERMISSIONS.subAccountsView,
    PERMISSIONS.subAccountsFullAccess,
  ],
});
