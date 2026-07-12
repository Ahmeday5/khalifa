import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { forkJoin } from 'rxjs';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { DialogService } from '../../../../core/services/dialog.service';
import { ToastService } from '../../../../core/services/toast.service';
import { HttpCacheService } from '../../../../core/services/http-cache.service';
import { onInvalidate } from '../../../../core/utils/auto-refresh.util';
import { ApiError } from '../../../../core/models/api-response.model';
import { FormMode } from '../../../../shared/models/form-mode.model';
import { RepsService } from '../../services/reps.service';
import {
  Representative,
  RepresentativePermission,
  RepresentativeStatus,
  RepresentativeSubTreasury,
} from '../../models/rep.model';
import { RepFormModalComponent } from '../../components/rep-form-modal/rep-form-modal.component';
import { RepStatementModalComponent } from '../../components/rep-statement-modal/rep-statement-modal.component';
import { CommissionPayoutModalComponent } from '../../components/commission-payout-modal/commission-payout-modal.component';
import { CommissionPayoutsModalComponent } from '../../components/commission-payouts-modal/commission-payouts-modal.component';
import { AssignAreasModalComponent } from '../../components/assign-areas-modal/assign-areas-modal.component';
import {
  REP_PERMISSION_BADGE,
  REP_PERMISSION_LABELS,
  REP_STATUS_BADGE,
  REP_STATUS_LABELS,
} from '../../constants/rep-meta';
import { BadgeType } from '../../../../shared/components/badge/badge.component';
import { PERMISSIONS } from '../../../../core/constants/permissions.const';
import { CommonModule } from '@angular/common';
import { HasPermissionDirective } from '../../../../shared/directives/has-permission.directive';
import { PrintService } from '../../../../core/services/print.service';
import { fetchAllPages } from '../../../../core/utils/api-list.util';

const DEFAULT_PAGE_SIZE = 10;

@Component({
  selector: 'app-reps-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyArPipe,
    BadgeComponent,
    PaginationComponent,
    RepFormModalComponent,
    RepStatementModalComponent,
    CommissionPayoutModalComponent,
    CommissionPayoutsModalComponent,
    AssignAreasModalComponent,
    CommonModule,
    HasPermissionDirective,
  ],
  templateUrl: './reps-list.component.html',
  styleUrl: './reps-list.component.scss',
})
export class RepsListComponent implements OnInit {
  private readonly service = inject(RepsService);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly cache = inject(HttpCacheService);
  private readonly printer = inject(PrintService);

  protected readonly isPrinting = signal(false);

  // ── data ──
  protected readonly reps = signal<Representative[]>([]);
  protected readonly loading = signal(false);

  // ── filters ──
  protected readonly searchTerm = signal('');
  protected readonly pageIndex = signal(1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);

  // ── pagination meta from server ──
  protected readonly count = signal(0);
  protected readonly totalPages = signal(0);

  // ── modal state ──
  protected readonly modalOpen = signal(false);
  protected readonly modalMode = signal<FormMode>('create');
  protected readonly modalRep = signal<Representative | null>(null);

  /** Tracks which row is currently being deleted, for inline button state. */
  protected readonly deletingId = signal<number | null>(null);

  // ── statement/payout modals ──
  protected readonly PERMS = PERMISSIONS;
  protected readonly statementOpen = signal(false);
  protected readonly statementRepId = signal<number | null>(null);
  protected readonly statementRepName = signal('');
  protected readonly payoutOpen = signal(false);
  protected readonly payoutRep = signal<Representative | null>(null);
  protected readonly payoutsHistoryOpen = signal(false);
  protected readonly assignAreasOpen = signal(false);
  protected readonly assignAreasRep = signal<Representative | null>(null);

  // ── derived ──
  protected readonly hasReps = computed(() => this.reps().length > 0);
  protected readonly hasFilters = computed(
    () => this.searchTerm().trim().length > 0,
  );
  protected readonly activeCount = computed(
    () => this.reps().filter((r) => r.status === 'Active').length,
  );

  /**
   * Sum of all sub-treasury balances on the current page. Surfaces
   * "money sitting with reps" without needing a dedicated endpoint.
   */
  protected readonly totalTreasuryBalance = computed(() =>
    this.reps().reduce((sum, r) => sum + (r.treasury?.currentBalance ?? 0), 0),
  );

  /** Weighted average performance rating across the page (0..5). */
  protected readonly avgPerformance = computed(() => {
    const list = this.reps();
    if (list.length === 0) return 0;
    const total = list.reduce((s, r) => s + (r.performanceRating ?? 0), 0);
    return total / list.length;
  });

  // ── debounce machinery ──
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly fetchTrigger = computed(() => ({
    search: this.searchTerm().trim(),
    pageIndex: this.pageIndex(),
    pageSize: this.pageSize(),
  }));

