import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { HttpCacheService } from '../../../../core/services/http-cache.service';
import { onInvalidate } from '../../../../core/utils/auto-refresh.util';
import { ApiError } from '../../../../core/models/api-response.model';
import { InvoicesService } from '../../services/invoices.service';
import {
  PURCHASE_INVOICE_STATUS_VIEW,
  PurchaseInvoice,
  PurchaseInvoiceListItem,
  PurchaseInvoiceStatus,
  PurchaseInvoiceStatusView,
  PurchaseInvoiceSummary,
} from '../../models/invoice.model';
import { SuppliersService } from '../../../suppliers/services/suppliers.service';
import { LookupItem } from '../../../../core/models/lookup.model';
import { ConfirmInvoiceModalComponent } from '../../components/confirm-invoice-modal/confirm-invoice-modal.component';
import { PayInvoiceModalComponent } from '../../components/pay-invoice-modal/pay-invoice-modal.component';
import { ReturnInvoiceModalComponent } from '../../components/return-invoice-modal/return-invoice-modal.component';
import { AuthService } from '../../../../core/services/auth.service';
import { PERMISSIONS } from '../../../../core/constants/permissions.const';
import { PrintService } from '../../../../core/services/print.service';

const STATUS_OPTIONS: ReadonlyArray<{
  value: PurchaseInvoiceStatus | '';
  label: string;
}> = [
  { value: '',              label: 'كل الحالات' },
  { value: 'Draft',         label: 'مسودة' },
  { value: 'Pending',       label: 'بانتظار الدفع' },
  { value: 'PartiallyPaid', label: 'جزئية' },
  { value: 'Paid',          label: 'مسددة' },
  { value: 'Confirmed',     label: 'مؤكدة' },
  { value: 'Cancelled',     label: 'ملغية' },
];

@Component({
  selector: 'app-invoices-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyArPipe, ConfirmInvoiceModalComponent, PayInvoiceModalComponent, ReturnInvoiceModalComponent],
  templateUrl: './invoices-list.component.html',
  styleUrl: './invoices-list.component.scss',
})
export class InvoicesListComponent implements OnInit {
  private readonly svc              = inject(InvoicesService);
  private readonly suppliersService = inject(SuppliersService);
  private readonly router           = inject(Router);
  private readonly cache            = inject(HttpCacheService);
  private readonly printer          = inject(PrintService);
  private readonly auth             = inject(AuthService);

  /**
   * Write access to invoices: supplier-full-access holders, plus the
   * Representative role (who owns the purchase workflow but carries no
   * supplier permission). Reactive — reflows if the session changes.
   */
  protected readonly canWrite = computed(
    () =>
      this.auth.hasPermission(PERMISSIONS.suppliersFullAccess) ||
      this.auth.hasAnyRole(['Representative']),
  );

  /**
   * Representatives may add/view invoices but must not see the company-wide
   * financial totals — the summary cards are hidden (and not fetched) for them.
   */
  protected readonly isRepresentative = computed(() =>
    this.auth.hasAnyRole(['Representative']),
  );

  /**
   * Editing an existing invoice is owners-only: a Representative may create and
   * view purchase invoices but must not amend them after the fact.
   */
  protected readonly canEdit = computed(
    () => this.canWrite() && !this.isRepresentative(),
  );

  // ── data ──
  protected readonly invoices  = signal<PurchaseInvoiceListItem[]>([]);
  protected readonly summary   = signal<PurchaseInvoiceSummary | null>(null);
  protected readonly suppliers = signal<LookupItem[]>([]);
  protected readonly loading   = signal(false);

  // ── filters ──
  protected readonly searchTerm   = signal('');
  protected readonly statusFilter = signal<PurchaseInvoiceStatus | ''>('');
  protected readonly supplierFilter = signal<number | ''>('');

  // ── confirm modal ──
  protected readonly confirmOpen   = signal(false);
  protected readonly confirmTarget = signal<PurchaseInvoiceListItem | null>(null);

  // ── payment modal ──
  protected readonly paymentOpen   = signal(false);
  protected readonly paymentTarget = signal<PurchaseInvoiceListItem | null>(null);

  // ── return modal ──
  protected readonly returnOpen   = signal(false);
  protected readonly returnTarget = signal<PurchaseInvoiceListItem | null>(null);

