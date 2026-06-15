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
import { DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { FormErrorComponent } from '../../../../shared/components/form-error/form-error.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../../../shared/components/searchable-select/searchable-select.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { DateArPipe } from '../../../../shared/pipes/date-ar.pipe';
import { ApiError } from '../../../../core/models/api-response.model';
import { ToastService } from '../../../../core/services/toast.service';

import { ShareholdersService } from '../../services/shareholders.service';
import { TreasuryService } from '../../services/treasury.service';
import { TreasuryType } from '../../enums/treasury-type.enum';
import { Treasury } from '../../models/treasury.model';
import { Shareholder } from '../../models/shareholder.model';
import { ProfitSettlementPreview } from '../../models/profit-settlement.model';
import {
  CapitalTransaction,
  CapitalTransactionDirection,
  CapitalTransactionType,
} from '../../models/capital-transaction.model';
import {
  CAPITAL_TX_DIRECTION_BADGE,
  CAPITAL_TX_DIRECTION_LABELS,
  CAPITAL_TX_TYPE_OPTIONS,
  isCapitalInflow,
} from '../../constants/capital-transaction-labels';

type CapitalMode = 'transaction' | 'capitalize';

const DEFAULT_PAGE_SIZE = 10;

const PROFIT_TREASURY_TYPES = new Set([
  TreasuryType.Profits,
  TreasuryType.SubRepresentativeProfits,
  TreasuryType.CompanyProfits,
]);
const VOUCHER_PREFIX_LEN = 18;

/**
 * Per-shareholder capital workbench.
 *
 *   <app-shareholder-capital-modal
 *     [open]="capitalOpen()"
 *     [shareholder]="capitalShareholder()"
 *     (closed)="closeCapital()"
 *     (changed)="onCapitalChanged()" />
 *
 * Two write surfaces sharing one ledger:
 *   - «حركة رأس مال»  — deposit (Receipt) / withdraw (Payment) against a regular
 *     cash treasury (profits & representative treasuries are filtered out).
 *   - «ترحيل أرباح»   — roll part of the shareholder's accrued profit into
 *     capital, drawn from the live profits treasury (capped at the available
 *     profit reported by the settlement preview).
 *
 * Below the forms sits the paginated capital-movement history. The header's
 * "current capital" tracks the newest movement's `balanceAfter`, so it stays
 * accurate without refetching the shareholder after every write.
 */
@Component({
  selector: 'app-shareholder-capital-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    DecimalPipe,
    ModalComponent,
    FormErrorComponent,
    PaginationComponent,
    BadgeComponent,
    SearchableSelectComponent,
    CurrencyArPipe,
    DateArPipe,
  ],
  templateUrl: './shareholder-capital-modal.component.html',
  styleUrl: './shareholder-capital-modal.component.scss',
})
export class ShareholderCapitalModalComponent {
  // ── inputs ──
  readonly open = input.required<boolean>();
  readonly shareholder = input<Shareholder | null>(null);

  // ── outputs ──
  readonly closed = output<void>();
  /** Emitted after any successful write so the parent can refresh its list. */
  readonly changed = output<void>();

  // ── deps ──
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(ShareholdersService);
  private readonly treasuryService = inject(TreasuryService);
  private readonly toast = inject(ToastService);

  // ── static option tables ──
  protected readonly CapitalTransactionType = CapitalTransactionType;
  protected readonly typeOptions = CAPITAL_TX_TYPE_OPTIONS;

  // ── view mode ──
  protected readonly mode = signal<CapitalMode>('transaction');

  // ── write state ──
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  // ── live form mirrors (for the projection panels) ──
  protected readonly draftTxType = signal<CapitalTransactionType>(
    CapitalTransactionType.Receipt,
  );
  protected readonly draftTxAmount = signal(0);
  protected readonly draftCapAmount = signal(0);

  // ── live capital — source of truth is contributedAmount from the shareholders list ──
  private readonly liveCapital = signal<number | null>(null);
  private readonly lastOpenShId = signal<number | null>(null);

  // ── profit preview (profits treasury + this shareholder's available slice) ──
  protected readonly preview = signal<ProfitSettlementPreview | null>(null);
  protected readonly previewLoading = signal(false);

  // ── treasuries (for the deposit/withdraw picker) ──
  private readonly treasuries = signal<Treasury[]>([]);
  protected readonly treasuriesLoading = signal(false);

