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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';

import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { FormErrorComponent } from '../../../../shared/components/form-error/form-error.component';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../../../shared/components/searchable-select/searchable-select.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { ApiError } from '../../../../core/models/api-response.model';
import { ToastService } from '../../../../core/services/toast.service';
import { LookupItem } from '../../../../core/models/lookup.model';

import { ContractsService } from '../../../contracts/services/contracts.service';
import { CustomersService } from '../../services/customers.service';
import { TreasuryService } from '../../../treasury/services/treasury.service';
import { RepsService } from '../../../reps/services/reps.service';

import {
  ContractPaymentFrequency,
  CreatedDirectContract,
  CreateDirectContractPayload,
} from '../../../contracts/models/contract.model';
import { DashboardClient } from '../../models/dashboard-client.model';

@Component({
  selector: 'app-direct-contract-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ModalComponent,
    FormErrorComponent,
    SearchableSelectComponent,
    CurrencyArPipe,
  ],
  templateUrl: './direct-contract-modal.component.html',
  styleUrl: './direct-contract-modal.component.scss',
})
export class DirectContractModalComponent {
  // ── inputs ──
  readonly open = input.required<boolean>();

  // ── outputs ──
  readonly closed = output<void>();
  readonly created = output<CreatedDirectContract>();

  // ── deps ──
  private readonly fb = inject(FormBuilder);
  private readonly contractsService = inject(ContractsService);
  private readonly customersService = inject(CustomersService);
  private readonly treasuryService = inject(TreasuryService);
  private readonly repsService = inject(RepsService);
  private readonly toast = inject(ToastService);

  // ── state ──
  protected readonly submitting = signal(false);
  protected readonly loadingLookups = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly lookupsLoaded = signal(false);

  // ── lookup data ──
  protected readonly clients = signal<DashboardClient[]>([]);
  protected readonly treasuries = signal<LookupItem[]>([]);
  protected readonly representatives = signal<LookupItem[]>([]);

  // ── payment frequency options ──
  protected readonly frequencies: { value: ContractPaymentFrequency; label: string }[] = [
    { value: 'Monthly', label: 'شهري' },
    { value: 'Quarterly', label: 'ربع سنوي' },
    { value: 'SemiAnnual', label: 'نصف سنوي' },
  ];

  // ── derived options ──
  protected readonly clientOptions = computed<SearchableSelectOption[]>(() =>
    this.clients().map((c) => ({
      value: c.id,
      label: c.fullName,
      hint: c.phoneNumber,
    })),
  );

  protected readonly treasuryOptions = computed<SearchableSelectOption[]>(() =>
    this.treasuries().map((t) => ({ value: t.id, label: t.name })),
  );

  protected readonly representativeOptions = computed<SearchableSelectOption[]>(() =>
    this.representatives().map((r) => ({ value: r.id, label: r.name })),
  );

  // ── form ──
  protected readonly form = this.fb.nonNullable.group({
    clientId: this.fb.control<number | null>(null, [Validators.required]),
    productName: ['', [Validators.required, Validators.maxLength(200)]],
    quantity: [1, [Validators.required, Validators.min(1)]],
    dateOfSale: [this.todayStr(), [Validators.required]],
    purchasePrice: [0, [Validators.required, Validators.min(0)]],
    cashPrice: [0, [Validators.required, Validators.min(1)]],
    downPayment: [0, [Validators.required, Validators.min(0)]],
    profitRate: [20, [Validators.required, Validators.min(0), Validators.max(100)]],
    installmentsCount: [12, [Validators.required, Validators.min(1), Validators.max(120)]],
    installmentAmount: [{ value: 0, disabled: true }, [Validators.required]],
    paymentFrequency: ['Monthly' as ContractPaymentFrequency, [Validators.required]],
    firstInstallmentDate: [this.nextMonthStr(), [Validators.required]],
    treasuryId: this.fb.control<number | null>(null, [Validators.required]),
    representativeId: this.fb.control<number | null>(null),
    notes: [''],
  });

  // ── reactive summary ──
  private readonly values = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  protected readonly summary = computed(() => {
    const v = this.values();
    const cashPrice = Number(v.cashPrice ?? 0) * Number(v.quantity ?? 1);
    const downPayment = Number(v.downPayment ?? 0);
    const profitRate = Number(v.profitRate ?? 0);
    const count = Math.max(1, Number(v.installmentsCount ?? 1));
    const afterDown = Math.max(0, cashPrice - downPayment);
    const profitAmount = afterDown * (profitRate / 100);
    const totalAmount = afterDown + profitAmount;
    const installmentAmt = totalAmount / count;
    return { cashPrice, downPayment, afterDown, profitAmount, totalAmount, installmentAmt, count };
  });

  constructor() {
    // Load lookups once when modal first opens
    effect(
      () => {
        if (!this.open()) return;
        if (this.lookupsLoaded()) return;
        this.loadLookups();
      },
      { allowSignalWrites: true },
    );

    // Recalculate installment amount whenever form values change
    this.form.valueChanges.subscribe(() => this.recalculateInstallment());
  }

