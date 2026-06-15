import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { InventoryService } from '../../services/inventory.service';
import {
  InventoryAlertItem,
  InventoryAlertLevel,
  InventoryAlertSummary,
} from '../../models/warehouse.model';
import {
  INVENTORY_LEVEL_META,
  INVENTORY_LEVEL_ORDER,
  InventoryLevelMeta,
} from '../../constants/inventory-alert-levels';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HasPermissionDirective } from '../../../../shared/directives/has-permission.directive';
import { PERMISSIONS } from '../../../../core/constants/permissions.const';

const EMPTY_SUMMARY: InventoryAlertSummary = {
  outOfStockCount: 0,
  criticalCount: 0,
  monitoringCount: 0,
};

@Component({
  selector: 'app-inv-alerts',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DecimalPipe, HasPermissionDirective],
  templateUrl: './inv-alerts.component.html',
  styleUrl: './inv-alerts.component.scss',
})
export class InvAlertsComponent implements OnInit {
  private readonly svc = inject(InventoryService);
  private readonly destroyRef = inject(DestroyRef);

  /** Exposed so the template can gate write actions with `*appHasPermission`. */
  protected readonly PERMS = PERMISSIONS;

  // ── data ──
  protected readonly alerts = signal<InventoryAlertItem[]>([]);
  protected readonly summary = signal<InventoryAlertSummary>(EMPTY_SUMMARY);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  // ── filters ──
  /** `null` = no level filter applied (show everything). */
  protected readonly levelFilter = signal<InventoryAlertLevel | null>(null);
  protected readonly search = signal('');

  // ── meta exposed to the template ──
  protected readonly levelOrder = INVENTORY_LEVEL_ORDER;
  protected readonly levelMeta = INVENTORY_LEVEL_META;

  // ── derived ──
  protected readonly hasResults = computed(
    () => this.filteredAlerts().length > 0,
  );
  protected readonly hasSearch = computed(
    () => this.search().trim().length > 0,
  );

  /** Total of all alert items regardless of level — for the "الكل" chip. */
  protected readonly totalCount = computed(() => this.alerts().length);

  /** Search applied client-side over the level-filtered server response. */
  protected readonly filteredAlerts = computed(() => {
    const term = this.search().trim().toLowerCase();
    if (!term) return this.alerts();
    return this.alerts().filter((a) => {
      if (a.productName.toLowerCase().includes(term)) return true;
      return a.warehouseBreakdown.some((w) =>
        w.warehouseName.toLowerCase().includes(term),
      );
    });
  });

  /** Net stock value across the visible rows — surfaces blast radius at a glance. */
  protected readonly totalQuantity = computed(() =>
    this.filteredAlerts().reduce((sum, a) => sum + a.totalQuantity, 0),
  );

  ngOnInit(): void {
    this.fetch(undefined, false);
  }

  // ─────────── data loading ───────────

  private fetch(level: InventoryAlertLevel | undefined, force: boolean): void {
    this.loading.set(true);
    this.error.set(null);

    const stream$ = force
      ? this.svc.refreshAlerts({ level })
      : this.svc.alerts({ level });

    stream$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        this.alerts.set(res.alerts);
        this.summary.set(res.summary);
        this.loading.set(false);
      },
      error: () => {
        this.alerts.set([]);
        this.summary.set(EMPTY_SUMMARY);
        this.error.set('تعذّر تحميل تنبيهات المخزون. حاول مجددًا.');
        this.loading.set(false);
      },
    });
  }

  // ─────────── filter handlers ───────────

  protected selectLevel(level: InventoryAlertLevel | null): void {
    if (this.levelFilter() === level) return;

    this.levelFilter.set(level);

    this.fetch(level ?? undefined, false);
  }

  protected onSearch(value: string): void {
    this.search.set(value);
  }

  protected clearSearch(): void {
    if (!this.search()) return;
    this.search.set('');
  }

  protected refresh(): void {
    this.fetch(this.levelFilter() ?? undefined, true);
  }

  // ─────────── view helpers ───────────

  protected metaFor(level: InventoryAlertLevel): InventoryLevelMeta {
    return this.levelMeta[level];
  }

  /** Count by level — drives the chip badges. */
  protected countFor(level: InventoryAlertLevel): number {
    const s = this.summary();
    switch (level) {
      case 'OutOfStock':
        return s.outOfStockCount;
      case 'Critical':
        return s.criticalCount;
      case 'NeedsMonitoring':
        return s.monitoringCount;
      case 'Sufficient':
        // Summary endpoint doesn't expose this; fall back to a client count
        // when the Sufficient chip is active so the badge isn't empty.
        return this.levelFilter() === 'Sufficient'
          ? this.alerts().filter((a) => a.level === 'Sufficient').length
          : 0;
    }
  }
}
