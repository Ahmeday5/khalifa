import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { SuppliersService } from '../../services/suppliers.service';
import {
  Supplier,
  SupplierPaymentResponse,
  SuppliersSummary,
} from '../../models/supplier.model';
import { SupplierFormModalComponent } from '../../components/supplier-form-modal/supplier-form-modal.component';
import { SupplierStatementModalComponent } from '../../components/supplier-statement-modal/supplier-statement-modal.component';
import { SupplierPaymentModalComponent } from '../../components/supplier-payment-modal/supplier-payment-modal.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { FormMode } from '../../../../shared/models/form-mode.model';
import { DialogService } from '../../../../core/services/dialog.service';
import { ToastService } from '../../../../core/services/toast.service';
import { HttpCacheService } from '../../../../core/services/http-cache.service';
import { onInvalidate } from '../../../../core/utils/auto-refresh.util';
import { ApiError } from '../../../../core/models/api-response.model';
import { HasPermissionDirective } from '../../../../shared/directives/has-permission.directive';
import { PERMISSIONS } from '../../../../core/constants/permissions.const';
import { PrintService } from '../../../../core/services/print.service';
import { map } from 'rxjs/operators';
import { fetchAllPages } from '../../../../core/utils/api-list.util';

const DEFAULT_PAGE_SIZE = 10;

/**
 * Suppliers index page.
 *
 *   - server-paginated list (`pageIndex` / `pageSize`)
 *   - debounced search (300ms) — issues a fresh page-1 fetch
 *   - CRUD: create / edit / view via the form modal, delete via dialog
 *   - mutations are optimistic where safe (delete) and refetch the
 *     active page on save so server-side ordering stays authoritative
 */
@Component({
  selector: 'app-suppliers-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SupplierFormModalComponent,
    SupplierStatementModalComponent,
    SupplierPaymentModalComponent,
    PaginationComponent,
    CurrencyArPipe,
    HasPermissionDirective,
  ],
  templateUrl: './suppliers-list.component.html',
  styleUrl: './suppliers-list.component.scss',
})
export class SuppliersListComponent implements OnInit {
  private readonly service = inject(SuppliersService);
  private readonly dialog  = inject(DialogService);
  private readonly toast   = inject(ToastService);
  private readonly cache   = inject(HttpCacheService);
  private readonly printer = inject(PrintService);

  protected readonly isPrinting = signal(false);

  /** Exposed so the template can gate write actions with `*appHasPermission`. */
  protected readonly PERMS = PERMISSIONS;

  // ── data ──
  protected readonly suppliers = signal<Supplier[]>([]);
  protected readonly summary   = signal<SuppliersSummary | null>(null);
  protected readonly loading   = signal(false);

  // ── filters ──
  protected readonly searchTerm = signal('');
  protected readonly pageIndex  = signal(1);
  protected readonly pageSize   = signal(DEFAULT_PAGE_SIZE);

  // ── pagination meta from server ──
  protected readonly count      = signal(0);
  protected readonly totalPages = signal(0);

  // ── modal state ──
  protected readonly modalOpen     = signal(false);
  protected readonly modalMode     = signal<FormMode>('create');
  protected readonly modalSupplier = signal<Supplier | null>(null);

  // ── statement modal state ──
  protected readonly statementOpen     = signal(false);
  protected readonly statementSupplier = signal<Supplier | null>(null);

  // ── payment modal state ──
  protected readonly paymentOpen     = signal(false);
  protected readonly paymentSupplier = signal<Supplier | null>(null);

  /** Tracks which row is currently being deleted, for inline button state. */
  protected readonly deletingId = signal<number | null>(null);

  // ── derived ──
  protected readonly hasSuppliers = computed(() => this.suppliers().length > 0);
  protected readonly hasFilters   = computed(() => this.searchTerm().length > 0);

  // ── debounce machinery ──
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  /** Bumps when filters change to retrigger the loader effect. */
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

