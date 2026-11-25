import { UserRole } from '../models/auth.model';
import { PERMISSIONS, Permission } from './permissions.const';

/**
 * Declarative access rule shared by routes, the sidebar and templates.
 *
 *   - `anyPermission` → granted when the user holds AT LEAST ONE permission.
 *   - `anyRole`       → granted when the user's role is one of these. Use it
 *                       only for role-exclusive screens that no permission
 *                       string isolates (e.g. a Representative's own
 *                       account statement).
 *
 * When both are set they are OR-ed. An empty requirement means "every
 * authenticated user".
 */
export interface AccessRequirement {
  readonly anyPermission?: ReadonlyArray<Permission>;
  readonly anyRole?: ReadonlyArray<UserRole>;
}

/**
 * Access policy per screen / data domain — the ONE place that maps the UI
 * onto backend permissions. Route guards, sidebar entries and
 * `AccessService` capabilities all read from here, so a screen can never be
 * visible in the menu yet blocked by its route (or vice versa).
 */
export const ACCESS_RULES = {
  dashboard: { anyPermission: [PERMISSIONS.dashboardView] },

  // ── Sales & collection ──
  clients: { anyPermission: [PERMISSIONS.clientsView, PERMISSIONS.clientsFullAccess] },
  clientsWrite: { anyPermission: [PERMISSIONS.clientsFullAccess] },
  /** A Representative's own account statement (`/representatives/me/statement`). */
  representativeSelfService: { anyRole: ['Representative'] },

  // ── Purchasing & inventory ──
  suppliers: { anyPermission: [PERMISSIONS.suppliersView] },
  purchaseInvoices: {
    anyPermission: [PERMISSIONS.purchaseInvoicesView, PERMISSIONS.suppliersView],
  },
  purchaseInvoicesWrite: {
    anyPermission: [
      PERMISSIONS.purchaseInvoicesFullAccess,
      PERMISSIONS.suppliersFullAccess,
    ],
  },
  /** Warehouses, stock alerts, transfers, products and categories. */
  inventory: { anyPermission: [PERMISSIONS.suppliersView] },

  // ── Finance ──
  /** Treasuries, inter-treasury transfers and the financial position. */
  treasury: { anyPermission: [PERMISSIONS.treasuryView] },
  /** `GET /dashboard/vouchers` is served under Treasury.View. */
  vouchers: { anyPermission: [PERMISSIONS.treasuryView] },
  subAccounts: {
    anyPermission: [PERMISSIONS.subAccountsView, PERMISSIONS.subAccountsFullAccess],
  },
  shareholders: { anyPermission: [PERMISSIONS.shareholdersView] },

  // ── System ──
  userManagement: { anyPermission: [PERMISSIONS.userManagement] },
} as const satisfies Record<string, AccessRequirement>;

export type AccessRuleKey = keyof typeof ACCESS_RULES;
