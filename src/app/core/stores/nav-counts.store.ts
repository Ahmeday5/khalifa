import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { DashboardService } from '../../features/dashboard/services/dashboard.service';
import { CatalogService } from '../../features/catalog/services/catalog.service';
import { CustomersService } from '../../features/customers/services/customers.service';
import { HttpCacheService } from '../services/http-cache.service';

/**
 * Single source of truth for the live counters surfaced in the sidebar
 * badges and the topbar pills.
 *
 * Sources:
 *   - `overdueClients`   ← /dashboard/clients (overdueClientsCount field)
 *                          — same value the customers list page shows; the
 *                          home-summary counterpart is computed differently
 *                          on the backend and was observed to lag.
 *   - `lowStockProducts` ← HomeSummaryDto.lowStock.productsCount
 *   - `pendingClientOrders` ← /dashboard/client-orders filtered to `Pending`
 *
 * The store re-fetches automatically when any of these cache patterns
 * invalidate (a payment recorded elsewhere, an order accepted/rejected,
 * a contract created, a stock movement, etc.) so badges stay in sync
 * without a manual refresh — even across browser tabs, via the
 * `HttpCacheService` cross-tab BroadcastChannel.
 *
 * Each counter also tracks a `*Bumped` tick that flips briefly whenever
 * its value increases. The UI uses it to play a one-shot pulse animation,
 * giving the user visible feedback that "something just changed".
 */
@Injectable({ providedIn: 'root' })
export class NavCountsStore {
  private readonly dashboard = inject(DashboardService);
  private readonly catalog = inject(CatalogService);
  private readonly customers = inject(CustomersService);
  private readonly cache = inject(HttpCacheService);

  // ── raw counts ──
  private readonly _overdueClients = signal<number>(0);
  private readonly _pendingClientOrders = signal<number>(0);
  private readonly _lowStockProducts = signal<number>(0);

  // ── public readonly views ──
  readonly overdueClients = this._overdueClients.asReadonly();
  readonly pendingClientOrders = this._pendingClientOrders.asReadonly();
  readonly lowStockProducts = this._lowStockProducts.asReadonly();

  /** True when there is at least one item worth showing in the alert pill. */
  readonly hasAlerts = computed(
    () =>
      this._overdueClients() > 0 ||
      this._pendingClientOrders() > 0 ||
      this._lowStockProducts() > 0,
  );

  // ── pulse ticks (incremented each time a count rises) ──
  private readonly _overduePulse = signal(0);
  private readonly _pendingPulse = signal(0);
  private readonly _lowStockPulse = signal(0);

  readonly overduePulse = this._overduePulse.asReadonly();
  readonly pendingPulse = this._pendingPulse.asReadonly();
  readonly lowStockPulse = this._lowStockPulse.asReadonly();

  /** Loading flag for the very first load. UI uses it to render a skeleton. */
  readonly loading = signal<boolean>(true);

  constructor() {
    this.refreshAll(false);

    // Auto-refresh on relevant cache invalidations.
    //
    // The patterns are intentionally broad — services use specific keys
    // like `'contract'`, `'payment'`, `'installment'` etc., and any one of
    // them can affect more than one counter. We let `refreshAll` do the
    // de-dup: a single tick triggers at most one fetch per source, and the
    // HTTP cache will serve fresh data within its TTL anyway.
    const refetch = (pattern: string, fn: () => void) => {
      effect(() => {
        const event = this.cache.invalidations();
        if (!event.pattern) return;
        if (!event.pattern.includes(pattern)) return;
        fn();
      });
    };

    refetch('payment', () => {
      this.refreshOverdue();
      this.refreshLowStock();
    });
    refetch('installment', () => {
      this.refreshOverdue();
    });
    refetch('contract', () => {
      this.refreshOverdue();
      this.refreshLowStock();
      this.refreshClientOrders();
    });
    refetch('client', () => this.refreshOverdue());
    refetch('client-orders', () => this.refreshClientOrders());
    refetch('warehous', () => this.refreshLowStock());
    refetch('product', () => this.refreshLowStock());
    refetch('home-summary', () => this.refreshLowStock());
  }

  /** Force a full reload from all sources. */
  refreshAll(force: boolean): void {
    this.loading.set(true);
    this.refreshOverdue(force);
    this.refreshLowStock(force);
    this.refreshClientOrders(force);
  }

  /**
   * Reads the overdue count from `GET /dashboard/clients` (pageSize=1).
   * The endpoint returns `overdueClientsCount` independently of the paged
   * `clients.data` array, so a 1-row request is the cheapest accurate read.
   */
  private refreshOverdue(force = true): void {
    const query = { pageIndex: 1, pageSize: 1 } as const;
    const stream$ = force
      ? this.customers.refreshDashboard(query)
      : this.customers.listDashboard(query);

    stream$.subscribe({
      next: (res) => {
        this.bumpIfHigher(
          this._overdueClients,
          this._overduePulse,
          res?.overdueClientsCount ?? 0,
        );
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private refreshLowStock(force = true): void {
    const stream$ = force
      ? this.dashboard.refreshHomeSummary()
      : this.dashboard.homeSummary();

    stream$.subscribe({
      next: (s) => {
        this.bumpIfHigher(
          this._lowStockProducts,
          this._lowStockPulse,
          s.lowStock?.productsCount ?? 0,
        );
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private refreshClientOrders(force = true): void {
    // `/dashboard/client-orders` is server-paginated with no status filter,
    // so the pending total is scanned server-side by CatalogService rather
    // than filtered from a single page here.
    this.catalog.pendingClientOrdersCount(force).subscribe({
      next: (pending) => {
        this.bumpIfHigher(
          this._pendingClientOrders,
          this._pendingPulse,
          pending,
        );
      },
      error: () => {},
    });
  }

  /**
   * Update `target` to `next`. If `next` strictly exceeds the previous
   * value, also tick the pulse signal so the UI can play a one-shot
   * animation. Equal/lower values update without a pulse — we don't want
   * to pulse on the natural "user paid an installment → overdue count
   * dropped" path.
   */
  private bumpIfHigher(
    target: ReturnType<typeof signal<number>>,
    pulse: ReturnType<typeof signal<number>>,
    next: number,
  ): void {
    const prev = target();
    if (next === prev) return;
    target.set(next);
    if (next > prev) pulse.update((t) => t + 1);
  }
}