  // ── derived ──
  protected readonly statusOptions = STATUS_OPTIONS;

  /**
   * Stable, debounce-able payload used to refetch the list. Combining
   * the three filter signals into one computed lets the effect treat
   * the trio as a single trigger.
   */
  private readonly filterPayload = computed(() => ({
    search: this.searchTerm().trim(),
    status: this.statusFilter(),
    supplierId: this.supplierFilter(),
  }));

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Refetch the list whenever filters change, with a small debounce so
    // typing in the search box doesn't fire a request per keystroke.
    effect(() => {
      const payload = this.filterPayload();
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.fetchList(payload), 250);
    });

    // Auto-refresh whenever any invoice mutation lands (this tab or
    // another). Also refresh the summary cards so totals stay accurate.
    onInvalidate(this.cache, 'supplier-purchase-invoices', () => {
      this.fetchList(this.filterPayload(), true);
      this.fetchSummary();
    });
  }

  ngOnInit(): void {
    this.fetchSummary();
    this.fetchSuppliers();
  }

  // ─────────── data loaders ───────────

  protected fetchList(
    payload: { search: string; status: PurchaseInvoiceStatus | ''; supplierId: number | '' },
    force = false,
  ): void {
    this.loading.set(true);
    const stream$ = force
      ? this.svc.refreshList(payload)
      : this.svc.list(payload);
    stream$.subscribe({
      next: (list) => {
        this.invoices.set(list ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.invoices.set([]);
        this.loading.set(false);
      },
    });
  }

  protected fetchSummary(): void {
    // Reps don't see the totals cards — skip the (forbidden) summary call.
    if (this.isRepresentative()) {
      this.summary.set(null);
      return;
    }
    this.svc.getSummary().subscribe({
      next: (s) => this.summary.set(s),
      error: () => this.summary.set(null),
    });
  }

  private fetchSuppliers(): void {
    this.suppliersService.lookup().subscribe({
      next: (list) => this.suppliers.set(list ?? []),
      error: () => this.suppliers.set([]),
    });
  }

  protected refresh(): void {
    this.fetchList(this.filterPayload(), true);
    this.fetchSummary();
  }

  /** Exports the current filtered invoice list to a printable A4 PDF. */
  protected printInvoices(): void {
    const rows = this.invoices();
    if (rows.length === 0) return;

    const meta: Array<{ label: string; value: string }> = [];
    const search = this.searchTerm().trim();
    if (search) meta.push({ label: 'بحث', value: search });
    if (this.statusFilter()) {
      const opt = STATUS_OPTIONS.find((o) => o.value === this.statusFilter());
      if (opt) meta.push({ label: 'الحالة', value: opt.label });
    }
    if (this.supplierFilter() !== '') {
      const sup = this.suppliers().find((s) => s.id === Number(this.supplierFilter()));
      if (sup) meta.push({ label: 'المورد', value: sup.name });
    }

    const totalAmount    = rows.reduce((s, r) => s + (r.totalAmount ?? 0), 0);
    const totalPaid      = rows.reduce((s, r) => s + (r.paidAmount ?? 0), 0);
    const totalRemaining = rows.reduce((s, r) => s + (r.remainingAmount ?? 0), 0);

    this.printer.print<PurchaseInvoiceListItem>({
      title: 'قائمة فواتير المشتريات',
      subtitle: 'سجل فواتير الموردين والحالة المالية لكل فاتورة',
      meta,
      orientation: 'landscape',
      columns: [
        { key: 'invoiceNumber',   header: 'رقم الفاتورة', align: 'center', bold: true },
        { key: 'supplierName',    header: 'المورد',        align: 'start', bold: true },
        { key: 'itemsSummary',    header: 'البنود',        align: 'start' },
        { key: 'quantity',        header: 'الكمية',        align: 'center', format: 'number' },
        { key: 'invoiceDate',     header: 'التاريخ',       align: 'center', format: 'shortDate' },
        { key: 'totalAmount',     header: 'الإجمالي',     align: 'end', format: 'currency', bold: true },
        { key: 'paidAmount',      header: 'المدفوع',       align: 'end', format: 'currency' },
        { key: 'remainingAmount', header: 'المتبقي',       align: 'end', format: 'currency', bold: true },
        {
          key: 'status',
          header: 'الحالة',
          align: 'center',
          format: (v) => this.statusView(v as PurchaseInvoiceStatus).label,
        },
      ],
      totals: {
        label: 'الإجمالي',
        labelColSpan: 5,
        cells: [
          `${Math.round(totalAmount).toLocaleString('ar-EG')} ج.م`,
          `${Math.round(totalPaid).toLocaleString('ar-EG')} ج.م`,
          `${Math.round(totalRemaining).toLocaleString('ar-EG')} ج.م`,
          null,
        ],
      },
      rows,
    });
  }

  // ─────────── filter handlers ───────────

  protected onSearch(value: string): void {
    this.searchTerm.set(value);
  }

  protected onStatusChange(value: string): void {
    this.statusFilter.set(value as PurchaseInvoiceStatus | '');
  }

  protected onSupplierChange(value: string): void {
    this.supplierFilter.set(value === '' ? '' : Number(value));
  }

  // ─────────── navigation ───────────

  protected goToNew(): void {
    this.router.navigate(['/invoices/new']);
  }

  protected viewInvoice(inv: PurchaseInvoiceListItem): void {
    this.router.navigate(['/invoices', inv.id]);
  }

  protected editInvoice(inv: PurchaseInvoiceListItem): void {
    this.router.navigate(['/invoices', inv.id, 'edit']);
  }

  // ─────────── confirm modal ───────────

  protected openConfirm(inv: PurchaseInvoiceListItem): void {
    this.confirmTarget.set(inv);
    this.confirmOpen.set(true);
  }

  protected closeConfirm(): void {
    this.confirmOpen.set(false);
  }

  protected onConfirmed(updated: PurchaseInvoice): void {
    this.confirmOpen.set(false);
    this.invoices.update((list) =>
      list.map((i) =>
        i.id === updated.id
          ? {
              ...i,
              status: updated.status,
              paidAmount: updated.paidAmount,
              remainingAmount: updated.remainingAmount,
              totalAmount: updated.totalAmount,
            }
          : i,
      ),
    );
    // Refresh summary in the background so the cards reflect the change.
    this.fetchSummary();
  }

  // ─────────── payment modal ───────────

  protected openPayment(inv: PurchaseInvoiceListItem): void {
    this.paymentTarget.set(inv);
    this.paymentOpen.set(true);
  }

  protected closePayment(): void {
    this.paymentOpen.set(false);
  }

  protected onPaid(updated: PurchaseInvoice): void {
    this.paymentOpen.set(false);
    this.invoices.update((list) =>
      list.map((i) =>
        i.id === updated.id
          ? {
              ...i,
              status: updated.status,
              paidAmount: updated.paidAmount,
              remainingAmount: updated.remainingAmount,
            }
          : i,
      ),
    );
    this.fetchSummary();
  }

  // ─────────── return modal ───────────

  protected openReturn(inv: PurchaseInvoiceListItem): void {
    this.returnTarget.set(inv);
    this.returnOpen.set(true);
  }

  protected closeReturn(): void {
    this.returnOpen.set(false);
  }

  protected onInvoiceReturned(): void {
    this.returnOpen.set(false);
    this.invoices.update((list) =>
      list.map((i) =>
        i.id === this.returnTarget()?.id ? { ...i, status: 'Cancelled' as PurchaseInvoiceStatus } : i,
      ),
    );
    this.fetchSummary();
  }

  // ─────────── view helpers ───────────

  protected statusView(status: PurchaseInvoiceStatus): PurchaseInvoiceStatusView {
    return PURCHASE_INVOICE_STATUS_VIEW[status] ?? {
      label: status,
      variant: 'info',
    };
  }

  protected isDraft(inv: PurchaseInvoiceListItem): boolean {
    return inv.status === 'Draft';
  }

  /** True when the invoice can still receive payments (has an outstanding balance). */
  protected isPayable(inv: PurchaseInvoiceListItem): boolean {
    return (
      inv.remainingAmount > 0 &&
      inv.status !== 'Draft' &&
      inv.status !== 'Cancelled'
    );
  }

  /** True when the invoice can be returned: not already cancelled, no payments made. */
  protected isReturnable(inv: PurchaseInvoiceListItem): boolean {
    return inv.status !== 'Cancelled' && (inv.paidAmount ?? 0) === 0;
  }

  protected formatDate(iso: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

}
