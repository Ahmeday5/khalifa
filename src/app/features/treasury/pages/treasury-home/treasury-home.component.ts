import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import {
  Treasury,
  TreasuryTransfer,
  TreasuryOperation,
  MonthlyProfit,
} from '../../models/treasury.model';
import { catchError, of } from 'rxjs';
import { TreasuryService } from '../../services/treasury.service';
import { RepsService } from '../../../reps/services/reps.service';
import { RepresentativeSubTreasury } from '../../../reps/models/rep.model';
import { LookupItem } from '../../../../core/models/lookup.model';
import { TreasuryFormModelComponent } from '../../components/treasury-form-model/treasury-form-model.component';
import { TreasuryTransferModalComponent } from '../../components/treasury-transfer-modal/treasury-transfer-modal.component';
import { SubAccountsPanelComponent } from '../../components/sub-accounts-panel/sub-accounts-panel.component';
import {
  BadgeComponent,
  BadgeType,
} from '../../../../shared/components/badge/badge.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { DateArPipe } from '../../../../shared/pipes/date-ar.pipe';
import { HasPermissionDirective } from '../../../../shared/directives/has-permission.directive';
import { PERMISSIONS } from '../../../../core/constants/permissions.const';
import { FormMode } from '../../../../shared/models/form-mode.model';
import { DialogService } from '../../../../core/services/dialog.service';
import { ToastService } from '../../../../core/services/toast.service';
import { HttpCacheService } from '../../../../core/services/http-cache.service';
import { AuthService } from '../../../../core/services/auth.service';
import { PrintService } from '../../../../core/services/print.service';
import { onInvalidate } from '../../../../core/utils/auto-refresh.util';
import { fetchAllPages } from '../../../../core/utils/api-list.util';
import { ApiError } from '../../../../core/models/api-response.model';
import { TreasuryType } from '../../enums/treasury-type.enum';
import {
  TREASURY_TYPE_BADGE,
  TREASURY_TYPE_LABELS,
} from '../../constants/treasury-type-labels';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-treasury-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TreasuryFormModelComponent,
    TreasuryTransferModalComponent,
    SubAccountsPanelComponent,
    BadgeComponent,
    PaginationComponent,
    CurrencyArPipe,
    DateArPipe,
    HasPermissionDirective,
    CommonModule,
  ],
  templateUrl: './treasury-home.component.html',
  styleUrl: './treasury-home.component.scss',
})
export class TreasuryHomeComponent implements OnInit {
  private readonly treasuryService = inject(TreasuryService);
  private readonly repsService = inject(RepsService);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly cache = inject(HttpCacheService);
  private readonly auth = inject(AuthService);
  private readonly printer = inject(PrintService);

  /** Exposed so the template can gate write actions with `*appHasPermission`. */
  protected readonly PERMS = PERMISSIONS;

  protected readonly isRep = computed(
    () => this.auth.currentUser()?.role === 'Representative',
  );

  /** Sub-accounts panel is visible to anyone with SubAccounts.View or SubAccounts.FullAccess. */
  protected readonly canManageSubAccounts = computed(() =>
    this.auth.hasAnyPermission([
      PERMISSIONS.subAccountsView,
      PERMISSIONS.subAccountsFullAccess,
    ]),
  );

  // ── data ──
  protected readonly treasuries = signal<Treasury[]>([]);
  protected readonly loading = signal(false);

  protected readonly representatives = signal<LookupItem[]>([]);
  private readonly repNameById = computed(() => {
    const map = new Map<number, string>();
    for (const r of this.representatives()) map.set(r.id, r.name);
    return map;
  });

  // ── representatives' sub-treasuries ──
  protected readonly subTreasuries = signal<RepresentativeSubTreasury[]>([]);
  protected readonly subTreasuriesLoading = signal(false);

  // ── modal state ──
  protected readonly modalOpen = signal(false);
  protected readonly modalMode = signal<FormMode>('create');
  protected readonly modalTreasury = signal<Treasury | null>(null);