  // ── ledger ──
  protected readonly transactions = signal<CapitalTransaction[]>([]);
  protected readonly txLoading = signal(false);
  protected readonly pageIndex = signal(1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  protected readonly count = signal(0);
  protected readonly totalPages = signal(0);

  // ── derived ──
  protected readonly title = computed(
    () => `رأس المال — ${this.shareholder()?.name ?? ''}`,
  );

  protected readonly currentCapital = computed(
    () => this.liveCapital() ?? this.shareholder()?.contributedAmount ?? 0,
  );

  protected readonly ownedPercentage = computed(
    () => this.shareholder()?.ownedPercentage ?? 0,
  );

  protected readonly profitsTreasuryName = computed(
    () => this.preview()?.profitsTreasuryName ?? '—',
  );

  /**
   * Profit available for capitalisation for THIS shareholder.
   * Primary source: the live preview (reflects server-computed AccruedProfit).
   * Fallback: shareholder.accruedProfit from the DTO (accurate until a write
   * happens; updated after each capitalize via loadPreview()).
   */
  protected readonly availableProfit = computed(() => {
    const sh = this.shareholder();
    if (!sh) return 0;
    const line = this.preview()?.lines.find((l) => l.shareholderId === sh.id);
    return line?.amount ?? sh.accruedProfit ?? 0;
  });

  /**
   * Percentage of the capitalised amount that goes to the company's profits
   * treasury (0 when not yet known or when the shareholder has no company cut).
   */
  protected readonly companyPercentage = computed(() => {
    const sh = this.shareholder();
    if (!sh) return 0;
    const line = this.preview()?.lines.find((l) => l.shareholderId === sh.id);
    return line?.companyPercentage ?? 0;
  });

  protected readonly canCapitalize = computed(
    () => this.availableProfit() > 0,
  );

  /**
   * Cash treasuries valid for a capital deposit/withdrawal: active, not a
   * representative sub-treasury, and not any profits-type treasury.
   */
  protected readonly treasuryOptions = computed<SearchableSelectOption[]>(() =>
    this.treasuries()
      .filter(
        (t) =>
          t.isActive &&
          t.type !== TreasuryType.SubRepresentative &&
          !PROFIT_TREASURY_TYPES.has(t.type as TreasuryType),
      )
      .map((t) => ({
        value: t.id,
        label: t.name,
        hint: t.type === TreasuryType.Bank ? 'بنك' : undefined,
      })),
  );

  /** Operational treasuries valid as source for capitalising profits. */
  protected readonly capOperationalTreasuryOptions = computed<SearchableSelectOption[]>(() =>
    this.treasuries()
      .filter((t) => t.isActive && !PROFIT_TREASURY_TYPES.has(t.type as TreasuryType))
      .map((t) => ({
        value: t.id,
        label: t.name,
        hint: t.type === TreasuryType.Bank ? 'بنك' : undefined,
      })),
  );

  /** Capital balance after a deposit (adds) / withdrawal (subtracts). */
  protected readonly projectedCapital = computed(() => {
    const delta =
      this.draftTxType() === CapitalTransactionType.Receipt
        ? this.draftTxAmount()
        : -this.draftTxAmount();
    return this.currentCapital() + delta;
  });

  protected readonly wouldOverdraw = computed(
    () =>
      this.draftTxType() === CapitalTransactionType.Payment &&
      this.projectedCapital() < 0,
  );

  /** Capitalising more than the available profit is rejected by the backend. */
  protected readonly capExceedsAvailable = computed(
    () => this.draftCapAmount() > this.availableProfit() + 1e-9,
  );

  protected readonly remainingProfit = computed(() =>
    Math.max(0, this.availableProfit() - this.draftCapAmount()),
  );

  /** Portion of the draft capitalisation amount that actually lands in the shareholder's capital. */
  protected readonly capShareholderShare = computed(() => {
    const fraction = (100 - this.companyPercentage()) / 100;
    return this.draftCapAmount() * fraction;
  });

  /** Portion of the draft capitalisation amount that goes to the company's profits treasury. */
  protected readonly capCompanyShare = computed(() =>
    this.draftCapAmount() * (this.companyPercentage() / 100),
  );

  /** Projected capital balance after the capitalisation. */
  protected readonly projectedCapitalAfterCap = computed(() =>
    this.currentCapital() + this.capShareholderShare(),
  );

  // ── forms ──
  protected readonly txForm = this.fb.nonNullable.group({
    type: [CapitalTransactionType.Receipt, [Validators.required]],
    treasuryId: this.fb.control<number | null>(null, [Validators.required]),
    amount: [0, [Validators.required, Validators.min(0.01)]],
    date: [this.todayISO(), [Validators.required]],
    notes: [''],
  });

  protected readonly capForm = this.fb.nonNullable.group({
    profitsTreasuryId: this.fb.control<number | null>(null, [Validators.required]),
    amount: [0, [Validators.required, Validators.min(0.01)]],
    date: [this.todayISO(), [Validators.required]],
    notes: [''],
  });

  constructor() {
    effect(
      () => {
        const sh = this.shareholder();
        if (!this.open() || !sh) return;

        const isNewShareholder = sh.id !== this.lastOpenShId();
        this.lastOpenShId.set(sh.id);
        // Always reflect the fresh contributedAmount from the list endpoint
        this.liveCapital.set(sh.contributedAmount ?? 0);

        if (isNewShareholder) {
          this.resetState(sh);
          this.loadPreview();
          this.loadTreasuries();
          this.fetchTransactions(sh.id, true);
        }
      },
      { allowSignalWrites: true },
    );
  }

  // ─────────── template handlers ───────────

  protected setMode(mode: CapitalMode): void {
    if (this.submitting()) return;
    this.serverError.set(null);
    this.mode.set(mode);
  }

  protected onTxTypeChange(value: string): void {
    this.draftTxType.set(value as CapitalTransactionType);
  }

  protected onTxAmountChange(value: string): void {
    this.draftTxAmount.set(Number(value) || 0);
  }

  protected onCapAmountChange(value: string): void {
    this.draftCapAmount.set(Number(value) || 0);
  }

  /** Pre-fills the capitalise field with the full available profit. */
  protected useFullProfit(): void {
    const amount = Number(this.availableProfit().toFixed(2));
    this.capForm.controls.amount.setValue(amount);
    this.draftCapAmount.set(amount);
  }

  protected submitTx(): void {
    if (this.submitting()) return;
    const sh = this.shareholder();
    if (!sh) return;
    if (this.txForm.invalid) {
      this.txForm.markAllAsTouched();
      return;
    }

    const raw = this.txForm.getRawValue();
    this.serverError.set(null);
    this.submitting.set(true);

    this.service
      .createCapitalTransaction(sh.id, {
        type: raw.type,
        amount: Number(raw.amount) || 0,
        treasuryId: Number(raw.treasuryId),
        date: raw.date,
        notes: (raw.notes ?? '').trim(),
      })
      .subscribe({
        next: () => {
          const deposit = raw.type === CapitalTransactionType.Receipt;
          this.afterWrite(
            sh.id,
            deposit ? 'تم إيداع رأس المال بنجاح' : 'تم سحب رأس المال بنجاح',
          );
          this.txForm.controls.amount.setValue(0);
          this.draftTxAmount.set(0);
        },
        error: (err: ApiError) => {
          this.submitting.set(false);
          this.serverError.set(err.message || 'تعذّر تنفيذ حركة رأس المال');
        },
      });
  }

  protected submitCap(): void {
    if (this.submitting()) return;
    const sh = this.shareholder();
    if (!sh) return;
    if (this.capForm.invalid || this.capExceedsAvailable()) {
      this.capForm.markAllAsTouched();
      return;
    }

    const raw = this.capForm.getRawValue();
    const profitsTreasuryId = Number(raw.profitsTreasuryId);
    if (!profitsTreasuryId) return;
    this.serverError.set(null);
    this.submitting.set(true);

    this.service
      .capitalizeProfit(sh.id, {
        profitsTreasuryId,
        amount: Number(raw.amount) || 0,
        date: raw.date,
        notes: (raw.notes ?? '').trim(),
      })
      .subscribe({
        next: () => {
          this.afterWrite(sh.id, 'تم ترحيل الأرباح إلى رأس المال بنجاح');
          this.capForm.controls.amount.setValue(0);
          this.draftCapAmount.set(0);
          // Available profit shrank — refresh the live preview.
          this.loadPreview();
        },
        error: (err: ApiError) => {
          this.submitting.set(false);
          this.serverError.set(err.message || 'تعذّر ترحيل الأرباح');
        },
      });
  }

  protected close(): void {
    if (this.submitting()) return;
    this.closed.emit();
  }

  protected onPageChange(page: number): void {
    this.pageIndex.set(page);
    const sh = this.shareholder();
    if (sh) this.fetchTransactions(sh.id, false);
  }

  protected onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    if (this.pageIndex() !== 1) this.pageIndex.set(1);
    const sh = this.shareholder();
    if (sh) this.fetchTransactions(sh.id, false);
  }