  constructor() {
    // Single source of truth for fetching — any signal change re-fires.
    effect(() => {
      const trigger = this.fetchTrigger();
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.fetch(trigger), 300);
    });

    // Auto-refresh when another tab or another part of the app
    // invalidates the representatives cache.
    onInvalidate(this.cache, 'representatives', () => this.refresh());
  }

  ngOnInit(): void {
    // The effect fires on first render — no explicit kickoff needed.
  }

  // ─────────── data loaders ───────────

  protected fetch(
    trigger: { search: string; pageIndex: number; pageSize: number },
    force = false,
  ): void {
    this.loading.set(true);
    const list$ = force
      ? this.service.refreshList(trigger)
      : this.service.list(trigger);
    const subs$ = force
      ? this.service.refreshSubTreasuries()
      : this.service.subTreasuries();

    forkJoin({ reps: list$, subs: subs$ }).subscribe({
      next: (res) => {
        const mapped = (res.reps?.data ?? []).map(rep => {
          const sub = (res.subs ?? []).find(s => s.representativeId === rep.id);
          return {
            ...rep,
            outstandingCommission: sub?.outstandingCommission ?? 0,
            accumulatedCommission: sub?.accumulatedCommission ?? 0,
            accumulatedProductCommission: sub?.accumulatedProductCommission ?? 0,
            totalAccumulatedCommission: sub?.totalAccumulatedCommission ?? 0,
            paidCommission: sub?.paidCommission ?? 0,
          };
        });
        this.reps.set(mapped);
        this.count.set(res.reps?.count ?? 0);
        this.totalPages.set(res.reps?.totalPages ?? 0);
        this.loading.set(false);
      },
      error: () => {
        this.reps.set([]);
        this.count.set(0);
        this.totalPages.set(0);
        this.loading.set(false);
      },
    });
  }

  protected refresh(): void {
    this.fetch(this.fetchTrigger(), true);
  }

  /**
   * Exports the full representatives roster matching the active search, with
   * the sub-treasury aggregates joined in. Server returns paged data, so we
   * walk every page before invoking the print service.
   */
  protected printReps(): void {
    if (this.isPrinting()) return;
    this.isPrinting.set(true);
    const search = this.searchTerm().trim();

    forkJoin({
      reps: fetchAllPages<Representative>((pageIndex, pageSize) =>
        this.service.refreshList({ search, pageIndex, pageSize }),
      ),
      subs: this.service.refreshSubTreasuries(),
    }).subscribe({
      next: ({ reps, subs }) => {
        const subsById = new Map<number, RepresentativeSubTreasury>();
        for (const s of subs ?? []) subsById.set(s.representativeId, s);
        const enriched = reps.map((rep) => {
          const sub = subsById.get(rep.id);
          return {
            ...rep,
            outstandingCommission: sub?.outstandingCommission ?? 0,
            accumulatedCommission: sub?.accumulatedCommission ?? 0,
            accumulatedProductCommission: sub?.accumulatedProductCommission ?? 0,
            totalAccumulatedCommission: sub?.totalAccumulatedCommission ?? 0,
            paidCommission: sub?.paidCommission ?? 0,
          };
        });

        this.isPrinting.set(false);
        this.printer.print<Representative>({
          title: 'قائمة المندوبين',
          subtitle: 'الأداء والعمولات وأرصدة الخزائن الفرعية',
          meta: search ? [{ label: 'بحث', value: search }] : undefined,
          orientation: 'landscape',
          columns: [
            { key: 'id',                header: '#',             align: 'center', width: '46px' },
            { key: 'fullName',          header: 'الاسم',         align: 'start', bold: true },
            { key: 'phoneNumber',       header: 'الهاتف',        align: 'start' },
            {
              key: 'permissions',
              header: 'الصلاحية',
              align: 'center',
              format: (v) => REP_PERMISSION_LABELS[v as RepresentativePermission] ?? String(v),
            },
            { key: 'profitRatePercent',     header: 'نسبة الربح', align: 'center', format: 'percent' },
            { key: 'performanceRating',    header: 'التقييم',    align: 'center', format: 'number' },
            {
              key: (r) => r.treasury?.currentBalance ?? 0,
              header: 'رصيد الخزينة',
              align: 'end',
              format: 'currency',
              bold: true,
            },
            { key: 'accumulatedCommission', header: 'عمولة مستحقة', align: 'end', format: 'currency' },
            { key: 'paidCommission',        header: 'المدفوع',       align: 'end', format: 'currency' },
            { key: 'outstandingCommission', header: 'المتبقي',       align: 'end', format: 'currency', bold: true },
            {
              key: 'status',
              header: 'الحالة',
              align: 'center',
              format: (v) => REP_STATUS_LABELS[v as RepresentativeStatus] ?? String(v),
            },
          ],
          rows: enriched,
        });
      },
      error: () => {
        this.isPrinting.set(false);
        this.toast.error('تعذر تجهيز ملف الطباعة');
      },
    });
  }

  // ─────────── filter handlers ───────────

  protected onSearch(value: string): void {
    this.searchTerm.set(value);
    if (this.pageIndex() !== 1) this.pageIndex.set(1);
  }

  protected clearSearch(): void {
    if (!this.searchTerm()) return;
    this.searchTerm.set('');
    this.pageIndex.set(1);
  }

  protected onPageChange(page: number): void {
    this.pageIndex.set(page);
  }

  protected onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.pageIndex.set(1);
  }

  // ─────────── modal handlers ───────────

  protected openCreate(): void {
    this.modalRep.set(null);
    this.modalMode.set('create');
    this.modalOpen.set(true);
  }

  protected openEdit(rep: Representative): void {
    this.modalRep.set(rep);
    this.modalMode.set('edit');
    this.modalOpen.set(true);
  }

  protected openView(rep: Representative): void {
    this.modalRep.set(rep);
    this.modalMode.set('view');
    this.modalOpen.set(true);
  }

  protected closeModal(): void {
    this.modalOpen.set(false);
  }

  protected onSaved(saved: Representative): void {
    const wasCreate = this.modalMode() === 'create';
    this.modalOpen.set(false);

    if (wasCreate) {
      // Jump to page 1 so the freshly-created rep is visible.
      if (this.pageIndex() !== 1) this.pageIndex.set(1);
      else this.refresh();
      return;
    }

    // Edit: update in-place to avoid a network round-trip when the row
    // is already on this page.
    const onPage = this.reps().some((r) => r.id === saved.id);
    if (onPage) {
      this.reps.update((list) =>
        list.map((r) => (r.id === saved.id ? saved : r)),
      );
    } else {
      this.refresh();
    }
  }

  // ─────────── delete ───────────

  protected async confirmDelete(rep: Representative): Promise<void> {
    const ok = await this.dialog.confirm({
      title: 'حذف مندوب',
      message: `هل أنت متأكد من حذف "${rep.fullName}"؟ سيتم أيضًا تعطيل خزينته الفرعية. هذا الإجراء لا يمكن التراجع عنه.`,
      confirmText: 'حذف',
      cancelText: 'إلغاء',
      type: 'danger',
    });
    if (!ok) return;

    this.deletingId.set(rep.id);
    this.service.delete(rep.id).subscribe({
      next: (res) => {
        this.deletingId.set(null);
        this.toast.success('تم حذف المندوب بنجاح');
        // If we just emptied the page (and it isn't the first), step back.
        if (this.reps().length === 1 && this.pageIndex() > 1) {
          this.pageIndex.update((p) => p - 1);
        } else {
          this.refresh();
        }
      },
      error: (err: ApiError) => {
        this.deletingId.set(null);
        this.toast.error(err.message || 'تعذّر حذف المندوب');
      },
    });
  }

  // ─────────── statement & payout modals ───────────

  protected openStatement(rep: Representative): void {
    this.statementRepId.set(rep.id);
    this.statementRepName.set(rep.fullName);
    this.statementOpen.set(true);
  }

  protected openPayout(rep: Representative): void {
    this.payoutRep.set(rep);
    this.payoutOpen.set(true);
  }

  protected openPayoutsHistory(): void {
    this.payoutsHistoryOpen.set(true);
  }

  protected onCommissionPaid(): void {
    this.payoutOpen.set(false);
    this.refresh();
  }

  protected openAssignAreas(rep: Representative): void {
    this.assignAreasRep.set(rep);
    this.assignAreasOpen.set(true);
  }

  protected onAreasAssigned(): void {
    this.assignAreasOpen.set(false);
  }

  // ─────────── view helpers ───────────

  protected statusLabel(status: RepresentativeStatus): string {
    return REP_STATUS_LABELS[status] ?? status;
  }

  protected statusBadge(status: RepresentativeStatus): BadgeType {
    return REP_STATUS_BADGE[status] ?? 'info';
  }

  protected permissionLabel(perm: RepresentativePermission): string {
    return REP_PERMISSION_LABELS[perm] ?? perm;
  }

  protected permissionBadge(perm: RepresentativePermission): BadgeType {
    return REP_PERMISSION_BADGE[perm] ?? 'info';
  }

  /** Render 0..5 as ★/☆ glyphs, rounded to the nearest whole. */
  protected stars(rating: number): boolean[] {
    const filled = Math.max(0, Math.min(5, Math.round(rating)));
    return Array.from({ length: 5 }, (_, i) => i < filled);
  }
}