    // Auto-refresh whenever a supplier-related cache key is invalidated
    // — e.g. another tab created a supplier, or an invoice mutation
    // touched supplier aggregates.
    onInvalidate(this.cache, 'supplier', () => this.refresh());
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
    const stream$ = force
      ? this.service.refreshList(trigger)
      : this.service.list(trigger);
    stream$.subscribe({
      next: (res) => {
        const items = res?.items;
        this.suppliers.set(items?.data ?? []);
        this.count.set(items?.count ?? 0);
        this.totalPages.set(items?.totalPages ?? 0);
        this.summary.set(res?.summary ?? null);
        this.loading.set(false);
      },
      error: () => {
        this.suppliers.set([]);
        this.count.set(0);
        this.totalPages.set(0);
        this.summary.set(null);
        this.loading.set(false);
      },
    });
  }

  protected refresh(): void {
    this.fetch(this.fetchTrigger(), true);
  }

  /** Exports every supplier matching the active search to a PDF. */
  protected printSuppliers(): void {
    if (this.isPrinting()) return;
    this.isPrinting.set(true);
    const search = this.searchTerm().trim();

    fetchAllPages<Supplier>((pageIndex, pageSize) =>
      this.service
        .refreshList({ search, pageIndex, pageSize })
        .pipe(map((r) => r.items)),
    ).subscribe({
      next: (rows) => {
        this.isPrinting.set(false);
        const totalPurchases = rows.reduce((s, r) => s + (r.totalAmount ?? 0), 0);
        const totalPaid      = rows.reduce((s, r) => s + (r.paidAmount ?? 0), 0);
        const totalRemaining = rows.reduce((s, r) => s + (r.remainingAmount ?? 0), 0);

        this.printer.print<Supplier>({
          title: 'قائمة الموردين',
          subtitle: 'سجل الموردين وإجمالي التعاملات المالية',
          meta: search ? [{ label: 'بحث', value: search }] : undefined,
          orientation: 'landscape',
          columns: [
            { key: 'id',              header: '#',           align: 'center', width: '46px' },
            { key: 'fullName',        header: 'الاسم',       align: 'start', bold: true },
            { key: 'phoneNumber',     header: 'الهاتف',      align: 'start' },
            { key: 'address',         header: 'العنوان',     align: 'start' },
            { key: 'goods',           header: 'البضاعة',     align: 'start' },
            { key: 'quantity',        header: 'الكمية',       align: 'center', format: 'number' },
            { key: 'totalAmount',     header: 'إجمالي المشتريات', align: 'end', format: 'currency', bold: true },
            { key: 'paidAmount',      header: 'المدفوع',       align: 'end', format: 'currency' },
            { key: 'remainingAmount', header: 'المتبقي',       align: 'end', format: 'currency', bold: true },
            { key: 'lastSupplyDate',  header: 'آخر توريد',    align: 'center', format: 'shortDate' },
          ],
          totals: {
            label: 'الإجمالي',
            labelColSpan: 6,
            cells: [
              `${Math.round(totalPurchases).toLocaleString('ar-EG')} ج.م`,
              `${Math.round(totalPaid).toLocaleString('ar-EG')} ج.م`,
              `${Math.round(totalRemaining).toLocaleString('ar-EG')} ج.م`,
              null,
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
    // Searching a different term should always start at page 1.
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
    // Resetting to page 1 keeps the user oriented after a size change.
    this.pageIndex.set(1);
  }

  // ─────────── modal handlers ───────────

  protected openCreate(): void {
    this.modalSupplier.set(null);
    this.modalMode.set('create');
    this.modalOpen.set(true);
  }

  protected openEdit(supplier: Supplier): void {
    this.modalSupplier.set(supplier);
    this.modalMode.set('edit');
    this.modalOpen.set(true);
  }

  protected closeModal(): void {
    this.modalOpen.set(false);
  }

  protected openStatement(supplier: Supplier): void {
    this.statementSupplier.set(supplier);
    this.statementOpen.set(true);
  }

  protected closeStatement(): void {
    this.statementOpen.set(false);
  }

  protected openPayment(supplier: Supplier): void {
    this.paymentSupplier.set(supplier);
    this.paymentOpen.set(true);
  }

  protected closePayment(): void {
    this.paymentOpen.set(false);
  }

  protected onPaid(res: SupplierPaymentResponse): void {
    this.paymentOpen.set(false);
    // Update the supplier's remaining amount in-place so the row reflects the
    // payment immediately without a full round-trip.
    this.suppliers.update((list) =>
      list.map((s) =>
        s.id === res.supplierId
          ? {
              ...s,
              paidAmount: (s.paidAmount ?? 0) + res.amount,
              remainingAmount: res.supplierOwedAfter,
            }
          : s,
      ),
    );
  }

  protected onSaved(saved: Supplier): void {
    const wasCreate = this.modalMode() === 'create';
    this.modalOpen.set(false);

    if (wasCreate) {
      // Jump to page 1 so the freshly-created supplier is visible without
      // hunting; the server-side ordering decides where it actually lands.
      if (this.pageIndex() !== 1) this.pageIndex.set(1);
      else this.refresh();
      return;
    }

    // Edit: update in-place to avoid a network round-trip when the row
    // is already on this page.
    const onPage = this.suppliers().some((s) => s.id === saved.id);
    if (onPage) {
      this.suppliers.update((list) =>
        list.map((s) => (s.id === saved.id ? saved : s)),
      );
    } else {
      this.refresh();
    }
  }

  // ─────────── delete ───────────

  // ─────────── view helpers ───────────

  protected formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  // ─────────── delete ───────────

  protected async confirmDelete(supplier: Supplier): Promise<void> {
    const ok = await this.dialog.confirm({
      title: 'حذف مورد',
      message: `هل أنت متأكد من حذف "${supplier.fullName}"؟ هذا الإجراء لا يمكن التراجع عنه.`,
      confirmText: 'حذف',
      cancelText: 'إلغاء',
      type: 'danger',
    });
    if (!ok) return;

    this.deletingId.set(supplier.id);
    this.service.delete(supplier.id).subscribe({
      next: () => {
        this.deletingId.set(null);
        this.toast.success('تم حذف المورد بنجاح');
        // If we just emptied the page (and it isn't the first), step back.
        if (this.suppliers().length === 1 && this.pageIndex() > 1) {
          this.pageIndex.update((p) => p - 1);
        } else {
          this.refresh();
        }
      },
      error: (err: ApiError) => {
        this.deletingId.set(null);
        this.toast.error(err.message || 'تعذّر حذف المورد');
      },
    });
  }
}