  /** Tracks which row is currently being deleted, for inline button state. */
  protected readonly deletingId = signal<number | null>(null);

  // ── transfers state ──
  protected readonly transfers = signal<TreasuryTransfer[]>([]);
  protected readonly transfersLoading = signal(false);
  protected readonly transferModalOpen = signal(false);

  // transfer filters
  protected readonly tFromFilter = signal<number | ''>('');
  protected readonly tToFilter = signal<number | ''>('');
  protected readonly tFromDate = signal<string>('');
  protected readonly tToDate = signal<string>('');
  protected readonly tPageIndex = signal(1);
  protected readonly tPageSize = signal(10);

  // server pagination meta
  protected readonly tCount = signal(0);
  protected readonly tTotalPages = signal(0);

  // ── derived ──
  protected readonly hasTreasuries = computed(
    () => this.treasuries().length > 0,
  );

  /** Sum of `currentBalance` across every treasury — drives the hero number. */
  protected readonly totalBalance = computed(() =>
    this.treasuries().reduce((sum, t) => sum + (t.currentBalance ?? 0), 0),
  );

  /** Combined balance of all treasuries flagged as `Main`. */
  protected readonly mainBalance = computed(() =>
    this.treasuries()
      .filter((t) => t.type === TreasuryType.Main)
      .reduce((sum, t) => sum + (t.currentBalance ?? 0), 0),
  );

  /** Footer totals for the sub-treasuries table. */
  protected readonly subTreasuriesTotalBalance = computed(() =>
    this.subTreasuries().reduce((sum, s) => sum + (s.balance ?? 0), 0),
  );
  protected readonly subTreasuriesTotalCommission = computed(() =>
    this.subTreasuries().reduce(
      (sum, s) => sum + (s.accumulatedCommission ?? 0),
      0,
    ),
  );
  protected readonly subTreasuriesTotalSales = computed(() =>
    this.subTreasuries().reduce((sum, s) => sum + (s.totalSales ?? 0), 0),
  );
  protected readonly subTreasuriesTotalCost = computed(() =>
    this.subTreasuries().reduce((sum, s) => sum + (s.totalCost ?? 0), 0),
  );
  protected readonly subTreasuriesTotalProfit = computed(() =>
    this.subTreasuries().reduce((sum, s) => sum + (s.totalProfit ?? 0), 0),
  );
  protected readonly subTreasuriesTotalPaid = computed(() =>
    this.subTreasuries().reduce((sum, s) => sum + (s.paidCommission ?? 0), 0),
  );
  protected readonly subTreasuriesTotalOutstanding = computed(() =>
    this.subTreasuries().reduce(
      (sum, s) => sum + (s.outstandingCommission ?? 0),
      0,
    ),
  );

  // ── representative statement / commission-payout modals ──

  /** Combined trigger — any filter / page change refetches. */
  protected readonly transfersTrigger = computed(() => ({
    pageIndex: this.tPageIndex(),
    pageSize: this.tPageSize(),
    fromTreasuryId: this.tFromFilter(),
    toTreasuryId: this.tToFilter(),
    from: this.tFromDate(),
    to: this.tToDate(),
  }));

  protected readonly hasTransferFilters = computed(
    () =>
      !!this.tFromFilter() ||
      !!this.tToFilter() ||
      !!this.tFromDate() ||
      !!this.tToDate(),
  );

  /** Combined trigger — any filter / page change refetches. */
  protected readonly operationsTrigger = computed(() => ({
    pageIndex: this.oPageIndex(),
    pageSize: this.oPageSize(),
    treasuryId: this.oTreasuryFilter(),
    from: this.oFromDate(),
    to: this.oToDate(),
  }));

  protected readonly hasOperationFilters = computed(
    () => !!this.oTreasuryFilter() || !!this.oFromDate() || !!this.oToDate(),
  );

