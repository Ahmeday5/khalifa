import { Injectable, Signal, computed, inject } from '@angular/core';
import { AuthService } from './auth.service';
import {
  ACCESS_RULES,
  AccessRequirement,
} from '../constants/access-rules.const';
import { UserRole } from '../models/auth.model';

/**
 * Single authority for "can the current user see / do X?".
 *
 * Feature code asks for a named capability (`canViewTreasury`) instead of
 * hard-coding permission strings or role names, so a backend policy change
 * is a one-line edit in `ACCESS_RULES` rather than a hunt through templates.
 * Every capability is a signal derived from the session, so gated UI
 * reflows automatically on login, logout and cross-tab session updates.
 *
 * The backend remains the enforcement point — this service only keeps the
 * UI from offering (and requesting) things that would come back 403.
 */
@Injectable({ providedIn: 'root' })
export class AccessService {
  private readonly auth = inject(AuthService);

  readonly role = computed<UserRole | null>(
    () => this.auth.currentUser()?.role ?? null,
  );
  readonly isRepresentative = computed(() => this.role() === 'Representative');

  // ── Sales & collection ──
  readonly canViewClients = this.rule(ACCESS_RULES.clients);
  readonly canManageClients = this.rule(ACCESS_RULES.clientsWrite);

  // ── Purchasing & inventory ──
  readonly canViewSuppliers = this.rule(ACCESS_RULES.suppliers);
  readonly canViewPurchaseInvoices = this.rule(ACCESS_RULES.purchaseInvoices);
  /** Warehouses, stock alerts, transfers, products and categories. */
  readonly canViewInventory = this.rule(ACCESS_RULES.inventory);
  /**
   * Full product records (`GET /products/{id}`, pricing included). Users
   * without it still pick products through `/products/lookup`.
   */
  readonly canViewProductDetails = this.canViewInventory;

  // ── Finance ──
  readonly canViewTreasury = this.rule(ACCESS_RULES.treasury);
  readonly canViewVouchers = this.rule(ACCESS_RULES.vouchers);
  readonly canViewSubAccounts = this.rule(ACCESS_RULES.subAccounts);
  readonly canViewShareholders = this.rule(ACCESS_RULES.shareholders);
  /** `GET /dashboard/financial-separation` — company-wide financial position. */
  readonly canViewFinancialSeparation = this.canViewTreasury;
  /**
   * `GET /dashboard/expenses` is forbidden for the Representative role
   * regardless of permissions (the backend gates it by role).
   */
  readonly canViewExpenses = computed(() => !this.isRepresentative());

  // ── System ──
  readonly canManageUsers = this.rule(ACCESS_RULES.userManagement);

  /** Evaluates a declarative requirement against the current session. */
  satisfies(requirement: AccessRequirement | null | undefined): boolean {
    const perms = requirement?.anyPermission ?? [];
    const roles = requirement?.anyRole ?? [];
    if (perms.length === 0 && roles.length === 0) return true;

    const permOk = perms.length > 0 && this.auth.hasAnyPermission(perms);
    const roleOk = roles.length > 0 && this.auth.hasAnyRole(roles);
    return permOk || roleOk;
  }

  /** Reactive view of {@link satisfies} — re-evaluates when the session changes. */
  private rule(requirement: AccessRequirement): Signal<boolean> {
    return computed(() => this.satisfies(requirement));
  }
}
