import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { WarehouseService } from '../../services/warehouse.service';
import {
  Warehouse,
  WarehouseInventoryItem,
  WarehouseSummary,
} from '../../models/warehouse.model';
import { WarehouseFormModalComponent } from '../../components/warehouse-form-modal/warehouse-form-modal.component';
import { FormMode } from '../../../../shared/models/form-mode.model';
import { DialogService } from '../../../../core/services/dialog.service';
import { ToastService } from '../../../../core/services/toast.service';
import { HttpCacheService } from '../../../../core/services/http-cache.service';
import { onInvalidate } from '../../../../core/utils/auto-refresh.util';
import { ApiError } from '../../../../core/models/api-response.model';
import { HasPermissionDirective } from '../../../../shared/directives/has-permission.directive';
import { PERMISSIONS } from '../../../../core/constants/permissions.const';

/**
 * Per-card cycling palette. The summary endpoint doesn't expose a "color"
 * yet, so we rotate through three tones to match the prototype's visual
 * rhythm (teal / purple / amber). Picked deterministically by card index
 * so the same warehouse always gets the same color across renders.
 */
const CARD_PALETTE = ['te', 'pu', 'am'] as const;
const BADGE_PALETTE = ['bte', 'bpu', 'bwarn'] as const;

const INVENTORY_PAGE_SIZE = 10;

/**
 * Warehouse home page.
 *
 * Owns three concerns:
 *
 *   1. Live warehouse summary (`/dashboard/warehouses/summary`) — drives
 *      the card grid with real purchased/sold/available/value/profit.
 *
 *   2. Live per-warehouse inventory (`/dashboard/warehouses/inventory`)
 *      — paginated + name-searchable, fed by a warehouse picker.
 *
 *   3. CRUD modal (create / edit / delete) for warehouses themselves.
 *      Every successful mutation re-fetches the summary so the cards
 *      stay canonical (no optimistic drift).
 */
@Component({
  selector: 'app-warehouse-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DecimalPipe,
    CurrencyArPipe,
    PaginationComponent,
    WarehouseFormModalComponent,
    HasPermissionDirective,
  ],
  templateUrl: './warehouse-home.component.html',
  styleUrl: './warehouse-home.component.scss',
})
export class WarehouseHomeComponent implements OnInit {
  private readonly svc    = inject(WarehouseService);
  private readonly dialog = inject(DialogService);
  private readonly toast  = inject(ToastService);

  /** Exposed so the template can gate write actions with `*appHasPermission`. */
  protected readonly PERMS = PERMISSIONS;
  private readonly cache  = inject(HttpCacheService);

  constructor() {
    // Auto-refresh whenever any warehouse-related cache key is
    // invalidated — own CRUD, plus any invoice/inventory mutation
    // that touches the per-warehouse aggregates.
    onInvalidate(this.cache, 'warehous', () => {
      this.refreshSummary();
      // Refresh the inventory pane too if a warehouse is selected.
      if (this.selectedWarehouseId()) this.refreshInventory();
    });
  }

  // ── live summary (cards) ──
  protected readonly warehouses = signal<WarehouseSummary[]>([]);
  protected readonly loading    = signal(false);

  // ── live inventory (table) ──
  protected readonly inventory   = signal<WarehouseInventoryItem[]>([]);
  protected readonly invLoading  = signal(false);
  /** Selected warehouse for the inventory table; 0 = no selection. */
  protected readonly selectedWarehouseId = signal<number>(0);
  protected readonly invSearch   = signal('');
  protected readonly invPageIndex = signal(1);
  protected readonly invPageSize  = signal(INVENTORY_PAGE_SIZE);
  protected readonly invCount      = signal(0);
  protected readonly invTotalPages = signal(0);

  // ── modal state ──
  protected readonly modalOpen      = signal(false);
  protected readonly modalMode      = signal<FormMode>('create');
  protected readonly modalWarehouse = signal<Warehouse | null>(null);
  protected readonly deletingId     = signal<number | null>(null);

  // ── derived ──
  protected readonly hasWarehouses = computed(
    () => this.warehouses().length > 0,
  );
  protected readonly criticalCount = computed(
    () => this.warehouses().filter((w) => w.needsRestock).length,
  );

