import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LayoutService } from '../../../core/services/layout.service';
import { BADGE_CLASS_MAP, BadgeType } from '../../../core/constants/badge.constants';
import { getMappedClass } from '../../../core/utils/class-map.util';
import { NAV_SECTIONS } from '../../../core/constants/nav.constants';
import { NavIconComponent, NavIconName } from '../../../shared/components/nav-icon/nav-icon.component';
import { NavCountsStore } from '../../../core/stores/nav-counts.store';
import { NotificationsStore } from '../../../core/stores/notifications.store';
import { AccessService } from '../../../core/services/access.service';
import { AccessRequirement } from '../../../core/constants/access-rules.const';

/**
 * Keys of `NavCountsStore` signals that nav items can bind to. The
 * sidebar reads the live count + its pulse tick from the store whenever
 * a nav item declares one of these as its `badgeKey`.
 */
export type NavBadgeKey =
  | 'overdueClients'
  | 'pendingClientOrders'
  | 'lowStockProducts'
  | 'pendingDownPayments'
  | 'unreadNotifications';

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
   * Visibility rule — use the same `ACCESS_RULES` entry as the route guard
   * so the entry shows exactly when its page is reachable. Omit to make the
   * item visible to every authenticated user.
   */
  access?: AccessRequirement;
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
  protected readonly notifications = inject(NotificationsStore);
  private readonly access = inject(AccessService);

  /**
   * Sidebar reflows whenever the session changes (login, permission sync,
   * cross-tab refresh) — `AccessService.satisfies` reads session signals.
   * Sections whose items are all hidden are dropped wholesale so we don't
   * render orphan headers.
   */
  protected readonly visibleSections = computed(() =>
    NAV_SECTIONS
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => this.access.satisfies(item.access)),
      }))
      .filter((section) => section.items.length > 0),
  );

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
      case 'pendingDownPayments': return this.counts.pendingDownPayments();
      case 'unreadNotifications': return this.notifications.unreadCount();
    }
  }

  /** Pulse tick for the given store key — re-triggers the bump animation. */
  livePulse(key?: NavBadgeKey): number {
    if (!key) return 0;
    switch (key) {
      case 'overdueClients':      return this.counts.overduePulse();
      case 'pendingClientOrders': return this.counts.pendingPulse();
      case 'lowStockProducts':    return this.counts.lowStockPulse();
      case 'pendingDownPayments': return this.counts.pendingDownPaymentsPulse();
      case 'unreadNotifications': return this.notifications.unreadPulse();
    }
  }
}