  /** Debounce handle for filter-driven transfer refetches. */
  private transfersDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // ── operations state ──
  protected readonly operations = signal<TreasuryOperation[]>([]);
  protected readonly operationsLoading = signal(false);
  /** Set while we fetch the full dataset for a print export. */
  protected readonly isPrintingOps = signal(false);
  private operationsDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // operations filters
  protected readonly oTreasuryFilter = signal<number | ''>('');
  protected readonly oFromDate = signal<string>('');
  protected readonly oToDate = signal<string>('');
  protected readonly oPageIndex = signal(1);
  protected readonly oPageSize = signal(10);

  // server pagination meta
  protected readonly oCount = signal(0);
  protected readonly oTotalPages = signal(0);

  // ── monthly profits state ──
  protected readonly monthlyProfits = signal<MonthlyProfit[]>([]);
  protected readonly monthlyProfitsLoading = signal(false);
  protected readonly selectedYear = signal<number | null>(null);
  private monthlyProfitsDebounceTimer: ReturnType<typeof setTimeout> | null =
    null;

  constructor() {
    // Auto-refresh whenever a treasury-related cache key is invalidated
    // anywhere (this tab or another via BroadcastChannel) — e.g. after
    // a treasury transfer was just created from this tab.
    onInvalidate(this.cache, 'treasur', () => {
      this.refresh();
      this.loadSubTreasuries(true);
      if (this.isRep()) return;
      this.fetchTransfers(this.transfersTrigger(), true);
      this.fetchOperations(this.operationsTrigger(), true);
      this.fetchMonthlyProfits(this.selectedYear(), true);
    });

    effect(() => {
      if (this.isRep()) return;
      const trigger = this.transfersTrigger();
      if (this.transfersDebounceTimer) {
        clearTimeout(this.transfersDebounceTimer);
      }
      this.transfersDebounceTimer = setTimeout(
        () => this.fetchTransfers(trigger, false),
        200,
      );
    });

    // Refetch operations on any filter / page change.
    effect(() => {
      if (this.isRep()) return;
      const trigger = this.operationsTrigger();
      if (this.operationsDebounceTimer) {
        clearTimeout(this.operationsDebounceTimer);
      }
      this.operationsDebounceTimer = setTimeout(
        () => this.fetchOperations(trigger, false),
        200,
      );
    });

    // Refetch monthly profits on year change.
    effect(() => {
      if (this.isRep()) return;
      const year = this.selectedYear();
      if (this.monthlyProfitsDebounceTimer) {
        clearTimeout(this.monthlyProfitsDebounceTimer);
      }
      this.monthlyProfitsDebounceTimer = setTimeout(
        () => this.fetchMonthlyProfits(year, false),
        200,
      );
    });
  }

  ngOnInit(): void {
    this.loadTreasuries();
    this.loadSubTreasuries(false);
    if (this.isRep()) return;
    this.loadRepresentatives();
    this.loadOperations();
    this.loadMonthlyProfits();
  }

  /** Lightweight reps lookup for resolving sub-rep treasury names. */
  private loadRepresentatives(): void {
    this.repsService
      .lookup()
      .pipe(catchError(() => of([] as LookupItem[])))
      .subscribe((items) => this.representatives.set(items));
  }

  /**
   * Resolves the display name of the representative linked to a sub-rep
   * treasury — prefers the server-provided name, falls back to the lookup.
   */
  protected repName(t: Treasury): string | null {
    if (t.type !== TreasuryType.SubRepresentative) return null;
    return (
      t.representative ??
      this.repNameById().get(t.representativeId ?? -1) ??
      null
    );
  }

  // ─────────────── sub-treasuries ───────────────

