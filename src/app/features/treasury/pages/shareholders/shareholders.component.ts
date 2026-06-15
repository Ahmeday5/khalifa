import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';

import { ShareholdersService } from '../../services/shareholders.service';
import { Shareholder } from '../../models/shareholder.model';
import {
  ProfitSettlement,
  ProfitSettlementPreview,
  ProfitSettlementRow,
} from '../../models/profit-settlement.model';
import { ShareholderFormModalComponent } from '../../components/shareholder-form-modal/shareholder-form-modal.component';
import { ProfitDistributionModalComponent } from '../../components/profit-distribution-modal/profit-distribution-modal.component';
import { ProfitSettlementDetailsModalComponent } from '../../components/profit-settlement-details-modal/profit-settlement-details-modal.component';
import { ShareholderCapitalModalComponent } from '../../components/shareholder-capital-modal/shareholder-capital-modal.component';
import { CapitalizeAllProfitsModalComponent } from '../../components/capitalize-all-profits-modal/capitalize-all-profits-modal.component';
import { ShareholderStatementModalComponent } from '../../components/shareholder-statement-modal/shareholder-statement-modal.component';
import { CompanyProfitStatementModalComponent } from '../../components/company-profit-statement-modal/company-profit-statement-modal.component';

import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { DateArPipe } from '../../../../shared/pipes/date-ar.pipe';
import { HasPermissionDirective } from '../../../../shared/directives/has-permission.directive';
import { FormMode } from '../../../../shared/models/form-mode.model';
import { PERMISSIONS } from '../../../../core/constants/permissions.const';
import { DialogService } from '../../../../core/services/dialog.service';
import { ToastService } from '../../../../core/services/toast.service';
import { HttpCacheService } from '../../../../core/services/http-cache.service';
import { PrintService } from '../../../../core/services/print.service';
import { onInvalidate } from '../../../../core/utils/auto-refresh.util';
import { fetchAllPages } from '../../../../core/utils/api-list.util';
import { ApiError } from '../../../../core/models/api-response.model';

const DEFAULT_PAGE_SIZE = 10;
const REFETCH_DEBOUNCE_MS = 300;

@Component({
  selector: 'app-shareholders',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    ShareholderFormModalComponent,
    ProfitDistributionModalComponent,
    ProfitSettlementDetailsModalComponent,
    ShareholderCapitalModalComponent,
    CapitalizeAllProfitsModalComponent,
    ShareholderStatementModalComponent,
    CompanyProfitStatementModalComponent,
    PaginationComponent,
    CurrencyArPipe,
    DateArPipe,
    HasPermissionDirective,
  ],
  templateUrl: './shareholders.component.html',
  styleUrl: './shareholders.component.scss',
})
export class ShareholdersComponent {
  private readonly service = inject(ShareholdersService);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly cache = inject(HttpCacheService);
  private readonly printer = inject(PrintService);

  /** Exposed so the template can gate write actions with `*appHasPermission`. */
  protected readonly PERMS = PERMISSIONS;

  // ── data ──
  protected readonly shareholders = signal<Shareholder[]>([]);
  protected readonly loading = signal(false);
  protected readonly isPrinting = signal(false);

  // ── filters ──
  protected readonly searchTerm = signal('');
  protected readonly pageIndex = signal(1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);

  // ── server pagination meta ──
  protected readonly count = signal(0);
  protected readonly totalPages = signal(0);

  // ── modal state ──
  protected readonly modalOpen = signal(false);
  protected readonly modalMode = signal<FormMode>('create');
  protected readonly modalShareholder = signal<Shareholder | null>(null);

  /** Tracks which row is currently being deleted, for inline button state. */
  protected readonly deletingId = signal<number | null>(null);

  // ── pending-distribution preview (live) ──
  protected readonly preview = signal<ProfitSettlementPreview | null>(null);
  protected readonly previewLoading = signal(false);
  protected readonly previewLines = computed(() => this.preview()?.lines ?? []);
  protected readonly previewTotal = computed(
    () => this.preview()?.totalAmount ?? 0,
  );
  protected readonly previewTotalShareholdersShare = computed(
    () => this.preview()?.totalShareholdersShare ?? 0,
  );
  protected readonly previewTotalCompanyShare = computed(
    () => this.preview()?.totalCompanyShare ?? 0,
  );
  protected readonly previewTreasuryName = computed(
    () => this.preview()?.profitsTreasuryName ?? '—',
  );
  protected readonly hasPendingProfits = computed(
    () => this.previewTotal() > 0 && this.previewLines().length > 0,
  );