  protected isTxInvalid(field: keyof typeof this.txForm.controls): boolean {
    const ctrl = this.txForm.controls[field];
    return ctrl.invalid && (ctrl.dirty || ctrl.touched);
  }

  protected isCapInvalid(field: keyof typeof this.capForm.controls): boolean {
    const ctrl = this.capForm.controls[field];
    return ctrl.invalid && (ctrl.dirty || ctrl.touched);
  }

  protected directionLabel(direction: CapitalTransactionDirection): string {
    return CAPITAL_TX_DIRECTION_LABELS[direction] ?? direction;
  }

  protected directionBadge(direction: CapitalTransactionDirection) {
    return CAPITAL_TX_DIRECTION_BADGE[direction] ?? 'info';
  }

  protected isInflow(direction: CapitalTransactionDirection): boolean {
    return isCapitalInflow(direction);
  }

  protected shortVoucher(value: string | undefined): string {
    if (!value) return '—';
    return value.length > VOUCHER_PREFIX_LEN
      ? `${value.slice(0, VOUCHER_PREFIX_LEN)}…`
      : value;
  }

  protected copyVoucher(value: string | undefined): void {
    if (!value) return;
    const clipboard = navigator.clipboard;
    if (clipboard?.writeText) {
      clipboard.writeText(value).then(
        () => this.toast.success('تم نسخ رقم السند'),
        () => this.toast.error('تعذّر النسخ'),
      );
    } else {
      this.toast.error('النسخ غير مدعوم في هذا المتصفح');
    }
  }

