import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../../../shared/components/searchable-select/searchable-select.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { DateArPipe } from '../../../../shared/pipes/date-ar.pipe';
import { ApiError } from '../../../../core/models/api-response.model';
import { PrintService } from '../../../../core/services/print.service';
import { ToastService } from '../../../../core/services/toast.service';
import { fetchAllPages } from '../../../../core/utils/api-list.util';

import { VoucherType } from '../../../vouchers/enums/voucher.enums';
import {
  VOUCHER_TYPE_BADGE,
  VOUCHER_TYPE_LABELS,
  VOUCHER_TYPE_OPTIONS,
} from '../../../vouchers/constants/voucher-labels';

import { SubAccountsService } from '../../services/sub-accounts.service';
import { SubAccountVoucher } from '../../models/sub-account.model';

const DEFAULT_PAGE_SIZE = 10;
const REFETCH_DEBOUNCE_MS = 250;

/**
 * The full receipt/payment log across every sub-account, with server-side
 * search (name / voucher number), a type filter and a per-account filter.
 * Read-only reporting surface — creation happens from the panel rows.
 *
 * The account dropdown can be pre-seeded via [accounts] so it doesn't refetch;
 * if omitted, the modal drains the account list itself on first open.
 */
@Component({
  selector: 'app-sub-account-vouchers-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ModalComponent,
    PaginationComponent,
    BadgeComponent,
    SearchableSelectComponent,
    CurrencyArPipe,
    DateArPipe,
  ],
  templateUrl: './sub-account-vouchers-modal.component.html',
  styleUrl: './sub-account-vouchers-modal.component.scss',
})
export class SubAccountVouchersModalComponent {
  // ── inputs ──
  readonly open = input.required<boolean>();
  /** Pre-seeded account options for the filter — `{ value, label, hint }`. */
  readonly accounts = input<SearchableSelectOption[]>([]);

  // ── outputs ──
  readonly closed = output<void>();

  // ── deps ──
  private readonly service = inject(SubAccountsService);
  private readonly printer = inject(PrintService);
  private readonly toast = inject(ToastService);

  // ── option tables ──
  protected readonly typeOptions = VOUCHER_TYPE_OPTIONS;

  // ── data ──
  protected readonly vouchers = signal<SubAccountVoucher[]>([]);
  protected readonly loading = signal(false);
  protected readonly isPrinting = signal(false);
  protected readonly accountOptions = signal<SearchableSelectOption[]>([]);

  // ── filters ──
  protected readonly searchTerm = signal('');
  protected readonly typeFilter = signal<VoucherType | ''>('');
  protected readonly subAccountId = signal<number | ''>('');
  protected readonly pageIndex = signal(1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);

  // ── server pagination meta ──
  protected readonly count = signal(0);
  protected readonly totalPages = signal(0);

  // ── derived ──
  protected readonly hasFilters = computed(
    () =>
      !!this.searchTerm().trim() || !!this.typeFilter() || !!this.subAccountId(),
  );

  protected readonly pageTotal = computed(() =>
    this.vouchers().reduce((s, v) => s + (v.amount ?? 0), 0),
  );

  private readonly trigger = computed(() => ({
    search: this.searchTerm().trim(),
    type: this.typeFilter(),
    subAccountId: this.subAccountId(),
    pageIndex: this.pageIndex(),
    pageSize: this.pageSize(),
  }));

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Refetch on open + on any filter / page change (debounced). The fetch is
    // deferred so its signal writes run outside this effect's reactive context.
    effect(() => {
      if (!this.open()) return;
      const trigger = this.trigger();
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(
        () => this.fetch(trigger, false),
        REFETCH_DEBOUNCE_MS,
      );
    });

    // Mirror seeded accounts into the local option signal, and drain the full
    // list the first time the modal opens if nothing was provided.
    effect(
      () => {
        const seeded = this.accounts();
        if (seeded.length) this.accountOptions.set(seeded);
      },
      { allowSignalWrites: true },
    );

