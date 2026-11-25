import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { forkJoin, finalize, of, catchError, switchMap } from 'rxjs';

import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { ToastService } from '../../../../core/services/toast.service';
import { FormErrorComponent } from '../../../../shared/components/form-error/form-error.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../../../shared/components/searchable-select/searchable-select.component';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import {
  ContractSlipsPrintService,
  ContractSlipData,
} from '../../../../core/services/contract-slips-print.service';

import { ContractsService } from '../../../contracts/services/contracts.service';
import { CustomersService } from '../../services/customers.service';
import { ProductsService } from '../../../products/services/products.service';
import { WarehouseService } from '../../../warehouse/services/warehouse.service';
import { TreasuryService } from '../../../treasury/services/treasury.service';
import { RepsService } from '../../../reps/services/reps.service';
import { RepresentativeOption } from '../../../reps/models/rep.model';
import { AccessService } from '../../../../core/services/access.service';

import {
  ContractFormState,
  ContractItemFormState,
  ContractPaymentFrequency,
  CreatedContract,
  UpdateContractFormState,
} from '../../../contracts/models/contract.model';
import { ContractDetails } from '../../models/client-statement.model';
import { InstallmentTier } from '../../../contracts/models/installment-tier.model';
import {
  createInstallmentTiersArray,
  InstallmentTiersFormController,
} from '../../../contracts/forms/installment-tiers.form';
import {
  normalizeTiers,
  summarizeTiers,
  tiersFromSchedule,
} from '../../../contracts/utils/installment-tiers.util';
import { InstallmentTiersEditorComponent } from '../../../contracts/components/installment-tiers-editor/installment-tiers-editor.component';
import { InstallmentPlanLabelPipe } from '../../../contracts/pipes/installment-plan-label.pipe';
import { Product } from '../../../products/models/product.model';

import { CreatedClient, DashboardClient } from '../../models/dashboard-client.model';
import { LookupItem } from '../../../../core/models/lookup.model';

@Component({
  selector: 'app-contract-new',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CurrencyArPipe,
    FormErrorComponent,
    LoaderComponent,
    SearchableSelectComponent,
    InstallmentTiersEditorComponent,
    InstallmentPlanLabelPipe,
  ],
  templateUrl: './contract-new.component.html',
  styleUrl: './contract-new.component.scss',
})
export class ContractNewComponent implements OnInit {
  // ───────────────── deps ─────────────────
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly contractsService = inject(ContractsService);
  private readonly customersService = inject(CustomersService);
  private readonly productsService = inject(ProductsService);
  private readonly warehouseService = inject(WarehouseService);
  private readonly treasuryService = inject(TreasuryService);
  private readonly repsService = inject(RepsService);
  private readonly access = inject(AccessService);

  private readonly toast = inject(ToastService);
  private readonly slipsPrint = inject(ContractSlipsPrintService);

  // ───────────────── edit mode ─────────────────
  protected readonly editId = signal<number | null>(null);
  protected readonly isEditMode = computed(() => this.editId() !== null);
  /** Original purchase price shown read-only in edit mode. */
  protected readonly purchasePrice = signal(0);
  /** Prevents product price auto-fill from overwriting prefilled cashPrice. */
  private prefilling = false;

  // ───────────────── UI state ─────────────────
  protected readonly loading = signal(true);
  protected readonly isSaving = signal(false);
  /** Holds print data after a successful save so the user can trigger printing. */
  protected readonly pendingPrintData = signal<ContractSlipData | null>(null);

  // ───────────────── lookup data ─────────────────
  protected readonly clients = signal<DashboardClient[]>([]);
  protected readonly products = signal<LookupItem[]>([]);
  protected readonly warehouses = signal<LookupItem[]>([]);
  protected readonly treasuries = signal<LookupItem[]>([]);
  protected readonly representatives = signal<RepresentativeOption[]>([]);

  /** Client list shaped for the searchable select (name + phone search). */
  protected readonly clientOptions = computed<SearchableSelectOption[]>(() =>
    this.clients().map((c) => ({
      value: c.id,
      label: c.fullName,
      hint: c.phoneNumber,
    })),
  );