  // ─────────── template handlers ───────────

  protected onSubmit(): void {
    if (this.submitting()) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error(this.firstInvalidLabel() ?? 'يرجى تعبئة الحقول المطلوبة');
      return;
    }

    const raw = this.form.getRawValue();

    const payload: CreateDirectContractPayload = {
      clientId: Number(raw.clientId),
      productName: raw.productName.trim(),
      quantity: Number(raw.quantity),
      dateOfSale: new Date(raw.dateOfSale).toISOString(),
      purchasePrice: Number(raw.purchasePrice),
      cashPrice: Number(raw.cashPrice),
      downPayment: Number(raw.downPayment),
      profitRate: Number(raw.profitRate),
      installmentsCount: Number(raw.installmentsCount),
      installmentAmount: Number(raw.installmentAmount),
      paymentFrequency: raw.paymentFrequency as ContractPaymentFrequency,
      firstInstallmentDate: new Date(raw.firstInstallmentDate).toISOString(),
      treasuryId: Number(raw.treasuryId),
      representativeId: raw.representativeId ? Number(raw.representativeId) : undefined,
      notes: raw.notes?.trim() || undefined,
    };

    this.serverError.set(null);
    this.submitting.set(true);

    this.contractsService
      .createDirect(payload)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: (res) => {
          this.toast.success('تم إنشاء العقد المباشر بنجاح');
          this.resetForm();
          this.created.emit(res);
        },
        error: (err: ApiError) => {
          this.serverError.set(err.message || 'تعذّر إنشاء العقد');
        },
      });
  }

  protected close(): void {
    if (this.submitting()) return;
    this.closed.emit();
  }

  protected isInvalid(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!ctrl && ctrl.invalid && (ctrl.dirty || ctrl.touched);
  }

  // ─────────── internals ───────────

  private loadLookups(): void {
    this.loadingLookups.set(true);

    forkJoin({
      clients: this.customersService
        .listAllClients()
        .pipe(catchError(() => of([] as DashboardClient[]))),
      treasuries: this.treasuryService
        .lookup()
        .pipe(catchError(() => of([] as LookupItem[]))),
      reps: this.repsService
        .lookup()
        .pipe(catchError(() => of([] as LookupItem[]))),
    })
      .pipe(finalize(() => this.loadingLookups.set(false)))
      .subscribe({
        next: (res) => {
          this.clients.set(res.clients);
          this.treasuries.set(res.treasuries);
          this.representatives.set(res.reps);
          this.lookupsLoaded.set(true);
        },
        error: () => {
          this.toast.error('حدث خطأ أثناء تحميل البيانات');
        },
      });
  }

  private recalculateInstallment(): void {
    const cashPrice = Number(this.form.get('cashPrice')?.value ?? 0) * Number(this.form.get('quantity')?.value ?? 1);
    const downPayment = Number(this.form.get('downPayment')?.value ?? 0);
    const profitRate = Number(this.form.get('profitRate')?.value ?? 0);
    const count = Math.max(1, Number(this.form.get('installmentsCount')?.value ?? 1));
    const remaining = cashPrice - downPayment;
    if (remaining <= 0) {
      this.form.get('installmentAmount')?.setValue(0, { emitEvent: false });
      return;
    }
    const totalWithProfit = remaining * (1 + profitRate / 100);
    this.form.get('installmentAmount')?.setValue(
      Number((totalWithProfit / count).toFixed(2)),
      { emitEvent: false },
    );
  }

  private resetForm(): void {
    this.form.reset({
      clientId: null,
      productName: '',
      quantity: 1,
      dateOfSale: this.todayStr(),
      purchasePrice: 0,
      cashPrice: 0,
      downPayment: 0,
      profitRate: 20,
      installmentsCount: 12,
      installmentAmount: 0,
      paymentFrequency: 'Monthly',
      firstInstallmentDate: this.nextMonthStr(),
      treasuryId: null,
      representativeId: null,
      notes: '',
    });
    this.serverError.set(null);
  }

  private firstInvalidLabel(): string | null {
    const labels: Record<string, string> = {
      clientId: 'العميل',
      productName: 'اسم المنتج',
      quantity: 'الكمية',
      dateOfSale: 'تاريخ البيع',
      cashPrice: 'سعر البيع الكاش',
      profitRate: 'نسبة الربح',
      installmentsCount: 'عدد الأقساط',
      paymentFrequency: 'طريقة التقسيط',
      firstInstallmentDate: 'تاريخ أول قسط',
      treasuryId: 'الخزينة',
    };
    for (const [key, label] of Object.entries(labels)) {
      if (this.form.get(key)?.invalid) return `يرجى مراجعة الحقل: ${label}`;
    }
    return null;
  }

  private todayStr(): string {
    return new Date().toISOString().split('T')[0];
  }

  private nextMonthStr(): string {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().split('T')[0];
  }
}
