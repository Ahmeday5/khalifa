import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { CustomersService } from '../../services/customers.service';
import { InstallmentsService } from '../../services/installments.service';
import { ContractsService } from '../../../contracts/services/contracts.service';
import { TreasuryService } from '../../../treasury/services/treasury.service';
import {
  ClientContractListItem,
  ClientContractRow,
  ContractDetails,
  ContractInstallmentRow,
  ContractInstallmentStatus,
  PayInstallmentPayload,
} from '../../models/client-statement.model';
import {
  DashboardClient,
} from '../../models/dashboard-client.model';
import { LookupItem } from '../../../../core/models/lookup.model';
import {
  BadgeComponent,
  BadgeType,
} from '../../../../shared/components/badge/badge.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../../../shared/components/searchable-select/searchable-select.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { HttpCacheService } from '../../../../core/services/http-cache.service';
import { onInvalidate } from '../../../../core/utils/auto-refresh.util';
import { todayIsoDate } from '../../../../shared/utils/date-iso.util';
import { PrintService } from '../../../../core/services/print.service';
import { fetchAllPages } from '../../../../core/utils/api-list.util';
import { ReturnContractModalComponent } from '../../../contracts/components/return-contract-modal/return-contract-modal.component';

const DEFAULT_PAGE_SIZE = 10;

type PaymentMethodKey = 'Cash' | 'Transfer' | 'Card' | 'STCPay' | 'ApplePay';

interface PaymentForm {
  amount: number;
  treasuryId: number | null;
  paymentMethod: PaymentMethodKey;
  paymentDate: string;
  notes: string;
}

@Component({
  selector: 'app-statement',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    FormsModule,
    RouterModule,
    BadgeComponent,
    ModalComponent,
    PaginationComponent,
    CurrencyArPipe,
    SearchableSelectComponent,
    ReturnContractModalComponent,
  ],
  templateUrl: './statement.component.html',
  styleUrl: './statement.component.scss',
})
export class StatementComponent {
  private readonly customersService = inject(CustomersService);
  private readonly contractsService = inject(ContractsService);
  private readonly installmentsService = inject(InstallmentsService);
  private readonly treasuryService = inject(TreasuryService);
  private readonly toast = inject(ToastService);
  private readonly cache = inject(HttpCacheService);
  private readonly printer = inject(PrintService);

  protected readonly isPrinting = signal(false);

  // ── client picker ──────────────────────────────────────────────────
  protected readonly clients = signal<DashboardClient[]>([]);
  protected readonly clientsLoading = signal(false);
  protected readonly selectedClientId = signal<number | null>(null);

  protected readonly selectedClient = computed(() =>
    this.clients().find((c) => c.id === this.selectedClientId()) ?? null,
  );

  /** Client list shaped for the searchable select (name + phone search). */
  protected readonly clientOptions = computed<SearchableSelectOption[]>(() =>
    this.clients().map((c) => ({
      value: c.id,
      label: c.fullName,
      hint: c.phoneNumber,
    })),
  );