  // ── profit settlements (history) ──
  protected readonly settlements = signal<ProfitSettlementRow[]>([]);
  protected readonly settlementsLoading = signal(false);
  protected readonly sPageIndex = signal(1);
  protected readonly sPageSize = signal(DEFAULT_PAGE_SIZE);
  protected readonly sCount = signal(0);
  protected readonly sTotalPages = signal(0);

  // ── profit-settlement modals ──
  protected readonly distributeOpen = signal(false);
  protected readonly detailsOpen = signal(false);
  protected readonly detailsId = signal<number | null>(null);

  // ── per-shareholder capital modal ──
  protected readonly capitalOpen = signal(false);
  protected readonly capitalShareholder = signal<Shareholder | null>(null);

  // ── capitalize-all-profits modal ──
  protected readonly capitalizeAllOpen = signal(false);

  // ── statement modal ──
  protected readonly statementOpen = signal(false);
  protected readonly statementShareholder = signal<Shareholder | null>(null);

  // ── company profit statement modal ──
  protected readonly companyStatementOpen = signal(false);

  private readonly settlementsTrigger = computed(() => ({
    pageIndex: this.sPageIndex(),
    pageSize: this.sPageSize(),
  }));

  // ── derived ──
  protected readonly hasFilters = computed(() => this.searchTerm().length > 0);

  /** Page-level aggregates for the summary cards. */
  protected readonly pageContributed = computed(() =>
    this.shareholders().reduce((s, sh) => s + (sh.contributedAmount ?? 0), 0),
  );
  protected readonly pageProfit = computed(() =>
    this.shareholders().reduce((s, sh) => s + (sh.totalProfitReceived ?? 0), 0),
  );
  protected readonly pageOwnership = computed(() =>
    this.shareholders().reduce((s, sh) => s + (sh.ownedPercentage ?? 0), 0),
  );
  protected readonly pageAccruedProfit = computed(() =>
    this.shareholders().reduce((s, sh) => s + (sh.accruedProfit ?? 0), 0),
  );

