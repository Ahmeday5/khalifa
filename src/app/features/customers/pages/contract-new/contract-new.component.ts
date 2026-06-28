import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
import { forkJoin, finalize, of, catchError } from 'rxjs';

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
import { Representative } from '../../../reps/models/rep.model';

import {
  ContractFormState,
  ContractItemFormState,
  ContractPaymentFrequency,
  UpdateContractFormState,
} from '../../../contracts/models/contract.model';
import { ContractDetails } from '../../models/client-statement.model';
import { Product } from '../../../products/models/product.model';

import { DashboardClient } from '../../models/dashboard-client.model';
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
  protected readonly representatives = signal<Representative[]>([]);

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
    this.representatives().map((r) => ({ value: r.id, label: r.fullName, hint: r.phoneNumber })),
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
      4,
      [Validators.required, Validators.min(1), Validators.max(120)],
    ],

    installmentAmount: [{ value: 0, disabled: true }, [Validators.required]],

    paymentFrequency: [
      'Quarterly' as ContractPaymentFrequency,
      [Validators.required],
    ],

    firstInstallmentDate: [this.nextQuarterStr(), [Validators.required]],

    treasuryId: [null as number | null, [Validators.required]],

    representativeId: [null as number | null],

    notes: [''],
  });

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

    return {
      unitPrice,
      cashPrice,
      downPayment,
      afterDown,
      profitRate,
      profitAmount,
      totalAmount,
      installmentAmt,
      count,
      totalQty,
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
        .list()
        .pipe(catchError(() => of({ data: [] as Representative[], pageIndex: 1, pageSize: 100, count: 0, totalPages: 0 }))),
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
          this.representatives.set(res.reps?.data ?? []);
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
    });

    this.prefilling = false;
    this.form
      .get('installmentAmount')
      ?.setValue(d.contract.installmentAmount, { emitEvent: false });
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

    // When the product in the FIRST item changes, auto-fill cashPrice once
    // using the price that matches the selected paymentFrequency.
    const firstProductCtrl = this.itemsArray.at(0)?.get('productId');
    firstProductCtrl?.valueChanges.subscribe((id) => {
      if (this.prefilling) return;
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
      const productId = Number(this.itemsArray.at(0)?.get('productId')?.value);
      if (!productId) return;

      this.productsService.getById(productId).subscribe({
        next: (product) => {
          const price = this.priceForFrequency(product, freq as ContractPaymentFrequency);
          this.form.patchValue({ cashPrice: price }, { emitEvent: true });
        },
        error: () => { /* operator enters price manually */ },
      });
    });
  }

  private calculateInstallment(): void {
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
      downPayment: Number(raw.downPayment),
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
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (created) => {
          this.toast.success('تم إنشاء العقد بنجاح');
          const printData = this.buildPrintData(raw, created.id, sharedFields.items);
          this.pendingPrintData.set(printData);
        },
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
    };
    for (const [key, label] of Object.entries(topLabels)) {
      const control = this.form.get(key);
      if (control?.invalid) return `يرجى مراجعة الحقل: ${label}`;
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
    contractId: number,
    items: ContractItemFormState[],
  ): ContractSlipData {
    const selectedClient = this.clients().find((c) => c.id === Number(raw.clientId));
    const selectedRep    = this.representatives().find((r) => r.id === Number(raw.representativeId)) ?? null;

    const productLines = items
      .filter((i) => i.productId)
      .map((i) => ({
        name:     this.products().find((p) => p.id === i.productId)?.name ?? 'منتج',
        quantity: Number(i.quantity),
      }));

    const cashPrice         = Number(raw.cashPrice);
    const downPayment       = Number(raw.downPayment);
    const profitRate        = Number(raw.profitRate);
    const count             = Number(raw.installmentsCount);
    const afterDown         = Math.max(0, cashPrice - downPayment);
    const totalAmount       = afterDown * (1 + profitRate / 100);
    const installmentAmount = Number(raw.installmentAmount);

    return {
      contractId,
      dateOfSale:           raw.dateOfSale,
      clientName:           selectedClient?.fullName   ?? '',
      clientPhone:          selectedClient?.phoneNumber ?? '',
      clientAddress:        selectedClient?.address     ?? null,
      repName:              selectedRep?.fullName         ?? null,
      repPhone:             selectedRep?.phoneNumber      ?? null,
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
    const itemsArr = this.itemsArray;
    itemsArr.clear({ emitEvent: false });
    itemsArr.push(this.createItemGroup(), { emitEvent: false });

    this.form.patchValue(
      {
        clientId: null,
        cashPrice: 0,
        downPayment: 0,
        profitRate: 20,
        installmentsCount: 4,
        paymentFrequency: 'Quarterly',
        dateOfSale: this.todayStr(),
        firstInstallmentDate: this.nextQuarterStr(),
        treasuryId: null,
        representativeId: null,
        notes: '',
      },
      { emitEvent: false },
    );
    this.form.get('installmentAmount')?.setValue(0, { emitEvent: false });
    this.form.markAsUntouched();
    this.form.markAsPristine();
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

  private nextQuarterStr(): string {
    const date = new Date();
    date.setMonth(date.getMonth() + 3);
    return date.toISOString().split('T')[0];
  }
}