  /** `{id,name}` lookups → searchable-select options (shared shape). */
  protected readonly productOptions = computed<SearchableSelectOption[]>(() =>
    this.toOptions(this.products()),
  );
  protected readonly warehouseOptions = computed<SearchableSelectOption[]>(() =>
    this.toOptions(this.warehouses()),
  );
  protected readonly treasuryOptions = computed<SearchableSelectOption[]>(() =>
    this.toOptions(this.treasuries()),
  );
  protected readonly representativeOptions = computed<SearchableSelectOption[]>(() =>
    this.representatives().map((r) => ({ value: r.id, label: r.name, hint: r.phoneNumber ?? undefined })),
  );

  private toOptions(items: LookupItem[]): SearchableSelectOption[] {
    return items.map((i) => ({ value: i.id, label: i.name }));
  }

  // ───────────────── payment frequencies ─────────────────
  protected readonly frequencies: {
    value: ContractPaymentFrequency;
    label: string;
  }[] = [
    { value: 'Quarterly', label: 'ربع سنوي' },
    { value: 'SemiAnnual', label: 'نصف سنوي' },
    { value: 'Annual', label: 'سنوي' },
  ];

  // ───────────────── form ─────────────────
  protected readonly form = this.fb.nonNullable.group({
    clientId: [null as number | null, [Validators.required]],

    items: this.fb.array([this.createItemGroup()]),

    dateOfSale: [this.todayStr(), [Validators.required]],

    cashPrice: [0, [Validators.required, Validators.min(1)]],

    downPayment: [0, [Validators.required, Validators.min(0)]],

    profitRate: [
      20,
      [Validators.required, Validators.min(0), Validators.max(100)],
    ],

    installmentsCount: [
      12,
      [Validators.required, Validators.min(1), Validators.max(120)],
    ],

    installmentAmount: [{ value: 0, disabled: true }, [Validators.required]],

    paymentFrequency: [
      'Annual' as ContractPaymentFrequency,
      [Validators.required],
    ],

    firstInstallmentDate: [this.nextMonthStr(this.todayStr()), [Validators.required]],

    treasuryId: [null as number | null, [Validators.required]],

    representativeId: [null as number | null],

    notes: [''],

    code: [''],

    adjustLastInstallmentForRemainder: [false],

    totalContractAmount: [{ value: 0, disabled: true }],

    isDownPaymentPaid: [true],

    /** "تقسيط على أكثر من مبلغ" toggle — off keeps the old equal-installments flow. */
    useInstallmentTiers: [false],

    /** Tier rows — disabled (and ignored by validity) while the toggle is off. */
    installmentTiers: createInstallmentTiersArray(),

    /** UI-only: total the operator expects, to reconcile tiers against. Never sent. */
    expectedTotal: [0, [Validators.min(0)]],
  });

  /** Drives the tiered-installments toggle (shared with the direct-contract modal). */
  protected readonly tiers = new InstallmentTiersFormController(
    {
      enabled: this.form.controls.useInstallmentTiers,
      tiers: this.form.controls.installmentTiers,
      installmentsCount: this.form.controls.installmentsCount,
      installmentAmount: this.form.controls.installmentAmount,
      adjustLastInstallment: this.form.controls.adjustLastInstallmentForRemainder,
    },
    inject(DestroyRef),
  );

  get itemsArray(): FormArray {
    return this.form.get('items') as FormArray;
  }

  get itemGroups(): FormGroup[] {
    return this.itemsArray.controls as FormGroup[];
  }

