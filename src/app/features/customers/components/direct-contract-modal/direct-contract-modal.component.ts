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
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize, switchMap } from 'rxjs/operators';

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
import { Representative } from '../../../reps/models/rep.model';
import {
  ContractSlipsPrintService,
  ContractSlipData,
} from '../../../../core/services/contract-slips-print.service';

import {
  ContractPaymentFrequency,
  CreatedDirectContract,
  CreateDirectContractPayload,
  DirectContractItemPayload,
} from '../../../contracts/models/contract.model';
import { CreatedClient, DashboardClient } from '../../models/dashboard-client.model';

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
  private readonly slipsPrint = inject(ContractSlipsPrintService);

  // ── state ──
  protected readonly submitting = signal(false);
  protected readonly loadingLookups = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly lookupsLoaded = signal(false);
  protected readonly pendingPrintData = signal<ContractSlipData | null>(null);

  // ── lookup data ──
  protected readonly clients = signal<DashboardClient[]>([]);
  protected readonly treasuries = signal<LookupItem[]>([]);
  /** Full representative objects so we can access phoneNumber for the slip. */
  protected readonly representatives = signal<Representative[]>([]);

  // ── payment frequency options ──
  protected readonly frequencies: { value: ContractPaymentFrequency; label: string }[] = [
    { value: 'Quarterly', label: 'ربع سنوي' },
    { value: 'SemiAnnual', label: 'نصف سنوي' },
    { value: 'Annual', label: 'سنوي' },
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
    this.representatives().map((r) => ({ value: r.id, label: r.fullName, hint: r.phoneNumber })),
  );

  // ── form ──
  protected readonly form = this.fb.nonNullable.group({
    clientId:             this.fb.control<number | null>(null, [Validators.required]),
    items:                this.fb.array([this.createItemGroup()]),
    dateOfSale:           [this.todayStr(), [Validators.required]],
    cashPrice:            [0, [Validators.required, Validators.min(1)]],
    downPayment:          [0, [Validators.required, Validators.min(0)]],
    profitRate:           [{ value: 0, disabled: true }],
    installmentsCount:    [12, [Validators.required, Validators.min(1), Validators.max(120)]],
    installmentAmount:    [{ value: 0, disabled: true }, [Validators.required]],
    paymentFrequency:     ['Quarterly' as ContractPaymentFrequency, [Validators.required]],
    firstInstallmentDate: [this.nextMonthStr(), [Validators.required]],
    treasuryId:           this.fb.control<number | null>(null, [Validators.required]),
    representativeId:     this.fb.control<number | null>(null),
    notes:                [''],
  });

  get itemsArray(): FormArray { return this.form.get('items') as FormArray; }
  get itemGroups(): FormGroup[] { return this.itemsArray.controls as FormGroup[]; }

  // ── reactive summary ──
  private readonly values = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  protected readonly summary = computed(() => {
    const v = this.values();
    const cashPrice   = Number(v.cashPrice ?? 0);
    const downPayment = Number(v.downPayment ?? 0);
    const profitRate  = Number(v.profitRate ?? 0);
    const count       = Math.max(1, Number(v.installmentsCount ?? 1));
    const afterDown   = Math.max(0, cashPrice - downPayment);
    const profitAmount  = afterDown * (profitRate / 100);
    const totalAmount   = afterDown + profitAmount;
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

  // ─────────── items FormArray helpers ───────────

  protected createItemGroup(): FormGroup {
    return this.fb.nonNullable.group({
      productName:      ['', [Validators.required, Validators.maxLength(200)]],
      quantity:         [1,  [Validators.required, Validators.min(1)]],
      unitPurchasePrice:[0,  [Validators.required, Validators.min(0)]],
    });
  }

  protected addItem(): void {
    this.itemsArray.push(this.createItemGroup());
  }

  protected removeItem(index: number): void {
    if (this.itemsArray.length <= 1) return;
    this.itemsArray.removeAt(index);
  }

  protected itemCtrl(index: number, name: string): AbstractControl {
    return this.itemsArray.at(index).get(name)!;
  }

  protected isItemInvalid(index: number, name: string): boolean {
    const ctrl = this.itemCtrl(index, name);
    return ctrl.invalid && (ctrl.dirty || ctrl.touched);
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

    const validItems: DirectContractItemPayload[] = (raw.items ?? [])
      .filter((i) => (i['productName'] as string)?.trim() && Number(i['quantity']) >= 1)
      .map((i) => ({
        productName:       (i['productName'] as string).trim(),
        quantity:          Number(i['quantity']),
        unitPurchasePrice: Number(i['unitPurchasePrice'] ?? 0),
      }));

    if (validItems.length === 0) {
      this.toast.error('أضف منتجًا واحدًا على الأقل');
      return;
    }

    const payload: CreateDirectContractPayload = {
      clientId:             Number(raw.clientId),
      items:                validItems,
      dateOfSale:           new Date(raw.dateOfSale).toISOString(),
      cashPrice:            Number(raw.cashPrice),
      downPayment:          Number(raw.downPayment),
      profitRate:           Number(raw.profitRate),
      installmentsCount:    Number(raw.installmentsCount),
      installmentAmount:    Number(raw.installmentAmount),
      paymentFrequency:     raw.paymentFrequency as ContractPaymentFrequency,
      firstInstallmentDate: new Date(raw.firstInstallmentDate).toISOString(),
      treasuryId:           Number(raw.treasuryId),
      representativeId:     raw.representativeId ? Number(raw.representativeId) : undefined,
      notes:                raw.notes?.trim() || undefined,
    };

    this.serverError.set(null);
    this.submitting.set(true);

    this.contractsService
      .createDirect(payload)
      .pipe(
        switchMap((res) =>
          this.customersService
            .getClient(Number(raw.clientId))
            .pipe(
              catchError(() => of(null)),
              switchMap((fullClient) => {
                this.toast.success('تم إنشاء العقد المباشر بنجاح');
                const slipData = this.buildPrintData(raw, validItems, res, fullClient);
                this.pendingPrintData.set(slipData);
                this.created.emit(res);
                return of(null);
              }),
            ),
        ),
        finalize(() => this.submitting.set(false)),
      )
      .subscribe({
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
      clients:   this.customersService.listAllClients().pipe(catchError(() => of([] as DashboardClient[]))),
      treasuries:this.treasuryService.lookup().pipe(catchError(() => of([] as LookupItem[]))),
      reps:      this.repsService.list().pipe(catchError(() => of({ data: [] as Representative[], pageIndex: 1, pageSize: 100, count: 0, totalPages: 0 }))),
    })
      .pipe(finalize(() => this.loadingLookups.set(false)))
      .subscribe({
        next: (res) => {
          this.clients.set(res.clients);
          this.treasuries.set(res.treasuries);
          this.representatives.set(res.reps?.data ?? []);
          this.lookupsLoaded.set(true);
        },
        error: () => {
          this.toast.error('حدث خطأ أثناء تحميل البيانات');
        },
      });
  }

  private recalculateInstallment(): void {
    const cashPrice   = Number(this.form.get('cashPrice')?.value ?? 0);
    const downPayment = Number(this.form.get('downPayment')?.value ?? 0);
    const profitRate  = Number(this.form.get('profitRate')?.value ?? 0);
    const count       = Math.max(1, Number(this.form.get('installmentsCount')?.value ?? 1));
    const remaining   = cashPrice - downPayment;
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
    this.itemsArray.clear({ emitEvent: false });
    this.itemsArray.push(this.createItemGroup(), { emitEvent: false });

    this.form.reset({
      clientId:             null,
      dateOfSale:           this.todayStr(),
      cashPrice:            0,
      downPayment:          0,
      profitRate:           0,
      installmentsCount:    12,
      installmentAmount:    0,
      paymentFrequency:     'Quarterly',
      firstInstallmentDate: this.nextMonthStr(),
      treasuryId:           null,
      representativeId:     null,
      notes:                '',
    });
    this.serverError.set(null);
  }

  protected printAndClose(): void {
    const data = this.pendingPrintData();
    if (data) this.slipsPrint.printSlips(data);
    this.pendingPrintData.set(null);
    this.resetForm();
    this.closed.emit();
  }

  protected skipPrintAndClose(): void {
    this.pendingPrintData.set(null);
    this.resetForm();
    this.closed.emit();
  }

  private buildPrintData(
    raw: ReturnType<typeof this.form.getRawValue>,
    items: DirectContractItemPayload[],
    res: CreatedDirectContract,
    fullClient: CreatedClient | null,
  ): ContractSlipData {
    const listClient  = this.clients().find((c) => c.id === Number(raw.clientId));
    const selectedRep = this.representatives().find((r) => r.id === Number(raw.representativeId));

    const cashPrice      = Number(raw.cashPrice);
    const downPayment    = Number(raw.downPayment);
    const profitRate     = Number(raw.profitRate);
    const count          = Number(raw.installmentsCount);
    const afterDown      = Math.max(0, cashPrice - downPayment);
    const totalAmount    = afterDown * (1 + profitRate / 100);
    const installmentAmt = Number(raw.installmentAmount);

    return {
      contractId:           res.id,
      dateOfSale:           raw.dateOfSale,
      clientName:           fullClient?.fullName    ?? listClient?.fullName    ?? '',
      clientPhone:          fullClient?.phoneNumber ?? listClient?.phoneNumber ?? '',
      clientCode:           fullClient?.clientCode  ?? null,
      clientAddress:        fullClient?.address     ?? listClient?.address     ?? null,
      clientRegion:         fullClient?.region      ?? null,
      clientOccupation:     fullClient?.occupation  ?? null,
      repName:              selectedRep?.fullName   ?? null,
      repPhone:             selectedRep?.phoneNumber ?? null,
      productLines:         items.map((i) => ({ name: i.productName, quantity: i.quantity })),
      totalAmount:          Math.round(totalAmount),
      downPayment,
      installmentAmount:    installmentAmt,
      installmentsCount:    count,
      firstInstallmentDate: raw.firstInstallmentDate,
      paymentFrequency:     raw.paymentFrequency,
      notes:                raw.notes?.trim() || null,
    };
  }

  private firstInvalidLabel(): string | null {
    const labels: Record<string, string> = {
      clientId:             'العميل',
      dateOfSale:           'تاريخ البيع',
      cashPrice:            'سعر البيع الكاش',
      profitRate:           'نسبة الربح',
      installmentsCount:    'عدد الأقساط',
      paymentFrequency:     'طريقة التقسيط',
      firstInstallmentDate: 'تاريخ أول قسط',
      treasuryId:           'الخزينة',
    };
    for (const [key, label] of Object.entries(labels)) {
      if (this.form.get(key)?.invalid) return `يرجى مراجعة الحقل: ${label}`;
    }
    for (let i = 0; i < this.itemsArray.length; i++) {
      if (this.itemCtrl(i, 'productName').invalid) return `يرجى إدخال اسم المنتج في الصنف رقم ${i + 1}`;
      if (this.itemCtrl(i, 'quantity').invalid)    return `يرجى إدخال كمية صحيحة في الصنف رقم ${i + 1}`;
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