    effect(
      () => {
        if (this.open() && this.accountOptions().length === 0) {
          this.loadAccounts();
        }
      },
      { allowSignalWrites: true },
    );
  }

  // ─────────── template handlers ───────────

  protected close(): void {
    this.closed.emit();
  }

  protected refresh(): void {
    this.fetch(this.trigger(), true);
  }

  protected onSearch(value: string): void {
    this.searchTerm.set(value);
    this.resetPage();
  }

  protected onTypeChange(value: string): void {
    this.typeFilter.set(value as VoucherType | '');
    this.resetPage();
  }

  protected onSubAccountChange(value: number | string | null): void {
    this.subAccountId.set(value === null || value === '' ? '' : Number(value));
    this.resetPage();
  }

  protected clearFilters(): void {
    this.searchTerm.set('');
    this.typeFilter.set('');
    this.subAccountId.set('');
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

  protected typeLabel(type: VoucherType): string {
    return VOUCHER_TYPE_LABELS[type] ?? type;
  }

  protected typeBadge(type: VoucherType) {
    return VOUCHER_TYPE_BADGE[type] ?? 'info';
  }

  protected isReceipt(type: VoucherType): boolean {
    return type === VoucherType.Receipt;
  }

  /** Exports every voucher matching the active filters to a PDF. */
  protected print(): void {
    if (this.isPrinting()) return;
    this.isPrinting.set(true);
    const { search, type, subAccountId } = this.trigger();

    fetchAllPages<SubAccountVoucher>((pageIndex, pageSize) =>
      this.service.refreshVouchers({
        search,
        type,
        subAccountId,
        pageIndex,
        pageSize,
      }),
    ).subscribe({
      next: (rows) => {
        this.isPrinting.set(false);
        const total = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
        const meta: Array<{ label: string; value: string }> = [];
        if (search) meta.push({ label: 'بحث', value: search });
        if (type) meta.push({ label: 'النوع', value: VOUCHER_TYPE_LABELS[type] });
        if (subAccountId) {
          const opt = this.accountOptions().find(
            (o) => String(o.value) === String(subAccountId),
          );
          if (opt) meta.push({ label: 'الحساب', value: opt.label });
        }

        this.printer.print<SubAccountVoucher>({
          title: 'سجل سندات الحسابات الفرعية',
          subtitle: 'كل سندات القبض والصرف على الحسابات الفرعية',
          meta,
          orientation: 'landscape',
          columns: [
            { key: 'date', header: 'التاريخ', align: 'center', format: 'shortDate' },
            { key: 'subAccountName', header: 'الحساب', align: 'start', bold: true },
            { key: 'voucherNumber', header: 'رقم السند', align: 'center' },
            {
              key: 'type',
              header: 'النوع',
              align: 'center',
              format: (v) => VOUCHER_TYPE_LABELS[v as VoucherType] ?? String(v),
            },
            { key: 'amount', header: 'المبلغ', align: 'end', format: 'currency', bold: true },
            { key: 'balanceAfter', header: 'الرصيد بعد', align: 'end', format: 'currency' },
            { key: 'notes', header: 'ملاحظات', align: 'start' },
          ],
          totals: {
            label: 'إجمالي المبالغ',
            labelColSpan: 4,
            cells: [
              `${Math.round(total).toLocaleString('ar-EG')} ج.م`,
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

  // ─────────── internals ───────────

  private loadAccounts(): void {
    fetchAllPages((pageIndex, pageSize) =>
      this.service.list({ pageIndex, pageSize }),
    ).subscribe({
      next: (rows) =>
        this.accountOptions.set(
          rows.map((a) => ({
            value: a.id,
            label: a.name,
            hint: a.phoneNumber,
          })),
        ),
      error: () => this.accountOptions.set([]),
    });
  }

  private fetch(
    trigger: ReturnType<typeof this.trigger>,
    force: boolean,
  ): void {
    this.loading.set(true);
    const stream$ = force
      ? this.service.refreshVouchers(trigger)
      : this.service.listVouchers(trigger);

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
}