  // ───────────────── reactive values ─────────────────
  private readonly values = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  // ───────────────── computed summary ─────────────────
  protected readonly summary = computed(() => {
    const v = this.values();

    const unitPrice   = Number(v.cashPrice ?? 0);
    const downPayment = Number(v.downPayment ?? 0);
    const profitRate  = Number(v.profitRate ?? 0);
    const count       = Math.max(1, Number(v.installmentsCount ?? 1));
    const totalQty    = (v.items ?? []).reduce(
      (sum, item) => sum + (Number((item as ContractItemFormState).quantity) || 0),
      0,
    );

    const cashPrice    = unitPrice * Math.max(1, totalQty);
    const afterDown    = Math.max(0, cashPrice - downPayment);
    const profitAmount = afterDown * (profitRate / 100);
    const totalAmount  = afterDown + profitAmount;
    const installmentAmt = totalAmount / count;

    // Preview only — mirrors the server's remainder formula so the user can
    // see roughly what the last installment will be. The server computes
    // and persists the authoritative value; this is not sent in the payload.
    // In manual mode `v.installmentAmount` holds the user-entered amount
    // (the control is enabled, so it's included in valueChanges); otherwise
    // fall back to the auto-computed even-division amount.
    // IMPORTANT: the remainder is derived from `totalContractAmount` (the
    // real total the client pays), never from `cashPrice` — they are
    // independent figures and cashPrice has no bearing on this calculation.
    const totalContractAmount = Number(v.totalContractAmount ?? 0);
    const manualInstallmentAmt = Number(v.installmentAmount ?? installmentAmt) || installmentAmt;
    const lastInstallmentPreview =
      totalContractAmount - downPayment - (count - 1) * manualInstallmentAmt;

    return {
      unitPrice,
      cashPrice,
      downPayment,
      afterDown,
      profitRate,
      profitAmount,
      totalAmount,
      installmentAmt,
      totalContractAmount,
      lastInstallmentPreview,
      count,
      totalQty,
    };
  });

  /** First due date for the tiers schedule preview. */
  protected readonly firstInstallmentDate = computed(
    () => this.values().firstInstallmentDate ?? '',
  );

  /** Tiered plan + its totals while the toggle is on; `null` otherwise. */
  protected readonly tierPlan = computed(() => {
    const v = this.values();
    if (!v.useInstallmentTiers) return null;
    const tiers = normalizeTiers(v.installmentTiers ?? []);
    return {
      tiers,
      summary: summarizeTiers(tiers, Number(v.downPayment) || 0, null),
    };
  });

  // ───────────────── lifecycle ─────────────────
  ngOnInit(): void {
    const idParam = Number(this.route.snapshot.queryParamMap.get('editId'));
    if (idParam) this.editId.set(idParam);
    this.loadLookups();
    this.setupFormEffects();
  }