  /** Search-only debounce — pagination + warehouse changes fire immediately. */
  private invDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.loadSummary();
  }

  // ─────────── data loaders ───────────

  protected loadSummary(): void {
    this.fetchSummary(false);
  }

  /** Force-refresh the summary cards, bypassing the cache. */
  protected refreshSummary(): void {
    this.fetchSummary(true);
  }

  private fetchSummary(force: boolean): void {
    this.loading.set(true);
    const stream$ = force ? this.svc.refreshSummary() : this.svc.summary();
    stream$.subscribe({
      next: (list) => {
        this.warehouses.set(list ?? []);
        this.loading.set(false);
        // Auto-select the first active warehouse on first load so the
        // inventory pane shows something immediately.
        if (this.selectedWarehouseId() === 0) {
          const first = (list ?? []).find((w) => w.isActive);
          if (first) {
            this.selectedWarehouseId.set(first.id);
            this.fetchInventoryNow();
          }
        }
      },
      error: () => {
        this.warehouses.set([]);
        this.loading.set(false);
      },
    });
  }

  protected refreshInventory(): void {
    this.fetchInventoryNow(true);
  }

  /**
   * Fire an inventory fetch immediately (no debounce). Used by warehouse
   * picker, pagination, manual refresh — anything that maps to a single
   * deliberate user action where waiting would feel sluggish.
   */
  private fetchInventoryNow(force = false): void {
    if (this.invDebounceTimer) {
      clearTimeout(this.invDebounceTimer);
      this.invDebounceTimer = null;
    }
    this.fetchInventory(force);
  }

  /**
   * Fire an inventory fetch after 300ms — used by the search input so
   * typing doesn't issue a request per keystroke.
   */
  private fetchInventoryDebounced(): void {
    if (this.invDebounceTimer) clearTimeout(this.invDebounceTimer);
    this.invDebounceTimer = setTimeout(() => this.fetchInventory(false), 300);
  }

  private fetchInventory(force: boolean): void {
    const warehouseId = this.selectedWarehouseId();
    if (!warehouseId) {
      this.inventory.set([]);
      this.invCount.set(0);
      this.invTotalPages.set(0);
      return;
    }

    const query = {
      warehouseId,
      search: this.invSearch().trim(),
      pageIndex: this.invPageIndex(),
      pageSize: this.invPageSize(),
    };

    this.invLoading.set(true);
    const stream$ = force
      ? this.svc.refreshInventory(query)
      : this.svc.inventory(query);
    stream$.subscribe({
      next: (res) => {
        this.inventory.set(res?.data ?? []);
        this.invCount.set(res?.count ?? 0);
        this.invTotalPages.set(res?.totalPages ?? 0);
        this.invLoading.set(false);
      },
      error: () => {
        this.inventory.set([]);
        this.invCount.set(0);
        this.invTotalPages.set(0);
        this.invLoading.set(false);
      },
    });
  }

  // ─────────── inventory filter handlers ───────────

  protected onWarehouseChange(value: string): void {
    const id = Number(value) || 0;
    this.selectedWarehouseId.set(id);
    this.invPageIndex.set(1);
    this.fetchInventoryNow();
  }

  protected onInvSearch(value: string): void {
    this.invSearch.set(value);
    if (this.invPageIndex() !== 1) this.invPageIndex.set(1);
    this.fetchInventoryDebounced();
  }

  protected onInvPageChange(page: number): void {
    this.invPageIndex.set(page);
    this.fetchInventoryNow();
  }

  protected onInvPageSizeChange(size: number): void {
    this.invPageSize.set(size);
    this.invPageIndex.set(1);
    this.fetchInventoryNow();
  }

  // ─────────── modal handlers ───────────

  protected openCreate(): void {
    this.modalWarehouse.set(null);
    this.modalMode.set('create');
    this.modalOpen.set(true);
  }

  protected openEdit(warehouse: WarehouseSummary | Warehouse): void {
    this.modalWarehouse.set(this.toWarehouse(warehouse));
    this.modalMode.set('edit');
    this.modalOpen.set(true);
  }

  protected closeModal(): void {
    this.modalOpen.set(false);
  }

  protected onSaved(_saved: Warehouse): void {
    this.modalOpen.set(false);
    // Re-fetch from server (bypassing cache) so the cached entry that
    // survives F5 stays canonical — no optimistic drift.
    this.refreshSummary();
  }

  // ─────────── delete ───────────

  protected async confirmDelete(warehouse: WarehouseSummary): Promise<void> {
    const ok = await this.dialog.confirm({
      title: 'حذف مخزن',
      message: `هل أنت متأكد من حذف "${warehouse.name}"؟ هذا الإجراء لا يمكن التراجع عنه.`,
      confirmText: 'حذف',
      cancelText: 'إلغاء',
      type: 'danger',
    });
    if (!ok) return;

    this.deletingId.set(warehouse.id);
    this.svc.delete(warehouse.id).subscribe({
      next: () => {
        this.deletingId.set(null);
        this.toast.success('تم حذف المخزن بنجاح');
        this.refreshSummary();
        // If the deleted warehouse was selected for inventory, reset.
        if (this.selectedWarehouseId() === warehouse.id) {
          this.selectedWarehouseId.set(0);
        }
      },
      error: (_err: ApiError) => this.deletingId.set(null),
    });
  }

  // ─────────── view helpers ───────────

  protected colorVar(index: number): string {
    return `var(--${CARD_PALETTE[index % CARD_PALETTE.length]})`;
  }

  protected badgeClass(index: number): string {
    return BADGE_PALETTE[index % BADGE_PALETTE.length];
  }

  /**
   * Adapt a `WarehouseSummary` row (what the cards render from) into
   * the `Warehouse` shape the form modal expects. Avoids a separate
   * GET call when the user opens the edit dialog.
   */
  private toWarehouse(w: WarehouseSummary | Warehouse): Warehouse {
    return {
      id: w.id,
      name: w.name,
      location: w.location,
      isActive: w.isActive,
      createdAt: (w as Warehouse).createdAt ?? '',
    };
  }
}
