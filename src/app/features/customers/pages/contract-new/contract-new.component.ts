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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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

import { ContractsService } from '../../../contracts/services/contracts.service';
import { CustomersService } from '../../services/customers.service';
import { ProductsService } from '../../../products/services/products.service';
import { WarehouseService } from '../../../warehouse/services/warehouse.service';
import { TreasuryService } from '../../../treasury/services/treasury.service';
import { RepsService } from '../../../reps/services/reps.service';

import {
  ContractFormState,
  ContractPaymentFrequency,
  UpdateContractFormState,
} from '../../../contracts/models/contract.model';
import { ContractDetails } from '../../models/client-statement.model';

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

  // ───────────────── lookup data ─────────────────
  protected readonly clients = signal<DashboardClient[]>([]);
  protected readonly products = signal<LookupItem[]>([]);
  protected readonly warehouses = signal<LookupItem[]>([]);
  protected readonly treasuries = signal<LookupItem[]>([]);
  protected readonly representatives = signal<LookupItem[]>([]);

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
  protected readonly representativeOptions = computed<SearchableSelectOption[]>(
    () => this.toOptions(this.representatives()),
  );

  private toOptions(items: LookupItem[]): SearchableSelectOption[] {
    return items.map((i) => ({ value: i.id, label: i.name }));
  }

  // ───────────────── payment frequencies ─────────────────
  protected readonly frequencies: {
    value: ContractPaymentFrequency;
    label: string;
  }[] = [
    { value: 'Monthly', label: 'شهري' },
    { value: 'Quarterly', label: 'ربع سنوي' },
    { value: 'SemiAnnual', label: 'نصف سنوي' },
  ];

  // ───────────────── form ─────────────────
  protected readonly form = this.fb.nonNullable.group({
    clientId: [null as number | null, [Validators.required]],
    productId: [null as number | null, [Validators.required]],
    warehouseId: [null as number | null, [Validators.required]],

    quantity: [1, [Validators.required, Validators.min(1)]],

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
      'Monthly' as ContractPaymentFrequency,
      [Validators.required],
    ],

    firstInstallmentDate: [this.nextMonthStr(), [Validators.required]],

    treasuryId: [null as number | null, [Validators.required]],

    representativeId: [null as number | null],

    notes: [''],
  });

  // ───────────────── reactive values ─────────────────
  private readonly values = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  // ───────────────── computed summary ─────────────────
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

    return {
      cashPrice,
      downPayment,
      afterDown,
      profitRate,
      profitAmount,
      totalAmount,
      installmentAmt,
      count,
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
        .lookup()
        .pipe(catchError(() => of([] as LookupItem[]))),
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
    this.form.patchValue({
      clientId: d.client.id,
      productId: d.product?.id ?? null,
      warehouseId: d.warehouse?.id ?? null,
      quantity: d.contract.quantity,
      dateOfSale: d.contract.dateOfSale.split('T')[0],
      cashPrice: d.contract.cashPrice,
      downPayment: d.contract.downPayment,
      profitRate: d.contract.profitRate,
      installmentsCount: d.contract.installmentsCount,
      paymentFrequency: d.contract.paymentFrequency as ContractPaymentFrequency,
      firstInstallmentDate: d.contract.firstInstallmentDate.split('T')[0],
      representativeId: d.representative?.id ?? null,
      notes: d.contract.notes ?? '',
    });
    this.prefilling = false;
    this.form
      .get('installmentAmount')
      ?.setValue(d.contract.installmentAmount, { emitEvent: false });
  }

  // ───────────────── calculations ─────────────────
  private setupFormEffects(): void {
    this.form.valueChanges.subscribe(() => {
      this.calculateInstallment();
    });

    // The product picker now carries only `{id,name}` (lookup endpoint), so
    // the selling price is pulled on demand from the cached product detail.
    this.form.get('productId')?.valueChanges.subscribe((id) => {
      if (this.prefilling) return;
      const productId = Number(id);
      if (!productId) return;

      this.productsService.getById(productId).subscribe({
        next: (product) =>
          this.form.patchValue(
            { cashPrice: product.sellingPrice },
            { emitEvent: true },
          ),
        error: () => {
          /* leave the price for the operator to enter manually */
        },
      });
    });
  }

  private calculateInstallment(): void {
    const cashPrice = Number(this.form.get('cashPrice')?.value) || 0;

    const downPayment = Number(this.form.get('downPayment')?.value) || 0;

    const profitRate = Number(this.form.get('profitRate')?.value) || 0;

    const count = Number(this.form.get('installmentsCount')?.value) || 1;

    const remaining = cashPrice - downPayment;

    if (remaining <= 0) {
      this.form.get('installmentAmount')?.setValue(0, {
        emitEvent: false,
      });

      return;
    }

    const totalWithProfit = remaining * (1 + profitRate / 100);

    const installmentAmount = totalWithProfit / count;

    this.form
      .get('installmentAmount')
      ?.setValue(Number(installmentAmount.toFixed(2)), {
        emitEvent: false,
      });
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

    this.isSaving.set(true);

    const raw = this.form.getRawValue();
    const id = this.editId();

    const sharedFields = {
      clientId: Number(raw.clientId),
      productId: Number(raw.productId),
      warehouseId: Number(raw.warehouseId),
      quantity: Number(raw.quantity),
      dateOfSale: new Date(raw.dateOfSale).toISOString(),
      cashPrice: Number(raw.cashPrice),
      downPayment: Number(raw.downPayment),
      profitRate: Number(raw.profitRate),
      installmentsCount: Number(raw.installmentsCount),
      installmentAmount: Number(raw.installmentAmount),
      paymentFrequency: raw.paymentFrequency as ContractPaymentFrequency,
      firstInstallmentDate: new Date(raw.firstInstallmentDate).toISOString(),
      treasuryId: Number(raw.treasuryId),
      representativeId: raw.representativeId ? Number(raw.representativeId) : null,
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

    const payload: ContractFormState = sharedFields;

    this.contractsService
      .create(payload)
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: () => {
          this.toast.success('تم إنشاء العقد بنجاح');
          this.router.navigate(['/customers/customer-list']);
        },
        error: (err: ApiError) => {
          this.toast.error(apiErrorToMessage(err, 'فشل في إنشاء العقد'));
        },
      });
  }

  /**
   * Builds a human-readable message pointing to the first invalid field,
   * so the user knows what to fix without scrolling the form. The labels
   * mirror what the corresponding form-error message would surface.
   */
  private firstInvalidFieldMessage(): string | null {
    const labels: Record<string, string> = {
      clientId: 'العميل',
      productId: 'المنتج',
      warehouseId: 'المخزن',
      quantity: 'الكمية',
      dateOfSale: 'تاريخ البيع',
      cashPrice: 'السعر الكاش',
      downPayment: 'المقدم',
      profitRate: 'نسبة الربح',
      installmentsCount: 'عدد الأقساط',
      paymentFrequency: 'طريقة التقسيط',
      firstInstallmentDate: 'تاريخ أول قسط',
      treasuryId: 'الخزينة',
    };
    for (const [key, label] of Object.entries(labels)) {
      const control = this.form.get(key);
      if (control?.invalid) return `يرجى مراجعة الحقل: ${label}`;
    }
    return null;
  }

  // ───────────────── helpers ─────────────────
  protected reset(): void {
    this.form.reset({
      quantity: 1,
      cashPrice: 0,
      downPayment: 0,
      profitRate: 20,
      installmentsCount: 12,
      paymentFrequency: 'Monthly',
      dateOfSale: this.todayStr(),
      firstInstallmentDate: this.nextMonthStr(),
      installmentAmount: 0,
    });
  }

  protected isInvalid(field: string): boolean {
    const control = this.form.get(field);

    return !!control && control.invalid && control.touched;
  }

  private todayStr(): string {
    return new Date().toISOString().split('T')[0];
  }

  private nextMonthStr(): string {
    const date = new Date();

    date.setMonth(date.getMonth() + 1);

    return date.toISOString().split('T')[0];
  }
}
