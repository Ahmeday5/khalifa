import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LayoutService } from '../../../core/services/layout.service';
import { BADGE_CLASS_MAP, BadgeType } from '../../../core/constants/badge.constants';
import { getMappedClass } from '../../../core/utils/class-map.util';
import { NAV_SECTIONS } from '../../../core/constants/nav.constants';
import { NavIconComponent, NavIconName } from '../../../shared/components/nav-icon/nav-icon.component';
import { NavCountsStore } from '../../../core/stores/nav-counts.store';
import { AuthService } from '../../../core/services/auth.service';
import { Permission } from '../../../core/constants/permissions.const';
import { UserRole } from '../../../core/models/auth.model';

/**
 * Keys of `NavCountsStore` signals that nav items can bind to. The
 * sidebar reads the live count + its pulse tick from the store whenever
 * a nav item declares one of these as its `badgeKey`.
 */
export type NavBadgeKey =
  | 'overdueClients'
  | 'pendingClientOrders'
  | 'lowStockProducts';

export interface NavItem {
  id: string;
  label: string;
  route: string;
  icon: NavIconName;
  /** Static badge — used only when `badgeKey` is not provided. */
  badge?: string;
  badgeType?: 'red' | 'amber' | 'green' | 'whatsapp';
  /** Live counter source from `NavCountsStore`. Hides the badge when count is 0. */
  badgeKey?: NavBadgeKey;
  /**
   * Permission gate. Item is hidden unless the current user holds at least
   * ONE of the listed permissions. Omit (or pass an empty array) to make
   * the item visible to everyone.
   */
  requiredAnyPermission?: ReadonlyArray<Permission | string>;
  /**
   * Role gate. When set, the item shows only if the current user's role is
   * one of these — used for role-exclusive entries (e.g. a Representative's
   * "my account") that no permission string cleanly isolates.
   */
  requiredAnyRole?: ReadonlyArray<UserRole>;
  /**
   * Role exclusion — takes precedence over every other gate. The item is
   * hidden for these roles even if their permissions would otherwise grant
   * it (e.g. hide `shareholders` from a Representative the backend gave
   * `Treasury.View`).
   */
  hideForRoles?: ReadonlyArray<UserRole>;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, NavIconComponent],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  protected readonly layout = inject(LayoutService);
  protected readonly counts = inject(NavCountsStore);
  private readonly auth = inject(AuthService);

  /**
   * Sidebar reflows whenever the user's permission set changes (login,
   * cross-tab session refresh). Sections whose items all evaluate to
   * hidden are dropped wholesale so we don't render orphan headers.
   */
  protected readonly visibleSections = computed(() => {
    const set = this.auth.permissionSet();
    const role = this.auth.currentUser()?.role;
    return NAV_SECTIONS
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          // Role exclusion wins over any grant.
          if (item.hideForRoles?.length && role && item.hideForRoles.includes(role)) {
            return false;
          }
          const hasPermGate = !!item.requiredAnyPermission?.length;
          const hasRoleGate = !!item.requiredAnyRole?.length;
          // No gate at all → visible to everyone.
          if (!hasPermGate && !hasRoleGate) return true;
          // Gates are OR-ed: an item declaring both shows when the user
          // satisfies *either* (e.g. invoices = supplier permission OR the
          // Representative role). Items with a single gate are unaffected.
          const permMatch =
            hasPermGate &&
            item.requiredAnyPermission!.some((p) => set.has(p));
          const roleMatch =
            hasRoleGate && !!role && item.requiredAnyRole!.includes(role);
          return permMatch || roleMatch;
        }),
      }))
      .filter((section) => section.items.length > 0);
  });

  getBadgeClass(type?: BadgeType): string {
    return getMappedClass(BADGE_CLASS_MAP, type ?? 'red', 'red');
  }

  /** Live count for the given store key, or 0 when not bound. */
  liveCount(key?: NavBadgeKey): number {
    if (!key) return 0;
    switch (key) {
      case 'overdueClients':      return this.counts.overdueClients();
      case 'pendingClientOrders': return this.counts.pendingClientOrders();
      case 'lowStockProducts':    return this.counts.lowStockProducts();
    }
  }

  /** Pulse tick for the given store key — re-triggers the bump animation. */
  livePulse(key?: NavBadgeKey): number {
    if (!key) return 0;
    switch (key) {
      case 'overdueClients':      return this.counts.overduePulse();
      case 'pendingClientOrders': return this.counts.pendingPulse();
      case 'lowStockProducts':    return this.counts.lowStockPulse();
    }
  }
}