  private loadLookups(): void {
    this.loading.set(true);
    const id = this.editId();

    forkJoin({
      clients: this.customersService
        .listAllClients()
        .pipe(catchError(() => of([] as DashboardClient[]))),
      products: this.productsService
        .lookup()
        .pipe(catchError(() => of([] as LookupItem[]))),
      warehouses: this.warehouseService
        .lookup()
        .pipe(catchError(() => of([] as LookupItem[]))),
      treasuries: this.treasuryService
        .lookup()
        .pipe(catchError(() => of([] as LookupItem[]))),
      reps: this.repsService
        .pickerOptions()
        .pipe(catchError(() => of([] as RepresentativeOption[]))),
      details: id
        ? this.contractsService
            .getDetails(id)
            .pipe(catchError(() => of(null as ContractDetails | null)))
        : of(null as ContractDetails | null),
    })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (res) => {
          this.clients.set(res.clients);
          this.products.set(res.products);
          this.warehouses.set(res.warehouses);
          this.treasuries.set(res.treasuries);
          this.representatives.set(res.reps);
          if (res.details) this.prefillFromDetails(res.details);
        },
        error: () => {
          this.toast.error('حدث خطأ أثناء تحميل البيانات');
        },
      });
  }

  private prefillFromDetails(d: ContractDetails): void {
    this.purchasePrice.set(d.contract.purchasePrice);
    this.prefilling = true;

    // Populate items from the contract's items array.
    // Direct-contract items have productId === null and cannot be pre-filled.
    const itemsArray = this.itemsArray;
    itemsArray.clear({ emitEvent: false });
    const fillable = (d.contract.items ?? []).filter(
      (item) => item.productId !== null && item.warehouseId !== null,
    );
    if (fillable.length > 0) {
      for (const item of fillable) {
        itemsArray.push(
          this.createItemGroup({
            productId: item.productId!,
            warehouseId: item.warehouseId!,
            quantity: item.quantity,
          }),
          { emitEvent: false },
        );
      }
    } else {
      itemsArray.push(this.createItemGroup(), { emitEvent: false });
    }

    // Normalize legacy frequencies no longer supported by the create/update form.
    // Monthly contracts that predate the quarterly-minimum policy default to Quarterly.
    const validFreqs: ContractPaymentFrequency[] = ['Quarterly', 'SemiAnnual', 'Annual'];
    const rawFreq = d.contract.paymentFrequency as ContractPaymentFrequency;
    const paymentFrequency: ContractPaymentFrequency = validFreqs.includes(rawFreq)
      ? rawFreq
      : 'Quarterly';

    this.form.patchValue({
      clientId: d.client.id,
      dateOfSale: d.contract.dateOfSale.split('T')[0],
      cashPrice: d.contract.cashPrice,
      downPayment: d.contract.downPayment,
      profitRate: d.contract.profitRate,
      installmentsCount: d.contract.installmentsCount,
      paymentFrequency,
      firstInstallmentDate: d.contract.firstInstallmentDate.split('T')[0],
      representativeId: d.representative?.id ?? null,
      notes: d.contract.notes ?? '',
      code: d.contract.code ?? '',
      isDownPaymentPaid: d.contract.isDownPaymentPaid ?? true,
    });

    this.prefilling = false;
    this.syncTreasuryRequirement();
    this.form
      .get('installmentAmount')
      ?.setValue(d.contract.installmentAmount, { emitEvent: false });
    // Prefill the authoritative contract total from the server so re-saving
    // without touching the checkbox keeps the correct figure. If the operator
    // needs to change it, they must re-enable "ضبط القسط الأخير تلقائيًا".
    this.form
      .get('totalContractAmount')
      ?.setValue(d.summary.totalContractAmount, { emitEvent: false });

    // Rebuild the plan from the real schedule: unequal amounts → tiered mode
    // with consecutive equal amounts grouped (legacy "adjusted last
    // installment" contracts come back as e.g. {9×1000},{1×700} — re-saving
    // them reproduces the exact same installments).
    this.form.controls.expectedTotal.setValue(d.summary.totalContractAmount, { emitEvent: false });
    this.tiers.load(tiersFromSchedule(d.installments, (i) => i.dueAmount));
  }

  // ───────────────── items management ─────────────────

  private createItemGroup(defaults?: {
    productId?: number;
    warehouseId?: number;
    quantity?: number;
  }): FormGroup {
    return this.fb.group({
      productId: [
        defaults?.productId ?? (null as number | null),
        [Validators.required],
      ],
      warehouseId: [
        defaults?.warehouseId ?? (null as number | null),
        [Validators.required],
      ],
      quantity: [
        defaults?.quantity ?? 1,
        [Validators.required, Validators.min(1)],
      ],
    });
  }

  protected addItem(): void {
    this.itemsArray.push(this.createItemGroup());
  }

  protected removeItem(index: number): void {
    if (this.itemsArray.length > 1) {
      this.itemsArray.removeAt(index);
    }
  }

  protected getItemControl(
    groupIndex: number,
    field: string,
  ): AbstractControl | null {
    return this.itemsArray.at(groupIndex)?.get(field) ?? null;
  }

  protected isItemInvalid(groupIndex: number, field: string): boolean {
    const ctrl = this.getItemControl(groupIndex, field);
    return !!ctrl && ctrl.invalid && (ctrl.dirty || ctrl.touched);
  }

  // ───────────────── calculations ─────────────────
  private setupFormEffects(): void {
    this.form.valueChanges.subscribe(() => {
      this.calculateInstallment();
    });

    // Auto-advance "تاريخ أول قسط" to exactly one month after "تاريخ البيع"
    // whenever the sale date changes, so the operator doesn't have to set it
    // by hand. Stops once the user edits the first-installment date directly.
    let firstInstallmentTouchedManually = false;
    this.form.get('firstInstallmentDate')?.valueChanges.subscribe(() => {
      if (this.prefilling) return;
      const expected = this.nextMonthStr(this.form.get('dateOfSale')?.value ?? this.todayStr());
      if (this.form.get('firstInstallmentDate')?.value !== expected) {
        firstInstallmentTouchedManually = true;
      }
    });
    this.form.get('dateOfSale')?.valueChanges.subscribe((dateOfSale) => {
      if (this.prefilling || firstInstallmentTouchedManually) return;
      this.form
        .get('firstInstallmentDate')
        ?.setValue(this.nextMonthStr(dateOfSale), { emitEvent: false });
    });

    // "ضبط القسط الأخير تلقائيًا": when on, the user types the installment
    // amount by hand (it no longer has to divide the total evenly — the
    // server absorbs the remainder into the last installment), and must also
    // enter "إجمالي العقد" (totalContractAmount) — the real total the client
    // pays, independent from cashPrice — since that's what the server uses
    // to compute the remainder. When off, restore the normal
    // auto-computed/disabled behavior and clear the total-amount requirement.
    this.form.get('adjustLastInstallmentForRemainder')?.valueChanges.subscribe((on) => {
      const installmentCtrl = this.form.get('installmentAmount');
      const totalCtrl = this.form.get('totalContractAmount');
      if (on) {
        installmentCtrl?.enable({ emitEvent: false });
        totalCtrl?.enable({ emitEvent: false });
        totalCtrl?.setValidators([Validators.required, Validators.min(0.01)]);
      } else {
        installmentCtrl?.disable({ emitEvent: false });
        totalCtrl?.disable({ emitEvent: false });
        totalCtrl?.clearValidators();
        totalCtrl?.setValue(0, { emitEvent: false });
        this.calculateInstallment();
      }
      totalCtrl?.updateValueAndValidity({ emitEvent: false });
    });

    // "تحصيل المقدم الآن": when off and there's a down payment to collect,
    // the treasury isn't picked yet — it stays required only once the down
    // payment is either collected now or there's nothing to collect.
    this.form.get('isDownPaymentPaid')?.valueChanges.subscribe(() => {
      this.syncTreasuryRequirement();
    });
    this.form.get('downPayment')?.valueChanges.subscribe(() => {
      this.syncTreasuryRequirement();
    });

    // When the product in the FIRST item changes, auto-fill cashPrice once
    // using the price that matches the selected paymentFrequency.
    const firstProductCtrl = this.itemsArray.at(0)?.get('productId');
    firstProductCtrl?.valueChanges.subscribe((id) => {
      if (this.prefilling || !this.canAutoFillPrice()) return;
      const productId = Number(id);
      if (!productId) return;

      this.productsService.getById(productId).subscribe({
        next: (product) => {
          const freq = this.form.get('paymentFrequency')?.value as ContractPaymentFrequency;
          const price = this.priceForFrequency(product, freq);
          this.form.patchValue({ cashPrice: price }, { emitEvent: true });
        },
        error: () => { /* operator enters price manually */ },
      });
    });

    // When paymentFrequency changes, update cashPrice based on the selected product's price.
    this.form.get('paymentFrequency')?.valueChanges.subscribe((freq) => {
      if (this.prefilling) return;

      // In tiered mode the count is Σ tier counts — never overwrite it.
      if (!this.tiers.isActive) {
        this.form.patchValue(
          { installmentsCount: this.installmentsCountForFrequency(freq as ContractPaymentFrequency) },
          { emitEvent: false },
        );
        this.calculateInstallment();
      }

      const productId = Number(this.itemsArray.at(0)?.get('productId')?.value);
      if (!productId || !this.canAutoFillPrice()) return;

      this.productsService.getById(productId).subscribe({
        next: (product) => {
          const price = this.priceForFrequency(product, freq as ContractPaymentFrequency);
          this.form.patchValue({ cashPrice: price }, { emitEvent: true });
        },
        error: () => { /* operator enters price manually */ },
      });
    });
  }

  /**
   * Price auto-fill reads the full product record (`GET /products/{id}`),
   * which needs inventory access. Users picking products through
   * `/products/lookup` only (e.g. a Representative) enter the price by hand.
   */
  private canAutoFillPrice(): boolean {
    return this.access.canViewProductDetails();
  }

  /** Default installments count matching each payment frequency (still editable). */
  private installmentsCountForFrequency(freq: ContractPaymentFrequency): number {
    switch (freq) {
      case 'SemiAnnual': return 6;
      case 'Annual':     return 12;
      default:           return 3; // Quarterly
    }
  }

  /**
   * The treasury is required unless the operator explicitly deferred
   * collecting the down payment AND there's actually a down payment to
   * defer (a zero down payment has nothing to collect later, so the
   * treasury stays required to receive whatever installment flow applies).
   */
  private syncTreasuryRequirement(): void {
    const paid = this.form.get('isDownPaymentPaid')?.value;
    const downPayment = Number(this.form.get('downPayment')?.value) || 0;
    const treasuryCtrl = this.form.get('treasuryId');
    if (!paid && downPayment > 0) {
      treasuryCtrl?.clearValidators();
    } else {
      treasuryCtrl?.setValidators([Validators.required]);
    }
    treasuryCtrl?.updateValueAndValidity({ emitEvent: false });
  }

  private calculateInstallment(): void {
    // Tiered mode: amounts come from the tiers (synced by the controller).
    if (this.tiers.isActive) return;
    // Manual mode: the user is entering their own installment amount —
    // don't overwrite it with the even-division calculation.
    if (this.form.get('adjustLastInstallmentForRemainder')?.value) return;

    const unitPrice   = Number(this.form.get('cashPrice')?.value) || 0;
    const downPayment = Number(this.form.get('downPayment')?.value) || 0;
    const profitRate  = Number(this.form.get('profitRate')?.value) || 0;
    const count       = Number(this.form.get('installmentsCount')?.value) || 1;
    const totalQty    = (this.itemsArray.controls as AbstractControl[]).reduce(
      (sum, ctrl) => sum + (Number(ctrl.get('quantity')?.value) || 0),
      0,
    );
    const cashPrice   = unitPrice * Math.max(1, totalQty);

    const remaining = cashPrice - downPayment;

    if (remaining <= 0) {
      this.form.get('installmentAmount')?.setValue(0, { emitEvent: false });
      return;
    }

    const totalWithProfit = remaining * (1 + profitRate / 100);
    const installmentAmount = totalWithProfit / count;

    this.form
      .get('installmentAmount')
      ?.setValue(Number(installmentAmount.toFixed(2)), { emitEvent: false });
  }

  // ───────────────── submit ─────────────────
  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error(
        this.firstInvalidFieldMessage() || 'يرجى تعبئة الحقول المطلوبة',
      );
      return;
    }

    const raw = this.form.getRawValue();
    const validItems = (raw.items ?? []).filter(
      (i) => i['productId'] && i['warehouseId'] && Number(i['quantity']) >= 1,
    );
    if (validItems.length === 0) {
      this.toast.error('أضف منتجًا واحدًا على الأقل مع تحديد المخزن والكمية');
      return;
    }

    const adjustLastInstallment = !!raw.adjustLastInstallmentForRemainder;
    const downPayment = Number(raw.downPayment);
    const totalContractAmount = Number(raw.totalContractAmount);

    if (adjustLastInstallment && (!totalContractAmount || totalContractAmount <= downPayment)) {
      this.toast.error(
        'إجمالي العقد مطلوب ويجب أن يكون أكبر من المقدم لحساب المبلغ المتبقي للتقسيط.',
      );
      return;
    }

    const installmentTiers = this.tiers.toPayload();
    if (this.tiers.isActive && !installmentTiers) {
      this.toast.error('أضف شريحة تقسيط واحدة صحيحة على الأقل.');
      return;
    }

    this.isSaving.set(true);

    const id = this.editId();

    const sharedFields: ContractFormState = {
      clientId: Number(raw.clientId),
      items: validItems.map((i) => ({
        productId: Number(i['productId']),
        warehouseId: Number(i['warehouseId']),
        quantity: Number(i['quantity']),
      })),
      dateOfSale: new Date(raw.dateOfSale).toISOString(),
      cashPrice: Number(raw.cashPrice),
      downPayment,
      profitRate: Number(raw.profitRate),
      installmentsCount: Number(raw.installmentsCount),
      installmentAmount: Number(raw.installmentAmount),
      paymentFrequency: raw.paymentFrequency as ContractPaymentFrequency,
      firstInstallmentDate: new Date(raw.firstInstallmentDate).toISOString(),
      treasuryId: Number(raw.treasuryId),
      representativeId: raw.representativeId
        ? Number(raw.representativeId)
        : null,
      notes: raw.notes?.trim() || '',
      code: raw.code?.trim() || '',
      adjustLastInstallmentForRemainder: adjustLastInstallment,
      ...(adjustLastInstallment ? { totalContractAmount } : {}),
      isDownPaymentPaid: !!raw.isDownPaymentPaid,
      installmentTiers,
    };

    if (id) {
      const updateForm: UpdateContractFormState = sharedFields;
      this.contractsService
        .update(id, updateForm)
        .pipe(finalize(() => this.isSaving.set(false)))
        .subscribe({
          next: () => {
            this.toast.success('تم تعديل العقد بنجاح');
            this.router.navigate(['/customers/statement']);
          },
          error: (err: ApiError) => {
            this.toast.error(apiErrorToMessage(err, 'فشل في تعديل العقد'));
          },
        });
      return;
    }

    this.contractsService
      .create(sharedFields)
      .pipe(
        switchMap((created) =>
          this.customersService
            .getClient(Number(raw.clientId))
            .pipe(
              catchError(() => of(null)),
              switchMap((fullClient) => {
                this.toast.success('تم إنشاء العقد بنجاح');
                const printData = this.buildPrintData(
                  raw,
                  created,
                  sharedFields.items,
                  fullClient,
                  installmentTiers,
                );
                this.pendingPrintData.set(printData);
                return of(null);
              }),
            ),
        ),
        finalize(() => this.isSaving.set(false)),
      )
      .subscribe({
        error: (err: ApiError) => {
          this.toast.error(apiErrorToMessage(err, 'فشل في إنشاء العقد'));
        },
      });
  }

  /**
   * Builds a human-readable message pointing to the first invalid field,
   * so the user knows what to fix without scrolling the form.
   */
  private firstInvalidFieldMessage(): string | null {
    const topLabels: Record<string, string> = {
      clientId: 'العميل',
      dateOfSale: 'تاريخ البيع',
      cashPrice: 'السعر الكاش',
      downPayment: 'المقدم',
      profitRate: 'نسبة الربح',
      installmentsCount: 'عدد الأقساط',
      paymentFrequency: 'دورية الدفع',
      firstInstallmentDate: 'تاريخ أول قسط',
      treasuryId: 'الخزينة',
      totalContractAmount: 'إجمالي العقد',
    };
    for (const [key, label] of Object.entries(topLabels)) {
      const control = this.form.get(key);
      if (control?.invalid) return `يرجى مراجعة الحقل: ${label}`;
    }
    const tiersCtrl = this.form.controls.installmentTiers;
    if (tiersCtrl.invalid) {
      const badRow = tiersCtrl.controls.findIndex((row) => row.invalid);
      return badRow >= 0
        ? `يرجى مراجعة الشريحة رقم ${badRow + 1} (عدد الشهور ومبلغ القسط)`
        : 'أضف شريحة تقسيط واحدة على الأقل';
    }
    for (let i = 0; i < this.itemsArray.length; i++) {
      const grp = this.itemsArray.at(i);
      if (grp.get('productId')?.invalid)
        return `يرجى اختيار المنتج في الصنف رقم ${i + 1}`;
      if (grp.get('warehouseId')?.invalid)
        return `يرجى اختيار المخزن في الصنف رقم ${i + 1}`;
      if (grp.get('quantity')?.invalid)
        return `يرجى إدخال كمية صحيحة في الصنف رقم ${i + 1}`;
    }
    return null;
  }

  // ───────────────── print & navigate ─────────────────

  protected printAndNavigate(): void {
    const data = this.pendingPrintData();
    if (data) this.slipsPrint.printSlips(data);
    this.pendingPrintData.set(null);
    this.router.navigate(['/customers/customer-list']);
  }

  protected skipPrintAndNavigate(): void {
    this.pendingPrintData.set(null);
    this.router.navigate(['/customers/customer-list']);
  }

  private buildPrintData(
    raw: ReturnType<typeof this.form.getRawValue>,
    created: CreatedContract,
    items: ContractItemFormState[],
    fullClient: CreatedClient | null,
    installmentTiers: InstallmentTier[] | null,
  ): ContractSlipData {
    // Prefer full client record (from GET /clients/{id}); fall back to list entry
    const listClient     = this.clients().find((c) => c.id === Number(raw.clientId));
    const selectedRep    = this.representatives().find((r) => r.id === Number(raw.representativeId)) ?? null;

    const productLines = items
      .filter((i) => i.productId)
      .map((i) => ({
        name:     this.products().find((p) => p.id === i.productId)?.name ?? 'منتج',
        quantity: Number(i.quantity),
      }));

    const downPayment       = Number(raw.downPayment);
    const count             = Number(raw.installmentsCount);
    // Authoritative contract total from the server response — never derive
    // it client-side (installmentAmount × installmentsCount is wrong once
    // the last installment has been adjusted for a remainder).
    const totalAmount       = created.totalContractAmount;
    const installmentAmount = Number(raw.installmentAmount);

    return {
      installmentTiers,
      contractId: created.id,
      contractCode:         raw.code?.trim() || null,
      dateOfSale:           raw.dateOfSale,
      clientName:           fullClient?.fullName    ?? listClient?.fullName    ?? '',
      clientPhone:          fullClient?.phoneNumber ?? listClient?.phoneNumber ?? '',
      clientNumber:         fullClient?.id          ?? listClient?.id          ?? null,
      clientCode:           fullClient?.clientCode  ?? null,
      clientAddress:        fullClient?.areaName    ?? listClient?.areaName    ?? null,
      clientRegion:         fullClient?.region      ?? null,
      clientOccupation:     fullClient?.occupation  ?? null,
      clientBuilding:       fullClient?.building    ?? null,
      clientFloor:          fullClient?.floor       ?? null,
      clientDepartment:     fullClient?.department  ?? null,
      repName:              selectedRep?.name        ?? null,
      repPhone:             selectedRep?.phoneNumber ?? null,
      productLines:         productLines.length ? productLines : [{ name: 'منتج', quantity: 1 }],
      totalAmount:          Math.round(totalAmount),
      downPayment,
      installmentAmount,
      installmentsCount:    count,
      firstInstallmentDate: raw.firstInstallmentDate,
      paymentFrequency:     raw.paymentFrequency,
      notes:                raw.notes ?? null,
    };
  }

  // ───────────────── helpers ─────────────────
  protected reset(): void {
    this.tiers.reset();
    this.form.controls.expectedTotal.setValue(0, { emitEvent: false });

    const itemsArr = this.itemsArray;
    itemsArr.clear({ emitEvent: false });
    itemsArr.push(this.createItemGroup(), { emitEvent: false });

    this.form.patchValue(
      {
        clientId: null,
        cashPrice: 0,
        downPayment: 0,
        profitRate: 20,
        installmentsCount: 12,
        paymentFrequency: 'Annual',
        dateOfSale: this.todayStr(),
        firstInstallmentDate: this.nextMonthStr(this.todayStr()),
        treasuryId: null,
        representativeId: null,
        notes: '',
        code: '',
        adjustLastInstallmentForRemainder: false,
        isDownPaymentPaid: true,
      },
      { emitEvent: false },
    );
    this.syncTreasuryRequirement();
    this.form.get('installmentAmount')?.disable({ emitEvent: false });
    this.form.get('installmentAmount')?.setValue(0, { emitEvent: false });
    const totalCtrl = this.form.get('totalContractAmount');
    totalCtrl?.clearValidators();
    totalCtrl?.disable({ emitEvent: false });
    totalCtrl?.setValue(0, { emitEvent: false });
    totalCtrl?.updateValueAndValidity({ emitEvent: false });
    this.form.markAsUntouched();
    this.form.markAsPristine();
    // The patches above are silent — emit once so the summary signals
    // (incl. the tiers plan) reflect the cleared form.
    this.form.updateValueAndValidity();
  }

  protected isInvalid(field: string): boolean {
    const control = this.form.get(field);
    return !!control && control.invalid && control.touched;
  }

  /** Returns the selling price matching the chosen payment frequency. */
  private priceForFrequency(product: Product, freq: ContractPaymentFrequency): number {
    switch (freq) {
      case 'SemiAnnual': return product.semiAnnualSellingPrice;
      case 'Annual':     return product.annualSellingPrice;
      default:           return product.quarterlySellingPrice;
    }
  }

  private todayStr(): string {
    return new Date().toISOString().split('T')[0];
  }

  /** One calendar month after the given date (yyyy-MM-dd in, yyyy-MM-dd out). */
  private nextMonthStr(dateStr: string): string {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return this.todayStr();
    date.setMonth(date.getMonth() + 1);
    return date.toISOString().split('T')[0];
  }
}