  protected loadSubTreasuries(force: boolean): void {
    this.subTreasuriesLoading.set(true);
    const stream$ = force
      ? this.repsService.refreshSubTreasuries()
      : this.repsService.subTreasuries();
    stream$.subscribe({
      next: (list) => {
        this.subTreasuries.set(list ?? []);
        this.subTreasuriesLoading.set(false);
      },
      error: () => {
        this.subTreasuries.set([]);
        this.subTreasuriesLoading.set(false);
      },
    });
  }

  // ─────────────── data loading ───────────────

  protected loadTreasuries(): void {
    this.fetch(false);
  }

  /**
   * Force-refresh from the server, bypassing the cache. Used after
   * any mutation so the local list — and the cached entry that survives
   * F5 — both reflect the canonical server state.
   */
  protected refresh(): void {
    this.fetch(true);
  }

  private fetch(force: boolean): void {
    this.loading.set(true);
    const stream$ = force
      ? this.treasuryService.refreshList()
      : this.treasuryService.list();
    stream$.subscribe({
      next: (list) => {
        this.treasuries.set(list ?? []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  // ─────────────── modal handlers ───────────────

  protected openCreate(): void {
    this.modalTreasury.set(null);
    this.modalMode.set('create');
    this.modalOpen.set(true);
  }

  protected closeModal(): void {
    this.modalOpen.set(false);
  }

  protected onSaved(_saved: Treasury): void {
    this.modalOpen.set(false);
    // Always re-fetch from server (bypassing cache) instead of an
    // optimistic local insert. The cached entry — which survives F5
    // via localStorage — gets replaced with the fresh list, so the
    // newly-saved treasury stays visible on hard refresh.
    this.refresh();
  }

  protected openEdit(treasury: Treasury): void {
    this.modalTreasury.set(treasury);
    this.modalMode.set('edit');
    this.modalOpen.set(true);
  }

  // ─────────────── delete ───────────────

  protected async confirmDelete(treasury: Treasury): Promise<void> {
    const ok = await this.dialog.confirm({
      title: 'حذف خزينة',
      message: `هل أنت متأكد من حذف "${treasury.name}"؟ هذا الإجراء لا يمكن التراجع عنه.`,
      confirmText: 'حذف',
      cancelText: 'إلغاء',
      type: 'danger',
    });
    if (!ok) return;

    this.deletingId.set(treasury.id);
    this.treasuryService.delete(treasury.id).subscribe({
      next: () => {
        this.deletingId.set(null);
        this.toast.success('تم حذف الخزينة بنجاح');
        // Re-fetch from server (bypassing cache) so subsequent reads
        // — including hard-refreshes — see the canonical list.
        this.refresh();
      },
      error: (_err: ApiError) => this.deletingId.set(null),
    });
  }

  // ─────────────── view helpers ───────────────

  protected typeLabel(type: TreasuryType): string {
    return TREASURY_TYPE_LABELS[type] ?? type;
  }

  protected typeBadge(type: TreasuryType): BadgeType {
    return TREASURY_TYPE_BADGE[type] ?? 'info';
  }

  // ─────────────── transfers ───────────────

  private fetchTransfers(
    trigger: ReturnType<typeof this.transfersTrigger>,
    force: boolean,
  ): void {
    this.transfersLoading.set(true);
    const stream$ = force
      ? this.treasuryService.refreshTransfers(trigger)
      : this.treasuryService.listTransfers(trigger);

    stream$.subscribe({
      next: (page) => {
        this.transfers.set(page?.data ?? []);
        this.tCount.set(page?.count ?? 0);
        this.tTotalPages.set(page?.totalPages ?? 0);
        this.transfersLoading.set(false);
      },
      error: () => {
        this.transfers.set([]);
        this.tCount.set(0);
        this.tTotalPages.set(0);
        this.transfersLoading.set(false);
      },
    });
  }

  protected refreshTransfers(): void {
    this.fetchTransfers(this.transfersTrigger(), true);
  }

  // transfer filter handlers
  protected onTransferFromChange(value: string): void {
    this.tFromFilter.set(value === '' ? '' : Number(value));
    this.resetTransfersPage();
  }

  protected onTransferToChange(value: string): void {
    this.tToFilter.set(value === '' ? '' : Number(value));
    this.resetTransfersPage();
  }

  protected onTransferFromDate(value: string): void {
    this.tFromDate.set(value);
    this.resetTransfersPage();
  }

  protected onTransferToDate(value: string): void {
    this.tToDate.set(value);
    this.resetTransfersPage();
  }

  protected clearTransferFilters(): void {
    this.tFromFilter.set('');
    this.tToFilter.set('');
    this.tFromDate.set('');
    this.tToDate.set('');
    this.resetTransfersPage();
  }

  protected onTransfersPageChange(page: number): void {
    this.tPageIndex.set(page);
  }

  protected onTransfersPageSizeChange(size: number): void {
    this.tPageSize.set(size);
    this.resetTransfersPage();
  }

  private resetTransfersPage(): void {
    if (this.tPageIndex() !== 1) this.tPageIndex.set(1);
  }

  // transfer modal handlers
  protected openTransfer(): void {
    this.transferModalOpen.set(true);
  }

  protected closeTransfer(): void {
    this.transferModalOpen.set(false);
  }

  protected onTransferSaved(_: TreasuryTransfer): void {
    this.transferModalOpen.set(false);
    // Cache invalidation in the service already triggers `onInvalidate`,
    // which re-fetches treasuries AND transfers — no manual refresh needed.
  }

  // ─────────────── operations ───────────────

  protected loadOperations(): void {
    this.fetchOperations(this.operationsTrigger(), false);
  }

  private fetchOperations(
    trigger: ReturnType<typeof this.operationsTrigger>,
    force: boolean,
  ): void {
    this.operationsLoading.set(true);
    const stream$ = force
      ? this.treasuryService.refreshOperations(trigger)
      : this.treasuryService.listOperations(trigger);

    stream$.subscribe({
      next: (page) => {
        this.operations.set(page?.data ?? []);
        this.oCount.set(page?.count ?? 0);
        this.oTotalPages.set(page?.totalPages ?? 0);
        this.operationsLoading.set(false);
      },
      error: () => {
        this.operations.set([]);
        this.oCount.set(0);
        this.oTotalPages.set(0);
        this.operationsLoading.set(false);
      },
    });
  }

  protected refreshOperations(): void {
    this.fetchOperations(this.operationsTrigger(), true);
  }

  // operations filter handlers
  protected onOperationsTreasuryChange(value: string): void {
    this.oTreasuryFilter.set(value === '' ? '' : Number(value));
    this.resetOperationsPage();
  }

  protected onOperationsFromDate(value: string): void {
    this.oFromDate.set(value);
    this.resetOperationsPage();
  }

  protected onOperationsToDate(value: string): void {
    this.oToDate.set(value);
    this.resetOperationsPage();
  }

  protected clearOperationFilters(): void {
    this.oTreasuryFilter.set('');
    this.oFromDate.set('');
    this.oToDate.set('');
    this.resetOperationsPage();
  }

  protected onOperationsPageChange(page: number): void {
    this.oPageIndex.set(page);
  }

  protected onOperationsPageSizeChange(size: number): void {
    this.oPageSize.set(size);
    this.resetOperationsPage();
  }

  private resetOperationsPage(): void {
    if (this.oPageIndex() !== 1) this.oPageIndex.set(1);
  }

  // operations view helpers
  protected directionBadge(direction: string): BadgeType {
    return direction === 'Receipt' ? 'ok' : 'bad';
  }

  protected directionLabel(direction: string): string {
    return direction === 'Receipt' ? 'إيراد' : 'صرف';
  }

  protected signedAmountClass(signedAmount: number): string {
    return signedAmount >= 0 ? 'trf-amount-positive' : 'trf-amount-negative';
  }

  protected readonly todayDate = new Date();

  /** Background flags for the export-PDF buttons. */
  protected readonly isPrintingTransfers = signal(false);
  protected readonly isPrintingSubTreasuries = signal(false);
  protected readonly isPrintingMonthlyProfits = signal(false);

  protected printOperations(): void {
    if (this.isPrintingOps()) return;
    this.isPrintingOps.set(true);

    // Fetch every page for the active filters — print exports always reflect
    // the *filtered* dataset, never just the visible page.
    const filters = this.operationsTrigger();
    fetchAllPages((pageIndex, pageSize) =>
      this.treasuryService.refreshOperations({
        ...filters,
        pageIndex,
        pageSize,
      }),
    ).subscribe({
      next: (rows) => {
        this.isPrintingOps.set(false);
        this.printer.print<TreasuryOperation>({
          title: 'سجل العمليات المالية في الخزينة',
          subtitle: 'حركات الإيرادات والمصروفات حسب الفلاتر المطبقة',
          meta: this.operationsPrintMeta(),
          orientation: 'landscape',
          columns: [
            {
              key: 'id',
              header: '#',
              align: 'center',
              width: '48px',
              format: (v) => `#${v}`,
            },
            {
              key: 'treasuryName',
              header: 'الخزينة',
              align: 'start',
              bold: true,
            },
            {
              key: 'direction',
              header: 'النوع',
              align: 'center',
              format: (v) => (v === 'Receipt' ? 'إيراد' : 'صرف'),
            },
            { key: 'description', header: 'الوصف', align: 'start' },
            {
              key: 'signedAmount',
              header: 'المبلغ',
              align: 'end',
              format: 'currency',
              bold: true,
            },
            {
              key: 'balanceAfter',
              header: 'الرصيد بعد',
              align: 'end',
              format: 'currency',
            },
            { key: 'userName', header: 'المستخدم', align: 'start' },
            {
              key: 'date',
              header: 'التاريخ',
              align: 'center',
              format: 'shortDate',
            },
          ],
          rows,
        });
      },
      error: () => {
        this.isPrintingOps.set(false);
        this.toast.error('تعذر تجهيز ملف الطباعة');
      },
    });
  }

  protected printTransfers(): void {
    if (this.isPrintingTransfers()) return;
    this.isPrintingTransfers.set(true);

    const filters = this.transfersTrigger();
    fetchAllPages((pageIndex, pageSize) =>
      this.treasuryService.refreshTransfers({
        ...filters,
        pageIndex,
        pageSize,
      }),
    ).subscribe({
      next: (rows) => {
        this.isPrintingTransfers.set(false);
        this.printer.print<TreasuryTransfer>({
          title: 'سجل التحويلات بين الخزائن',
          subtitle: 'كل التحويلات الواردة والصادرة بين الخزائن',
          meta: this.transfersPrintMeta(),
          orientation: 'landscape',
          columns: [
            {
              key: 'id',
              header: '#',
              align: 'center',
              width: '48px',
              format: (v) => `#${v}`,
            },
            {
              key: 'fromTreasuryName',
              header: 'من خزينة',
              align: 'start',
              bold: true,
            },
            {
              key: 'toTreasuryName',
              header: 'إلى خزينة',
              align: 'start',
              bold: true,
            },
            {
              key: 'amount',
              header: 'المبلغ',
              align: 'end',
              format: 'currency',
              bold: true,
            },
            {
              key: 'transferDate',
              header: 'التاريخ',
              align: 'center',
              format: 'shortDate',
            },
            { key: 'notes', header: 'ملاحظات', align: 'start' },
          ],
          totals: {
            label: 'إجمالي التحويلات',
            labelColSpan: 3,
            cells: [
              this.formatCurrencyTotal(
                rows.reduce((s, r) => s + (r.amount ?? 0), 0),
              ),
              '',
              '',
            ],
          },
          rows,
        });
      },
      error: () => {
        this.isPrintingTransfers.set(false);
        this.toast.error('تعذر تجهيز ملف الطباعة');
      },
    });
  }

  protected printSubTreasuries(): void {
    if (this.isPrintingSubTreasuries()) return;
    const rows = this.subTreasuries();
    if (rows.length === 0) return;
    this.isPrintingSubTreasuries.set(true);

    this.printer.print<RepresentativeSubTreasury>({
      title: 'الخزائن الفرعية للمندوبين',
      subtitle: 'المبيعات والتكلفة والأرباح والعمولات لكل مندوب',
      orientation: 'landscape',
      columns: [
        {
          key: 'representativeName',
          header: 'المندوب',
          align: 'start',
          bold: true,
        },
        { key: 'treasuryName', header: 'الخزينة', align: 'start' },
        { key: 'balance', header: 'الرصيد', align: 'end', format: 'currency' },
        {
          key: 'totalSales',
          header: 'المبيعات',
          align: 'end',
          format: 'currency',
        },
        {
          key: 'totalCost',
          header: 'التكلفة',
          align: 'end',
          format: 'currency',
        },
        {
          key: 'totalProfit',
          header: 'الربح',
          align: 'end',
          format: 'currency',
          bold: true,
        },
        {
          key: 'accumulatedCommission',
          header: 'العمولة المتراكمة',
          align: 'end',
          format: 'currency',
        },
        {
          key: 'paidCommission',
          header: 'المدفوع',
          align: 'end',
          format: 'currency',
        },
        {
          key: 'outstandingCommission',
          header: 'المتبقي',
          align: 'end',
          format: 'currency',
          bold: true,
        },
        {
          key: 'lastActivityDate',
          header: 'آخر نشاط',
          align: 'center',
          format: 'shortDate',
        },
      ],
      totals: {
        label: 'الإجمالي',
        labelColSpan: 2,
        cells: [
          this.formatCurrencyTotal(this.subTreasuriesTotalBalance()),
          this.formatCurrencyTotal(this.subTreasuriesTotalSales()),
          this.formatCurrencyTotal(this.subTreasuriesTotalCost()),
          this.formatCurrencyTotal(this.subTreasuriesTotalProfit()),
          this.formatCurrencyTotal(this.subTreasuriesTotalCommission()),
          this.formatCurrencyTotal(this.subTreasuriesTotalPaid()),
          this.formatCurrencyTotal(this.subTreasuriesTotalOutstanding()),
          '',
        ],
      },
      rows,
    });
    this.isPrintingSubTreasuries.set(false);
  }

  protected printMonthlyProfits(): void {
    if (this.isPrintingMonthlyProfits()) return;
    const rows = this.monthlyProfits();
    if (rows.length === 0) return;
    this.isPrintingMonthlyProfits.set(true);

    const totalRevenue = rows.reduce((s, r) => s + (r.revenue ?? 0), 0);
    const totalExpenses = rows.reduce((s, r) => s + (r.expenses ?? 0), 0);
    const totalProfit = totalRevenue - totalExpenses;
    const margin =
      totalRevenue > 0
        ? Math.round((totalProfit / totalRevenue) * 1000) / 10
        : 0;

    this.printer.print<MonthlyProfit>({
      title: 'الأرباح الشهرية',
      subtitle: this.selectedYear()
        ? `بيانات سنة ${this.selectedYear()}`
        : 'ملخص الإيرادات والمصروفات وصافي الربح لكل شهر',
      columns: [
        { key: 'monthName', header: 'الشهر', align: 'start', bold: true },
        {
          key: 'revenue',
          header: 'الإيرادات',
          align: 'end',
          format: 'currency',
        },
        {
          key: 'expenses',
          header: 'المصروفات',
          align: 'end',
          format: 'currency',
        },
        {
          key: 'profit',
          header: 'صافي الربح',
          align: 'end',
          format: 'currency',
          bold: true,
        },
        {
          key: 'marginPercent',
          header: 'هامش الربح',
          align: 'center',
          format: 'percent',
        },
        {
          key: (m) => m,
          header: 'الحالة',
          align: 'center',
          format: (_v, m) =>
            m.profit > 0 ? 'ربح' : m.profit < 0 ? 'خسارة' : 'تعادل',
        },
      ],
      totals: {
        label: 'الإجمالي',
        cells: [
          this.formatCurrencyTotal(totalRevenue),
          this.formatCurrencyTotal(totalExpenses),
          this.formatCurrencyTotal(totalProfit),
          `${margin}%`,
          totalProfit > 0 ? 'ربح' : totalProfit < 0 ? 'خسارة' : 'تعادل',
        ],
      },
      rows,
    });
    this.isPrintingMonthlyProfits.set(false);
  }

  // ─────────────── print helpers ───────────────

  private operationsPrintMeta(): Array<{ label: string; value: string }> {
    const items: Array<{ label: string; value: string }> = [];
    const treasuryId = this.oTreasuryFilter();
    if (treasuryId) {
      const t = this.treasuries().find((x) => x.id === Number(treasuryId));
      if (t) items.push({ label: 'الخزينة', value: t.name });
    }
    if (this.oFromDate())
      items.push({ label: 'من تاريخ', value: this.oFromDate() });
    if (this.oToDate())
      items.push({ label: 'إلى تاريخ', value: this.oToDate() });
    return items;
  }

  private transfersPrintMeta(): Array<{ label: string; value: string }> {
    const items: Array<{ label: string; value: string }> = [];
    if (this.tFromFilter()) {
      const t = this.treasuries().find(
        (x) => x.id === Number(this.tFromFilter()),
      );
      if (t) items.push({ label: 'من خزينة', value: t.name });
    }
    if (this.tToFilter()) {
      const t = this.treasuries().find(
        (x) => x.id === Number(this.tToFilter()),
      );
      if (t) items.push({ label: 'إلى خزينة', value: t.name });
    }
    if (this.tFromDate())
      items.push({ label: 'من تاريخ', value: this.tFromDate() });
    if (this.tToDate())
      items.push({ label: 'إلى تاريخ', value: this.tToDate() });
    return items;
  }

  private formatCurrencyTotal(value: number): string {
    return `${Math.round(value).toLocaleString('ar-EG')} ج.م`;
  }

  // ─────────────── monthly profits ───────────────

  protected loadMonthlyProfits(): void {
    this.fetchMonthlyProfits(null, false);
  }

  private fetchMonthlyProfits(year: number | null, force: boolean): void {
    this.monthlyProfitsLoading.set(true);
    const stream$ = force
      ? this.treasuryService.refreshMonthlyProfits(year ?? undefined)
      : this.treasuryService.listMonthlyProfits(year ?? undefined);

    stream$.subscribe({
      next: (data) => {
        this.monthlyProfits.set(data ?? []);
        this.monthlyProfitsLoading.set(false);
      },
      error: () => {
        this.monthlyProfits.set([]);
        this.monthlyProfitsLoading.set(false);
      },
    });
  }

  protected refreshMonthlyProfits(): void {
    this.fetchMonthlyProfits(this.selectedYear(), true);
  }

  protected onYearChange(value: string): void {
    this.selectedYear.set(value === '' ? null : Number(value));
  }

  protected profitClass(profit: number): string {
    return profit > 0
      ? 'mp-positive'
      : profit < 0
        ? 'mp-negative'
        : 'mp-neutral';
  }

  protected marginClass(margin: number): string {
    if (margin >= 30) return 'mp-margin-excellent';
    if (margin >= 20) return 'mp-margin-good';
    if (margin >= 10) return 'mp-margin-fair';
    return 'mp-margin-low';
  }

  protected monthRowClass(isCurrentMonth: boolean): string {
    return isCurrentMonth ? 'mp-current-month' : '';
  }
}