  /** Combined trigger — any filter / page change refetches. */
  private readonly fetchTrigger = computed(() => ({
    search: this.searchTerm().trim(),
    pageIndex: this.pageIndex(),
    pageSize: this.pageSize(),
  }));

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private settlementsDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const trigger = this.fetchTrigger();
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(
        () => this.fetch(trigger),
        REFETCH_DEBOUNCE_MS,
      );
    });

    // Settlements history paginates independently of the shareholders list.
    // Defer the fetch so signal writes inside it run OUTSIDE the effect's
    // reactive context (codebase idiom — avoids NG0600).
    effect(() => {
      const trigger = this.settlementsTrigger();
      if (this.settlementsDebounceTimer) {
        clearTimeout(this.settlementsDebounceTimer);
      }
      this.settlementsDebounceTimer = setTimeout(
        () => this.fetchSettlements(trigger, false),
        REFETCH_DEBOUNCE_MS,
      );
    });

    // A treasury write (transfer, voucher, profit distribution) can change a
    // shareholder's capital treasury or profit figures — refresh both lists on
    // either scope.
    onInvalidate(this.cache, 'shareholder', () => this.refreshAll());
    onInvalidate(this.cache, 'treasur', () => this.refreshAll());

    // Initial load of the live distribution preview (the lists self-load via
    // their effects; the preview endpoint isn't cached, so we call it directly).
    this.loadPreview();
  }

  private refreshAll(): void {
    this.refresh();
    this.fetchSettlements(this.settlementsTrigger(), true);
    this.loadPreview();
  }

  // ─────────── pending-distribution preview ───────────

  protected loadPreview(): void {
    this.previewLoading.set(true);
    this.service.previewSettlement().subscribe({
      next: (preview) => {
        this.preview.set(preview);
        this.previewLoading.set(false);
      },
      error: () => {
        this.preview.set(null);
        this.previewLoading.set(false);
      },
    });
  }

  // ─────────── data loaders ───────────

  private fetch(
    trigger: ReturnType<typeof this.fetchTrigger>,
    force = false,
  ): void {
    this.loading.set(true);
    const stream$ = force
      ? this.service.refresh(trigger)
      : this.service.list(trigger);

    stream$.subscribe({
      next: (page) => {
        const data = page?.data ?? [];
        this.shareholders.set(data);
        this.count.set(page?.count ?? 0);
        this.totalPages.set(page?.totalPages ?? 0);
        this.loading.set(false);
        // Keep capitalShareholder in sync so the modal reflects the latest contributedAmount
        if (this.capitalOpen()) {
          const capId = this.capitalShareholder()?.id;
          const fresh = capId != null ? data.find((s) => s.id === capId) : null;
          if (fresh) this.capitalShareholder.set(fresh);
        }
      },
      error: (err: ApiError) => {
        this.shareholders.set([]);
        this.count.set(0);
        this.totalPages.set(0);
        this.loading.set(false);
        this.toast.error(err?.message || 'تعذّر تحميل المساهمين');
      },
    });
  }

  protected refresh(): void {
    this.fetch(this.fetchTrigger(), true);
  }

  /** Exports every shareholder matching the active search to a PDF. */
  protected printShareholders(): void {
    if (this.isPrinting()) return;
    this.isPrinting.set(true);
    const search = this.searchTerm().trim();

    fetchAllPages<Shareholder>((pageIndex, pageSize) =>
      this.service.refresh({ search, pageIndex, pageSize }),
    ).subscribe({
      next: (rows) => {
        this.isPrinting.set(false);
        const totalContributed = rows.reduce(
          (s, r) => s + (r.contributedAmount ?? 0),
          0,
        );
        const totalProfit = rows.reduce(
          (s, r) => s + (r.totalProfitReceived ?? 0),
          0,
        );

        this.printer.print<Shareholder>({
          title: 'قائمة المساهمين',
          subtitle: 'الشركاء ونسب الملكية والأرباح الموزّعة',
          meta: search ? [{ label: 'بحث', value: search }] : undefined,
          orientation: 'landscape',
          columns: [
            {
              key: 'id',
              header: '#',
              align: 'center',
              width: '46px',
              format: (v) => `#${v}`,
            },
            { key: 'name', header: 'المساهم', align: 'start', bold: true },
            { key: 'phoneNumber', header: 'الهاتف', align: 'start' },
            { key: 'address', header: 'العنوان', align: 'start' },
            {
              key: 'contributedAmount',
              header: 'قيمة المساهمة',
              align: 'end',
              format: 'currency',
              bold: true,
            },
            {
              key: 'ownedPercentage',
              header: 'نسبة الملكية',
              align: 'center',
              format: 'percent',
            },
            {
              key: 'totalProfitReceived',
              header: 'الأرباح الموزّعة',
              align: 'end',
              format: 'currency',
            },
            {
              key: 'capitalTreasuryName',
              header: 'خزينة رأس المال',
              align: 'start',
            },
            {
              key: 'createdAt',
              header: 'تاريخ الانضمام',
              align: 'center',
              format: 'shortDate',
            },
            { key: 'notes', header: 'ملاحظات', align: 'start' },
          ],
          totals: {
            label: 'الإجمالي',
            labelColSpan: 4,
            cells: [
              `${Math.round(totalContributed).toLocaleString('ar-EG')} ج.م`,
              '',
              `${Math.round(totalProfit).toLocaleString('ar-EG')} ج.م`,
              '',
              '',
              '',
            ],
          },
          rows,
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
    this.resetPage();
  }

  protected clearSearch(): void {
    if (!this.searchTerm()) return;
    this.searchTerm.set('');
    this.resetPage();
  }

  protected onPageChange(page: number): void {
    this.pageIndex.set(page);
  }

  protected onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.resetPage();
  }

  private resetPage(): void {
    if (this.pageIndex() !== 1) this.pageIndex.set(1);
  }

  // ─────────── modal handlers ───────────

  protected openCreate(): void {
    this.modalShareholder.set(null);
    this.modalMode.set('create');
    this.modalOpen.set(true);
  }

  protected openEdit(shareholder: Shareholder): void {
    this.modalShareholder.set(shareholder);
    this.modalMode.set('edit');
    this.modalOpen.set(true);
  }

  protected closeModal(): void {
    this.modalOpen.set(false);
  }

  protected onSaved(_saved: Shareholder): void {
    const wasCreate = this.modalMode() === 'create';
    this.modalOpen.set(false);
    // A new partner shifts every ownership %, so a fresh fetch is always
    // the correct view. Jump to page 1 on create so the new row is visible.
    if (wasCreate && this.pageIndex() !== 1) {
      this.pageIndex.set(1);
    } else {
      this.refresh();
    }
  }

  // ─────────── delete ───────────

  protected async confirmDelete(shareholder: Shareholder): Promise<void> {
    const ok = await this.dialog.confirm({
      title: 'حذف مساهم',
      message: `هل أنت متأكد من حذف "${shareholder.name}"؟ هذا الإجراء لا يمكن التراجع عنه.`,
      confirmText: 'حذف',
      cancelText: 'إلغاء',
      type: 'danger',
    });
    if (!ok) return;

    this.deletingId.set(shareholder.id);
    this.service.delete(shareholder.id).subscribe({
      next: () => {
        this.deletingId.set(null);
        this.toast.success('تم حذف المساهم بنجاح');
        // Step back a page if we just emptied a non-first page; else refetch.
        if (this.shareholders().length === 1 && this.pageIndex() > 1) {
          this.pageIndex.update((p) => p - 1);
        } else {
          this.refresh();
        }
      },
      error: (err: ApiError) => {
        this.deletingId.set(null);
        this.toast.error(err.message || 'تعذّر حذف المساهم');
      },
    });
  }

  // ─────────── profit settlements ───────────

  private fetchSettlements(
    trigger: ReturnType<typeof this.settlementsTrigger>,
    force: boolean,
  ): void {
    this.settlementsLoading.set(true);
    const stream$ = force
      ? this.service.refreshSettlements(trigger)
      : this.service.listSettlements(trigger);

    stream$.subscribe({
      next: (page) => {
        this.settlements.set(page?.data ?? []);
        this.sCount.set(page?.count ?? 0);
        this.sTotalPages.set(page?.totalPages ?? 0);
        this.settlementsLoading.set(false);
      },
      error: () => {
        this.settlements.set([]);
        this.sCount.set(0);
        this.sTotalPages.set(0);
        this.settlementsLoading.set(false);
      },
    });
  }

  protected refreshSettlements(): void {
    this.fetchSettlements(this.settlementsTrigger(), true);
  }

  protected onSettlementsPageChange(page: number): void {
    this.sPageIndex.set(page);
  }

  protected onSettlementsPageSizeChange(size: number): void {
    this.sPageSize.set(size);
    if (this.sPageIndex() !== 1) this.sPageIndex.set(1);
  }

  // ─────────── profit-settlement modals ───────────

  protected openDistribute(): void {
    this.distributeOpen.set(true);
  }

  protected closeDistribute(): void {
    this.distributeOpen.set(false);
  }

  protected onSettled(settlement: ProfitSettlement): void {
    this.distributeOpen.set(false);
    // Service invalidation triggers refreshAll(); jump settlements to page 1 so
    // the new record is visible, then open its breakdown immediately.
    if (this.sPageIndex() !== 1) this.sPageIndex.set(1);
    this.openDetails(settlement.id);
  }

  protected openDetails(id: number): void {
    this.detailsId.set(id);
    this.detailsOpen.set(true);
  }

  protected closeDetails(): void {
    this.detailsOpen.set(false);
  }

  // ─────────── capital modal ───────────

  protected openCapital(shareholder: Shareholder): void {
    this.capitalShareholder.set(shareholder);
    this.capitalOpen.set(true);
  }

  protected closeCapital(): void {
    this.capitalOpen.set(false);
  }

  protected onCapitalChanged(): void {
    this.loadPreview();
  }

  // ─────────── capitalize-all modal ───────────

  protected openCapitalizeAll(): void {
    this.capitalizeAllOpen.set(true);
  }

  protected closeCapitalizeAll(): void {
    this.capitalizeAllOpen.set(false);
  }

  protected onCapitalizedAll(): void {
    this.capitalizeAllOpen.set(false);
  }

  // ─────────── statement modal ───────────

  protected openStatement(shareholder: Shareholder): void {
    this.statementShareholder.set(shareholder);
    this.statementOpen.set(true);
  }

  protected closeStatement(): void {
    this.statementOpen.set(false);
  }

  // ─────────── company profit statement ───────────

  protected openCompanyStatement(): void {
    this.companyStatementOpen.set(true);
  }

  protected closeCompanyStatement(): void {
    this.companyStatementOpen.set(false);
  }
}
