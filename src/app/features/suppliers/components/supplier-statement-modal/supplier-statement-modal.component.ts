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
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { BadgeComponent, BadgeType } from '../../../../shared/components/badge/badge.component';
import { ApiError } from '../../../../core/models/api-response.model';
import { SuppliersService } from '../../services/suppliers.service';
import {
  Supplier,
  SupplierStatement,
  SupplierStatementInvoice,
  SupplierStatementInvoiceStatus,
  SupplierStatementPayment,
  SupplierStatementQuery,
} from '../../models/supplier.model';
import { PrintService } from '../../../../core/services/print.service';

const STATUS_BADGE: Record<SupplierStatementInvoiceStatus, BadgeType> = {
  Draft: 'info',
  Pending: 'warn',
  PartiallyPaid: 'warn',
  Paid: 'ok',
  Confirmed: 'ok',
  Cancelled: 'bad',
};

const STATUS_LABEL: Record<SupplierStatementInvoiceStatus, string> = {
  Draft: 'مسودة',
  Pending: 'بانتظار الدفع',
  PartiallyPaid: 'مدفوعة جزئيًا',
  Paid: 'مسددة',
  Confirmed: 'مؤكدة',
  Cancelled: 'ملغاة',
};

@Component({
  selector: 'app-supplier-statement-modal',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    DecimalPipe,
    ModalComponent,
    CurrencyArPipe,
    BadgeComponent,
  ],
  templateUrl: './supplier-statement-modal.component.html',
  styleUrl: './supplier-statement-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierStatementModalComponent {
  // ── inputs ──
  readonly open = input.required<boolean>();
  readonly supplier = input<Supplier | null>(null);

  // ── outputs ──
  readonly closed = output<void>();

  // ── deps ──
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(SuppliersService);
  private readonly printer = inject(PrintService);

  // ── reactive state ──
  protected readonly statement = signal<SupplierStatement | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Set of expanded invoice ids — controls per-row item visibility. */
  protected readonly expanded = signal<ReadonlySet<number>>(new Set<number>());

  // ── filter form ──
  protected readonly form = this.fb.nonNullable.group({
    from: [''],
    to: [''],
    includeDrafts: [false],
  });

  // ── derived ──
  protected readonly hasStatement = computed(() => this.statement() !== null);
  protected readonly invoicesCount = computed(
    () => this.statement()?.summary.invoicesCount ?? 0,
  );

  /**
   * Quick health indicator: ratio of paid-to-total. Used to render the
   * progress bar in the hero. Returns 0 when there's nothing purchased
   * (avoids NaN on first load).
   */
  protected readonly paidRatio = computed(() => {
    const s = this.statement()?.summary;
    if (!s || !s.totalPurchases) return 0;
    return Math.min(100, (s.totalPaid / s.totalPurchases) * 100);
  });

  /** Resolved title for the modal — combines entity name when known. */
  protected readonly title = computed(() => {
    const s = this.supplier();
    return s ? `كشف حساب — ${s.fullName}` : 'كشف حساب المورد';
  });

  // ── debounce ──
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Refetch whenever the modal opens for a different supplier, or
    // when any filter changes (debounced).
    effect(
      () => {
        if (!this.open()) return;
        const supplier = this.supplier();
        if (!supplier) return;

        // First-open reset so reopening for the same supplier doesn't
        // surface a stale draft toggle from the previous session.
        this.resetIfNewSupplier(supplier.id);
        this.fetch(supplier.id, this.currentQuery(), false);
      },
      { allowSignalWrites: true },
    );

    // Live debounce on form changes.
    this.form.valueChanges.subscribe(() => {
      const supplier = this.supplier();
      if (!supplier || !this.open()) return;
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.fetch(supplier.id, this.currentQuery(), false);
      }, 300);
    });
  }

  // ─────────── template handlers ───────────

  protected close(): void {
    this.closed.emit();
  }

  protected refresh(): void {
    const supplier = this.supplier();
    if (!supplier) return;
    this.fetch(supplier.id, this.currentQuery(), true);
  }

  protected resetFilters(): void {
    this.form.reset({ from: '', to: '', includeDrafts: false });
  }

  protected toggleInvoice(id: number): void {
    this.expanded.update((set) => {
      const next = new Set(set);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  protected isExpanded(id: number): boolean {
    return this.expanded().has(id);
  }

  protected statusBadge(status: SupplierStatementInvoiceStatus): BadgeType {
    return STATUS_BADGE[status] ?? 'info';
  }

  protected statusLabel(status: SupplierStatementInvoiceStatus): string {
    return STATUS_LABEL[status] ?? status;
  }

  /** Locale-aware short date — falls back to `—` for missing/invalid input. */
  protected formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  /** Sum of `lineTotal` across invoice items. */
  protected itemsTotal(items: { lineTotal: number }[]): number {
    return items.reduce((sum, it) => sum + (it.lineTotal ?? 0), 0);
  }

  /** Sum of standalone payment amounts. */
  protected paymentsTotal(payments: SupplierStatementPayment[]): number {
    return payments.reduce((sum, p) => sum + (p.amount ?? 0), 0);
  }

  /**
   * Exports the supplier statement as a professional PDF via the unified
   * {@link PrintService}. The statement is already fully loaded in memory
   * (no extra fetch needed), so this is a synchronous render.
   */
  protected print(): void {
    const s = this.statement();
    const supplier = this.supplier();
    if (!s || !supplier) return;

    const meta: Array<{ label: string; value: string }> = [
      { label: 'المورد', value: supplier.fullName },
    ];
    if (s.period.from) meta.push({ label: 'من تاريخ', value: this.formatDate(s.period.from) });
    if (s.period.to)   meta.push({ label: 'إلى تاريخ', value: this.formatDate(s.period.to) });
    meta.push({ label: 'عدد الفواتير', value: String(s.summary.invoicesCount) });
    if (s.summary.standalonePaidTotal > 0) {
      meta.push({
        label: 'مدفوع مباشر',
        value: `${Math.round(s.summary.standalonePaidTotal).toLocaleString('ar-EG')} ج.م`,
      });
    }

    this.printer.print<SupplierStatementInvoice>({
      title: 'كشف حساب المورد',
      subtitle: supplier.fullName,
      meta,
      orientation: 'landscape',
      columns: [
        { key: 'invoiceNumber',  header: 'رقم الفاتورة', align: 'center', bold: true },
        { key: 'invoiceDate',    header: 'تاريخ الفاتورة', align: 'center', format: 'shortDate' },
        { key: 'dueDate',        header: 'الاستحقاق',     align: 'center', format: 'shortDate' },
        {
          key: 'status',
          header: 'الحالة',
          align: 'center',
          format: (v) => STATUS_LABEL[v as SupplierStatementInvoiceStatus] ?? String(v),
        },
        { key: 'subtotal',        header: 'الصافي',      align: 'end', format: 'currency' },
        { key: 'discountAmount',  header: 'الخصم',       align: 'end', format: 'currency' },
        { key: 'taxAmount',       header: 'الضريبة',     align: 'end', format: 'currency' },
        { key: 'totalAmount',     header: 'الإجمالي',    align: 'end', format: 'currency', bold: true },
        { key: 'paidAmount',      header: 'المدفوع',     align: 'end', format: 'currency' },
        { key: 'remainingAmount', header: 'المتبقي',     align: 'end', format: 'currency', bold: true },
      ],
      totals: {
        label: 'الإجمالي',
        labelColSpan: 7,
        cells: [
          `${Math.round(s.summary.totalPurchases).toLocaleString('ar-EG')} ج.م`,
          `${Math.round(s.summary.totalPaid).toLocaleString('ar-EG')} ج.م`,
          `${Math.round(s.summary.totalRemaining).toLocaleString('ar-EG')} ج.م`,
        ],
      },
      rows: s.invoices,
    });
  }

  // ─────────── internals ───────────

  private currentQuery(): SupplierStatementQuery {
    const raw = this.form.getRawValue();
    return {
      from: raw.from?.trim() || undefined,
      to: raw.to?.trim() || undefined,
      includeDrafts: !!raw.includeDrafts,
    };
  }

  /**
   * Track the last-opened supplier so we can wipe filters + cached
   * statement when the user opens the modal for a different one.
   */
  private lastSupplierId: number | null = null;

  private resetIfNewSupplier(id: number): void {
    if (this.lastSupplierId === id) return;
    this.lastSupplierId = id;
    this.statement.set(null);
    this.error.set(null);
    this.expanded.set(new Set<number>());
    this.form.reset(
      { from: '', to: '', includeDrafts: false },
      { emitEvent: false },
    );
  }

  private fetch(
    supplierId: number,
    query: SupplierStatementQuery,
    force: boolean,
  ): void {
    this.loading.set(true);
    this.error.set(null);

    const stream$ = force
      ? this.service.refreshStatement(supplierId, query)
      : this.service.statement(supplierId, query);

    stream$.subscribe({
      next: (res) => {
        this.statement.set(res);
        this.loading.set(false);
      },
      error: (err: ApiError) => {
        this.statement.set(null);
        this.error.set(err?.message || 'تعذّر تحميل كشف الحساب — حاول مرة أخرى');
        this.loading.set(false);
      },
    });
  }
}