  // ── contracts table ────────────────────────────────────────────────
  protected readonly contracts = signal<ClientContractRow[]>([]);
  protected readonly contractsLoading = signal(false);
  protected readonly pageIndex = signal(1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  protected readonly count = signal(0);
  protected readonly totalPages = signal(0);

  // ── details modal ──────────────────────────────────────────────────
  protected readonly detailsOpen = signal(false);
  protected readonly detailsLoading = signal(false);
  protected readonly details = signal<ContractDetails | null>(null);
  private readonly activeContractId = signal<number | null>(null);

  // ── return-contract modal ─────────────────────────────────────────
  protected readonly returnContractOpen = signal(false);

  // ── payment modal ──────────────────────────────────────────────────
  protected readonly payOpen = signal(false);
  protected readonly paySubmitting = signal(false);
  protected readonly treasuries = signal<LookupItem[]>([]);

  protected readonly payForm = signal<PaymentForm>(this.emptyPaymentForm());

  protected readonly payRemainingAfter = computed(() => {
    const d = this.details();
    const amt = Number(this.payForm().amount) || 0;
    if (!d) return 0;
    return Math.max(0, (d.summary.totalRemaining ?? 0) - amt);
  });

  constructor() {
    this.loadClients();
    this.loadTreasuries();

    // Refetch contracts whenever the selected client or page changes.
    effect(
      () => {
        const clientId = this.selectedClientId();
        const page = this.pageIndex();
        const size = this.pageSize();
        if (clientId === null) {
          this.contracts.set([]);
          this.count.set(0);
          this.totalPages.set(0);
          return;
        }
        this.fetchContracts(clientId, page, size, false);
      },
      { allowSignalWrites: true },
    );

    // Auto-refresh on any contract/payment/installment invalidation
    // (covers cross-tab events as well).
    onInvalidate(this.cache, 'contract', () => this.refreshAfterMutation());
    onInvalidate(this.cache, 'payment', () => this.refreshAfterMutation());
    onInvalidate(this.cache, 'installment', () =>
      this.refreshAfterMutation(),
    );
  }

  // ─────────── loaders ───────────

  private loadClients(): void {
    this.clientsLoading.set(true);
    this.customersService.listAllClients().subscribe({
      next: (list) => {
        this.clients.set(list);
        this.clientsLoading.set(false);
      },
      error: () => {
        this.clients.set([]);
        this.clientsLoading.set(false);
      },
    });
  }

  private loadTreasuries(): void {
    // Lookup is role-scoped + active-only server-side — used verbatim.
    this.treasuryService.lookup().subscribe({
      next: (list) => this.treasuries.set(list),
      error: () => this.treasuries.set([]),
    });
  }

  private fetchContracts(
    clientId: number,
    pageIndex: number,
    pageSize: number,
    force: boolean,
  ): void {
    this.contractsLoading.set(true);
    const stream$ = force
      ? this.customersService.refreshClientContracts(clientId, {
          pageIndex,
          pageSize,
        })
      : this.customersService.getClientContracts(clientId, {
          pageIndex,
          pageSize,
        });

    stream$.subscribe({
      next: (page) => {
        this.contracts.set(page?.data ?? []);
        this.count.set(page?.count ?? 0);
        this.totalPages.set(page?.totalPages ?? 0);
        this.contractsLoading.set(false);
      },
      error: (err: ApiError) => {
        this.contracts.set([]);
        this.count.set(0);
        this.totalPages.set(0);
        this.contractsLoading.set(false);
        this.toast.error(apiErrorToMessage(err, 'تعذّر تحميل عقود العميل'));
      },
    });
  }

  private refreshAfterMutation(): void {
    const clientId = this.selectedClientId();
    if (clientId !== null) {
      this.fetchContracts(clientId, this.pageIndex(), this.pageSize(), true);
    }
    const contractId = this.activeContractId();
    if (contractId !== null && this.detailsOpen()) {
      this.reloadDetails(contractId);
    }
  }

  // ─────────── client picker handlers ───────────

  protected onClientChange(value: number | string | null): void {
    const id = value === null || value === '' ? null : Number(value);
    this.selectedClientId.set(id !== null && Number.isFinite(id) ? id : null);
    this.pageIndex.set(1);
  }

  protected refreshContracts(): void {
    const id = this.selectedClientId();
    if (id === null) return;
    this.fetchContracts(id, this.pageIndex(), this.pageSize(), true);
  }

  /**
   * Exports every contract for the selected client as a single PDF. Always
   * paginates through every server page so the printed document is complete
   * — the visible table may only be showing the first 10 rows.
   */
  protected printStatement(): void {
    const client = this.selectedClient();
    if (!client || this.isPrinting()) return;
    this.isPrinting.set(true);

    fetchAllPages<ClientContractRow>((pageIndex, pageSize) =>
      this.customersService.refreshClientContracts(client.id, {
        pageIndex,
        pageSize,
      }),
    ).subscribe({
      next: (rows) => {
        this.isPrinting.set(false);
        const totalSale = rows.reduce((s, r) => s + (r.totalContractAmount ?? 0), 0);
        const totalPaid = rows.reduce((s, r) => s + (r.totalPaid ?? 0), 0);
        const totalRemaining = rows.reduce((s, r) => s + (r.remainingAmount ?? 0), 0);

        this.printer.print<ClientContractRow>({
          title: 'كشف حساب العميل',
          subtitle: client.fullName,
          meta: [
            { label: 'العميل', value: client.fullName },
            ...(client.phoneNumber ? [{ label: 'الهاتف', value: client.phoneNumber }] : []),
            { label: 'عدد العقود', value: String(rows.length) },
          ],
          orientation: 'landscape',
          columns: [
            { key: 'id',                  header: 'العقد',         align: 'center', width: '52px', format: (v) => `#${v}` },
            { key: 'items',               header: 'الأصناف',        align: 'start',  bold: true,  format: (v) => this.itemsLabel(v as ClientContractListItem[]) },
            { key: 'quantity',            header: 'الكمية',         align: 'center', format: 'number' },
            { key: 'dateOfSale',          header: 'تاريخ البيع',   align: 'center', format: 'shortDate' },
            { key: 'cashPrice',           header: 'سعر النقد',     align: 'end',    format: 'currency' },
            { key: 'downPayment',         header: 'المقدم',         align: 'end',    format: 'currency' },
            { key: 'installmentsCount',   header: 'عدد الأقساط',    align: 'center', format: 'number' },
            { key: 'installmentAmount',   header: 'قيمة القسط',     align: 'end',    format: 'currency' },
            { key: 'totalContractAmount', header: 'إجمالي العقد',  align: 'end',    format: 'currency', bold: true },
            { key: 'totalPaid',           header: 'المدفوع',        align: 'end',    format: 'currency' },
            { key: 'remainingAmount',     header: 'المتبقي',        align: 'end',    format: 'currency', bold: true },
            {
              key: 'status',
              header: 'الحالة',
              align: 'center',
              format: (v) => this.contractStatusLabel(String(v)),
            },
          ],
          totals: {
            label: 'الإجمالي',
            labelColSpan: 8,
            cells: [
              null,
              `${Math.round(totalSale).toLocaleString('ar-EG')} ج.م`,
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

  // ─────────── pagination ───────────

  protected onPageChange(page: number): void {
    this.pageIndex.set(page);
  }

  protected onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.pageIndex.set(1);
  }

  // ─────────── details modal ───────────

  protected openDetails(row: ClientContractRow): void {
    this.activeContractId.set(row.id);
    this.details.set(null);
    this.detailsOpen.set(true);
    this.reloadDetails(row.id);
  }

  protected closeDetails(): void {
    this.detailsOpen.set(false);
    this.activeContractId.set(null);
    this.details.set(null);
  }

  protected openReturnContract(): void {
    this.returnContractOpen.set(true);
  }

  protected onContractReturned(): void {
    this.returnContractOpen.set(false);
    this.detailsOpen.set(false);
    this.activeContractId.set(null);
    this.details.set(null);
    const clientId = this.selectedClientId();
    if (clientId !== null) {
      this.fetchContracts(clientId, this.pageIndex(), this.pageSize(), true);
    }
  }

  private reloadDetails(id: number): void {
    this.detailsLoading.set(true);
    this.contractsService.refreshDetails(id).subscribe({
      next: (d) => {
        this.details.set(d);
        this.detailsLoading.set(false);
      },
      error: (err: ApiError) => {
        this.detailsLoading.set(false);
        this.toast.error(apiErrorToMessage(err, 'تعذّر تحميل تفاصيل العقد'));
      },
    });
  }

  // ─────────── payment modal ───────────

  protected openPayment(): void {
    const d = this.details();
    if (!d) return;
    const suggested = d.nextInstallment?.amount ?? d.summary.totalRemaining ?? 0;
    const defaultTreasury = this.treasuries()[0]?.id ?? null;
    this.payForm.set({
      amount: Math.round(suggested * 100) / 100,
      treasuryId: defaultTreasury,
      paymentMethod: 'Cash',
      paymentDate: todayIsoDate(),
      notes: '',
    });
    this.payOpen.set(true);
  }

  protected closePayment(): void {
    if (this.paySubmitting()) return;
    this.payOpen.set(false);
  }

  protected updatePayForm<K extends keyof PaymentForm>(
    key: K,
    value: PaymentForm[K],
  ): void {
    this.payForm.update((f) => ({ ...f, [key]: value }));
  }

  protected submitPayment(): void {
    const d = this.details();
    const f = this.payForm();
    if (!d) return;
    if (!f.amount || f.amount <= 0) {
      this.toast.error('أدخل مبلغًا صحيحًا');
      return;
    }
    if (f.treasuryId === null) {
      this.toast.error('اختر الخزينة');
      return;
    }

    const payload: PayInstallmentPayload = {
      contractId: d.contract.id,
      amount: Number(f.amount),
      treasuryId: f.treasuryId,
      paymentDate: new Date(f.paymentDate).toISOString(),
      paymentMethod: this.toServerMethod(f.paymentMethod),
      notes: f.notes?.trim() || '',
    };

    this.paySubmitting.set(true);
    this.installmentsService.pay(payload).subscribe({
      next: () => {
        this.paySubmitting.set(false);
        this.payOpen.set(false);
        this.toast.success('تم تسجيل الدفعة بنجاح');
        // The mutation already invalidates cache keys; the effect-driven
        // refresh + the onInvalidate hooks take care of the rest.
      },
      error: (err: ApiError) => {
        this.paySubmitting.set(false);
        this.toast.error(apiErrorToMessage(err, 'فشل تسجيل الدفعة'));
      },
    });
  }

  // ─────────── view helpers ───────────

  /** Notes column fallback — backend may send null/empty. */
  protected notesLabel(notes: string | null | undefined): string {
    const trimmed = notes?.trim();
    return trimmed ? trimmed : 'لا يوجد ملاحظات';
  }

  protected freqLabel(freq: string | null): string {
    if (!freq) return '—';
    const map: Record<string, string> = {
      Monthly: 'شهري',
      Weekly: 'أسبوعي',
      Quarterly: 'ربع سنوي',
      SemiAnnual: 'نصف سنوي',
      SemiAnnually: 'نصف سنوي',
      Annual: 'سنوي',
      Annually: 'سنوي',
    };
    return map[freq] ?? freq;
  }

  protected itemsLabel(items: ClientContractListItem[] | null | undefined): string {
    if (!items?.length) return '—';
    return items.map((i) => `${i.productName} (${i.quantity})`).join(' / ');
  }

  protected paymentMethodLabel(method: string | null | undefined): string {
    if (!method) return '—';
    const map: Record<string, string> = {
      Cash: 'نقدي',
      cash: 'نقدي',
      Transfer: 'تحويل بنكي',
      transfer: 'تحويل بنكي',
      Card: 'بطاقة',
      card: 'بطاقة',
      STCPay: 'STC Pay',
      stcpay: 'STC Pay',
      ApplePay: 'Apple Pay',
      applepay: 'Apple Pay',
    };
    return map[method] ?? method;
  }

  protected contractStatusLabel(status: string): string {
    const map: Record<string, string> = {
      Active: 'ساري',
      Completed: 'مكتمل',
      Defaulted: 'متعثر',
      Cancelled: 'ملغي',
    };
    return map[status] ?? status;
  }

  protected contractStatusBadge(status: string): BadgeType {
    switch (status) {
      case 'Active':
        return 'info';
      case 'Completed':
        return 'ok';
      case 'Defaulted':
        return 'bad';
      case 'Cancelled':
        return 'warn';
      default:
        return 'info';
    }
  }

  protected installmentLabel(s: ContractInstallmentStatus): string {
    const map: Record<string, string> = {
      Paid: 'مسدد',
      Partial: 'جزئي',
      Upcoming: 'قادم',
      Overdue: 'متأخر',
      Unpaid: 'غير مسدد',
    };
    return map[s] ?? s;
  }

  protected installmentBadge(row: ContractInstallmentRow): BadgeType {
    if (row.isOverdue) return 'bad';
    switch (row.status) {
      case 'Paid':
        return 'ok';
      case 'Partial':
        return 'warn';
      case 'Overdue':
        return 'bad';
      case 'Upcoming':
      default:
        return 'info';
    }
  }

  protected formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    // Backend returns either ISO datetime or YYYY-MM-DD.
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  // ─────────── internals ───────────

  private emptyPaymentForm(): PaymentForm {
    return {
      amount: 0,
      treasuryId: null,
      paymentMethod: 'Cash',
      paymentDate: todayIsoDate(),
      notes: '',
    };
  }

  /**
   * Translates the UI radio key to what the backend's `paymentMethod`
   * field expects. The Pay endpoint accepts the lowercase tokens shown
   * in the sample payload (e.g. `"cash"`).
   */
  private toServerMethod(key: PaymentMethodKey): string {
    const map: Record<PaymentMethodKey, string> = {
      Cash: 'cash',
      Transfer: 'transfer',
      Card: 'card',
      STCPay: 'stcpay',
      ApplePay: 'applepay',
    };
    return map[key];
  }
}