  // ─────────── internals ───────────

  /** Shared success path for both write forms. */
  private afterWrite(shareholderId: number, message: string): void {
    this.submitting.set(false);
    this.toast.success(message);
    this.pageIndex.set(1);
    this.fetchTransactions(shareholderId, true);
    this.changed.emit();
  }

  private resetState(_sh: Shareholder): void {
    this.mode.set('transaction');
    this.submitting.set(false);
    this.serverError.set(null);
    this.preview.set(null);
    this.draftTxType.set(CapitalTransactionType.Receipt);
    this.draftTxAmount.set(0);
    this.draftCapAmount.set(0);
    this.pageIndex.set(1);
    this.txForm.reset({
      type: CapitalTransactionType.Receipt,
      treasuryId: null,
      amount: 0,
      date: this.todayISO(),
      notes: '',
    });
    this.capForm.reset({ profitsTreasuryId: null, amount: 0, date: this.todayISO(), notes: '' });
  }

  private loadPreview(): void {
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

  private loadTreasuries(): void {
    this.treasuriesLoading.set(true);
    this.treasuryService.list().subscribe({
      next: (list) => {
        this.treasuries.set(list ?? []);
        this.treasuriesLoading.set(false);
      },
      error: () => {
        this.treasuries.set([]);
        this.treasuriesLoading.set(false);
      },
    });
  }

  private fetchTransactions(shareholderId: number, force: boolean): void {
    this.txLoading.set(true);
    const query = { pageIndex: this.pageIndex(), pageSize: this.pageSize() };
    const stream$ = force
      ? this.service.refreshCapitalTransactions(shareholderId, query)
      : this.service.listCapitalTransactions(shareholderId, query);

    stream$.subscribe({
      next: (page) => {
        const rows = page?.data ?? [];
        this.transactions.set(rows);
        this.count.set(page?.count ?? 0);
        this.totalPages.set(page?.totalPages ?? 0);
        this.txLoading.set(false);
      },
      error: (err: ApiError) => {
        this.transactions.set([]);
        this.count.set(0);
        this.totalPages.set(0);
        this.txLoading.set(false);
        this.toast.error(err?.message || 'تعذّر تحميل حركات رأس المال');
      },
    });
  }

  private todayISO(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
