import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { CustomersService } from '../../services/customers.service';
import { ContractsService } from '../../../contracts/services/contracts.service';
import { InstallmentsService } from '../../services/installments.service';
import { TreasuryService } from '../../../treasury/services/treasury.service';
import { DashboardClient } from '../../models/dashboard-client.model';
import {
  ClientContractRow,
  ContractDetails,
  PayInstallmentPayload,
} from '../../models/client-statement.model';
import { LookupItem } from '../../../../core/models/lookup.model';
import { PaymentRecord } from '../../models/customer.model';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../../../shared/components/searchable-select/searchable-select.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { todayIsoDate } from '../../../../shared/utils/date-iso.util';

type PaymentMethodKey = 'Cash' | 'Transfer' | 'Card' | 'STCPay' | 'ApplePay';

const CONTRACT_PAGE_SIZE = 100;

@Component({
  selector: 'app-payment',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    BadgeComponent,
    CurrencyArPipe,
    SearchableSelectComponent,
  ],
  templateUrl: './payment.component.html',
  styleUrl: './payment.component.scss',
})
export class PaymentComponent {
  private readonly customersService = inject(CustomersService);
  private readonly contractsService = inject(ContractsService);
  private readonly installmentsService = inject(InstallmentsService);
  private readonly treasuryService = inject(TreasuryService);
  private readonly customersLegacy = inject(CustomersService); // mock recent payments
  private readonly toast = inject(ToastService);

  // ── lookup data ──
  protected readonly clients = signal<DashboardClient[]>([]);
  protected readonly contracts = signal<ClientContractRow[]>([]);
  protected readonly treasuries = signal<LookupItem[]>([]);
  protected readonly contractDetails = signal<ContractDetails | null>(null);
  protected readonly recentPayments = signal<PaymentRecord[]>([]);

  /** Client list shaped for the searchable select (name + phone search). */
  protected readonly clientOptions = computed<SearchableSelectOption[]>(() =>
    this.clients().map((c) => ({
      value: c.id,
      label: c.fullName,
      hint: c.phoneNumber,
    })),
  );

  // ── form state ──
  protected readonly selectedClientId = signal<number | null>(null);
  protected readonly selectedContractId = signal<number | null>(null);
  protected readonly payTreasuryId = signal<number | null>(null);
  protected readonly payAmount = signal<number>(0);
  protected readonly payMethod = signal<PaymentMethodKey>('Cash');
  protected readonly payDate = signal<string>(todayIsoDate());
  protected readonly payNotes = signal<string>('');

  protected readonly submitting = signal(false);
  protected readonly detailsLoading = signal(false);

  // ── derived ──
  protected readonly selectedClient = computed(() =>
    this.clients().find((c) => c.id === this.selectedClientId()) ?? null,
  );

  protected readonly selectedContract = computed(() =>
    this.contracts().find((c) => c.id === this.selectedContractId()) ?? null,
  );

  /**
   * Live payment breakdown — uses real contract details when available so
   * the card mirrors the same numbers the customer sees in the statement
   * modal. Falls back to the table row data when details haven't loaded yet.
   */
  protected readonly paymentInfo = computed(() => {
    const c = this.selectedContract();
    if (!c) return null;
    const d = this.contractDetails();
    const installmentDue = d?.nextInstallment?.amount ?? c.installmentAmount;
    const totalPaid = d?.summary.totalPaid ?? c.totalPaid;
    const totalRemaining = d?.summary.totalRemaining ?? c.remainingAmount;
    const overdue = d?.summary.overdueAmount ?? 0;
    const now = Number(this.payAmount() ?? 0);
    return {
      installmentDue,
      totalPaid,
      now,
      remainingAfter: Math.max(0, totalRemaining - now),
      totalRemaining,
      overdue,
    };
  });

  constructor() {
    this.loadClients();
    this.loadTreasuries();

    // When the client changes, fetch their contracts and clear the
    // contract/details selection.
    effect(
      () => {
        const clientId = this.selectedClientId();
        this.selectedContractId.set(null);
        this.contractDetails.set(null);
        if (clientId === null) {
          this.contracts.set([]);
          return;
        }
        this.fetchContracts(clientId);
      },
      { allowSignalWrites: true },
    );

    // When the contract changes, fetch its details (for the live pay card).
    effect(
      () => {
        const contractId = this.selectedContractId();
        if (contractId === null) {
          this.contractDetails.set(null);
          return;
        }
        this.fetchContractDetails(contractId);
      },
      { allowSignalWrites: true },
    );
  }

