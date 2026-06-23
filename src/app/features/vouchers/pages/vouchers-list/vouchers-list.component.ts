import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';

import { VouchersService } from '../../services/vouchers.service';
import { VoucherDto } from '../../models/voucher.model';
import {
  ReferenceType,
  RelatedPartyType,
  VoucherType,
} from '../../enums/voucher.enums';
import {
  REFERENCE_TYPE_BADGE,
  REFERENCE_TYPE_LABELS,
  RELATED_PARTY_TYPE_BADGE,
  RELATED_PARTY_TYPE_LABELS,
  VOUCHER_TYPE_BADGE,
  VOUCHER_TYPE_LABELS,
  VOUCHER_TYPE_OPTIONS,
} from '../../constants/voucher-labels';
import { VoucherTypeLabelPipe } from '../../pipes/voucher-type-label.pipe';
import { ReferenceTypeLabelPipe } from '../../pipes/reference-type-label.pipe';
import { RelatedPartyTypeLabelPipe } from '../../pipes/related-party-type-label.pipe';

import {
  BadgeComponent,
  BadgeType,
} from '../../../../shared/components/badge/badge.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { DateArPipe } from '../../../../shared/pipes/date-ar.pipe';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { ToastService } from '../../../../core/services/toast.service';
import { DialogService } from '../../../../core/services/dialog.service';
import { HttpCacheService } from '../../../../core/services/http-cache.service';
import { onInvalidate } from '../../../../core/utils/auto-refresh.util';
import { HasPermissionDirective } from '../../../../shared/directives/has-permission.directive';
import { PERMISSIONS } from '../../../../core/constants/permissions.const';
import { VoucherFormModalComponent } from '../../components/voucher-form-modal/voucher-form-modal.component';
import { PrintService } from '../../../../core/services/print.service';
import { fetchAllPages } from '../../../../core/utils/api-list.util';

const DEFAULT_PAGE_SIZE = 10;
const REFETCH_DEBOUNCE_MS = 200;

@Component({
  selector: 'app-vouchers-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    BadgeComponent,
    PaginationComponent,
    ModalComponent,
    CurrencyArPipe,
    DateArPipe,
    VoucherTypeLabelPipe,
    ReferenceTypeLabelPipe,
    RelatedPartyTypeLabelPipe,
    HasPermissionDirective,
    VoucherFormModalComponent,
  ],
  templateUrl: './vouchers-list.component.html',
  styleUrl: './vouchers-list.component.scss',
})
export class VouchersListComponent {
  private readonly svc = inject(VouchersService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);
  private readonly cache = inject(HttpCacheService);
  private readonly printer = inject(PrintService);

  protected readonly isPrinting = signal(false);
  /** Tracks which voucher row is being deleted, for inline spinner. */
  protected readonly deletingId = signal<number | null>(null);

  // ── data ──
  protected readonly vouchers = signal<VoucherDto[]>([]);
  protected readonly loading = signal(false);

  // ── filters ──
  protected readonly typeFilter = signal<VoucherType | ''>('');
  protected readonly searchTerm = signal('');
  protected readonly pageIndex = signal(1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);

  // ── server pagination meta ──
  protected readonly count = signal(0);
  protected readonly totalPages = signal(0);

  /** Exposed so the template can gate the create button with `*appHasPermission`. */
  protected readonly PERMS = PERMISSIONS;

  // ── create-voucher modal ──
  protected readonly showForm = signal(false);

  // ── voucher-number detail modal ──
  protected readonly detailOpen = signal(false);
  protected readonly detailVoucher = signal<VoucherDto | null>(null);

  // ── derived ──
  protected readonly hasFilters = computed(
    () => !!this.typeFilter() || this.searchTerm().trim().length > 0,
  );

  protected readonly totalAmount = computed(() =>
    this.vouchers().reduce((sum, v) => sum + (v.amount ?? 0), 0),
  );

  protected readonly receiptCount = computed(
    () => this.vouchers().filter((v) => v.type === VoucherType.Receipt).length,
  );

  protected readonly paymentCount = computed(
    () => this.vouchers().filter((v) => v.type === VoucherType.Payment).length,
  );

  // ── select options ──
  protected readonly typeOptions = VOUCHER_TYPE_OPTIONS;