  // ─────────── loaders ───────────

  private loadClients(): void {
    this.customersService.listAllClients().subscribe({
      next: (list) => this.clients.set(list),
      error: () => this.clients.set([]),
    });
  }

  private loadTreasuries(): void {
    // Lookup is already role-scoped + active-only server-side; a rep gets
    // just their own treasury, so it's used verbatim.
    this.treasuryService.lookup().subscribe({
      next: (list) => {
        this.treasuries.set(list);
        if (this.payTreasuryId() === null && list.length) {
          this.payTreasuryId.set(list[0].id);
        }
      },
      error: () => this.treasuries.set([]),
    });
  }

  private fetchContracts(clientId: number): void {
    this.customersService
      .getClientContracts(clientId, { pageIndex: 1, pageSize: CONTRACT_PAGE_SIZE })
      .subscribe({
        next: (page) => this.contracts.set(page?.data ?? []),
        error: () => this.contracts.set([]),
      });
  }

  private fetchContractDetails(id: number): void {
    this.detailsLoading.set(true);
    this.contractsService.getDetails(id).subscribe({
      next: (d) => {
        this.contractDetails.set(d);
        // Suggest the next installment amount as the default value the
        // operator can accept or override.
        const next = d.nextInstallment?.amount ?? 0;
        if (this.payAmount() === 0 && next > 0) {
          this.payAmount.set(Math.round(next * 100) / 100);
        }
        this.detailsLoading.set(false);
      },
      error: () => {
        this.contractDetails.set(null);
        this.detailsLoading.set(false);
      },
    });
  }

  // ─────────── handlers ───────────

  protected onClientChange(value: number | string | null): void {
    const id = value === null || value === '' ? null : Number(value);
    this.selectedClientId.set(id !== null && Number.isFinite(id) ? id : null);
    this.payAmount.set(0);
  }

  protected onContractChange(value: string): void {
    const id = value ? Number(value) : null;
    this.selectedContractId.set(Number.isFinite(id) ? id : null);
    this.payAmount.set(0);
  }

  protected recordPayment(): void {
    const contract = this.selectedContract();
    if (!contract) {
      this.toast.error('اختر العميل والعقد أولاً');
      return;
    }
    const amount = Number(this.payAmount());
    if (!amount || amount <= 0) {
      this.toast.error('أدخل مبلغًا صحيحًا');
      return;
    }
    const treasuryId = this.payTreasuryId();
    if (treasuryId === null) {
      this.toast.error('اختر الخزينة');
      return;
    }

    const payload: PayInstallmentPayload = {
      contractId: contract.id,
      amount,
      treasuryId,
      paymentDate: new Date(this.payDate()).toISOString(),
      paymentMethod: this.toServerMethod(this.payMethod()),
      notes: this.payNotes().trim() || '',
    };

    this.submitting.set(true);
    this.installmentsService.pay(payload).subscribe({
      next: () => {
        this.submitting.set(false);
        this.toast.success('تم تسجيل الدفعة بنجاح');
        // Refresh the details panel inline so the pay-info card reflects
        // the new totals; the rest of the app updates via cache invalidation.
        this.fetchContractDetails(contract.id);
        this.payAmount.set(0);
        this.payNotes.set('');
      },
      error: (err: ApiError) => {
        this.submitting.set(false);
        this.toast.error(apiErrorToMessage(err, 'فشل تسجيل الدفعة'));
      },
    });
  }
  
  // ─────────── view helpers ───────────

  protected getStatusLabel(s: PaymentRecord['status']): string {
    const map: Record<PaymentRecord['status'], string> = {
      complete: 'مكتمل',
      partial: 'جزئي',
      remainder: 'تتمة',
    };
    return map[s];
  }

  protected getStatusBadge(s: PaymentRecord['status']): 'ok' | 'warn' {
    return s === 'partial' ? 'warn' : 'ok';
  }

  protected contractOptionLabel(c: ClientContractRow): string {
    return `عقد #${c.id} — ${c.productName} (${c.installmentsCount} قسط)`;
  }

  // ─────────── internals ───────────

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