  /** Combined trigger — any filter / page change refetches. */
  private readonly fetchTrigger = computed(() => ({
    pageIndex: this.pageIndex(),
    pageSize: this.pageSize(),
    type: this.typeFilter(),
    search: this.searchTerm().trim(),
  }));

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const trigger = this.fetchTrigger();
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(
        () => this.fetch(trigger),
        REFETCH_DEBOUNCE_MS,
      );
    });

    // Any treasury / installment / contract write may produce a voucher —
    // refresh whenever the global cache invalidates one of those scopes.
    onInvalidate(this.cache, 'treasur', () => this.refresh());
    onInvalidate(this.cache, 'installment', () => this.refresh());
    onInvalidate(this.cache, 'invoice', () => this.refresh());
    onInvalidate(this.cache, 'payment', () => this.refresh());
    onInvalidate(this.cache, 'contract', () => this.refresh());
  }

  // ─────────── data loaders ───────────

  private fetch(
    trigger: ReturnType<typeof this.fetchTrigger>,
    force = false,
  ): void {
    this.loading.set(true);
    const stream$ = force ? this.svc.refresh(trigger) : this.svc.list(trigger);

    stream$.subscribe({
      next: (page) => {
        this.vouchers.set(page?.data ?? []);
        this.count.set(page?.count ?? 0);
        this.totalPages.set(page?.totalPages ?? 0);
        this.loading.set(false);
      },
      error: (err: ApiError) => {
        this.vouchers.set([]);
        this.count.set(0);
        this.totalPages.set(0);
        this.loading.set(false);
        this.toast.error(err?.message || 'تعذّر تحميل السندات');
      },
    });
  }

  protected refresh(): void {
    this.fetch(this.fetchTrigger(), true);
  }

  /** Exports every voucher matching the active type filter to a PDF. */
  protected printVouchers(): void {
    if (this.isPrinting()) return;
    this.isPrinting.set(true);
    const type = this.typeFilter();
    const search = this.searchTerm().trim();

    fetchAllPages<VoucherDto>((pageIndex, pageSize) =>
      this.svc.refresh({ pageIndex, pageSize, type, search }),
    ).subscribe({
      next: (rows) => {
        this.isPrinting.set(false);
        const total = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
        const meta: Array<{ label: string; value: string }> = [];
        if (type) meta.push({ label: 'النوع', value: VOUCHER_TYPE_LABELS[type] });
        if (search) meta.push({ label: 'بحث', value: search });

        this.printer.print<VoucherDto>({
          title: 'سجل السندات المالية',
          subtitle: 'سندات القبض والصرف',
          meta,
          orientation: 'landscape',
          columns: [
            { key: 'voucherNumber', header: 'رقم السند', align: 'center', bold: true },
            {
              key: 'type',
              header: 'النوع',
              align: 'center',
              format: (v) => VOUCHER_TYPE_LABELS[v as VoucherType] ?? String(v),
            },
            { key: 'amount', header: 'المبلغ', align: 'end', format: 'currency', bold: true },
            { key: 'treasuryName', header: 'الخزينة', align: 'start' },
            {
              key: 'relatedPartyType',
              header: 'الطرف',
              align: 'center',
              format: (v) => RELATED_PARTY_TYPE_LABELS[v as RelatedPartyType] ?? String(v),
            },
            { key: 'relatedPartyName', header: 'اسم الطرف', align: 'start', bold: true },
            {
              key: 'referenceType',
              header: 'المرجع',
              align: 'center',
              format: (v) => REFERENCE_TYPE_LABELS[v as ReferenceType] ?? String(v),
            },
            { key: 'date', header: 'التاريخ', align: 'center', format: 'shortDate' },
            {
              key: 'notes',
              header: 'ملاحظات',
              align: 'start',
              format: (v) => this.cleanNotes(v as string | null),
            },
          ],
          totals: {
            label: 'الإجمالي',
            labelColSpan: 2,
            cells: [
              `${Math.round(total).toLocaleString('ar-EG')} ج.م`,
              '',
              '',
              '',
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

  // ─────────── create-voucher modal ───────────

  protected openForm(): void {
    this.showForm.set(true);
  }

  protected closeForm(): void {
    this.showForm.set(false);
  }

  protected onVoucherCreated(): void {
    this.showForm.set(false);
    // Service invalidated the cache; force a fresh first page so the new
    // voucher is visible immediately.
    if (this.pageIndex() !== 1) this.pageIndex.set(1);
    else this.refresh();
  }

  // ─────────── filter handlers ───────────

  protected onTypeChange(value: string): void {
    this.typeFilter.set(value as VoucherType | '');
    this.resetPage();
  }

  protected onSearch(value: string): void {
    this.searchTerm.set(value);
    this.resetPage();
  }

  protected clearSearch(): void {
    if (!this.searchTerm()) return;
    this.searchTerm.set('');
    this.resetPage();
  }

  protected clearFilters(): void {
    this.typeFilter.set('');
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

  // ─────────── voucher-number detail modal ───────────

  protected openDetail(v: VoucherDto): void {
    this.detailVoucher.set(v);
    this.detailOpen.set(true);
  }

  protected closeDetail(): void {
    this.detailOpen.set(false);
  }

  // ─────────── delete voucher ───────────

  protected async confirmDelete(v: VoucherDto): Promise<void> {
    const ok = await this.dialog.confirm({
      title: 'حذف السند',
      message: `هل أنت متأكد من حذف السند "${v.voucherNumber}"؟ هذا الإجراء لا يمكن التراجع عنه.`,
      confirmText: 'حذف',
      cancelText: 'إلغاء',
      type: 'danger',
    });
    if (!ok) return;

    this.deletingId.set(v.id);
    this.svc.delete(v.id).subscribe({
      next: () => {
        this.deletingId.set(null);
        this.toast.success('تم حذف السند بنجاح');
        if (this.vouchers().length === 1 && this.pageIndex() > 1) {
          this.pageIndex.update((p) => p - 1);
        } else {
          this.refresh();
        }
      },
      error: (err: ApiError) => {
        this.deletingId.set(null);
        this.toast.error(apiErrorToMessage(err, 'تعذّر حذف السند'));
      },
    });
  }

  // ─────────── view helpers ───────────

  protected typeBadge(type: VoucherType): BadgeType {
    return VOUCHER_TYPE_BADGE[type] ?? 'info';
  }

  protected referenceBadge(ref: ReferenceType): BadgeType {
    return REFERENCE_TYPE_BADGE[ref] ?? 'info';
  }

  protected relatedPartyBadge(party: RelatedPartyType): BadgeType {
    return RELATED_PARTY_TYPE_BADGE[party] ?? 'info';
  }

  protected isReceipt(type: VoucherType): boolean {
    return type === VoucherType.Receipt;
  }

  /** Strips repetitive `"Payment Method: cash."` prefixes for tighter rows. */
  protected cleanNotes(notes: string | null): string {
    if (!notes) return '—';
    const trimmed = notes.replace(/Payment Method:\s*\w+\.?/i, '').trim();
    return trimmed || '—';
  }
}
