import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { forkJoin, finalize, of, catchError } from 'rxjs';

import { ContractsService } from '../../services/contracts.service';
import { CustomersService } from '../../../customers/services/customers.service';
import { ProductsService } from '../../../products/services/products.service';
import { WarehouseService } from '../../../warehouse/services/warehouse.service';
import { TreasuryService } from '../../../treasury/services/treasury.service';
import { RepsService } from '../../../reps/services/reps.service';

import {
  ContractFormState,
  ContractPaymentFrequency,
} from '../../models/contract.model';
import { DashboardClient } from '../../../customers/models/dashboard-client.model';
import { LookupItem } from '../../../../core/models/lookup.model';

import { FormErrorComponent } from '../../../../shared/components/form-error/form-error.component';
import { LoaderComponent } from '../../../../shared/components/loader/loader.component';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../../../shared/components/searchable-select/searchable-select.component';
import { ToastService } from '../../../../core/services/toast.service';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { AuthService } from '../../../../core/services/auth.service';
import { PERMISSIONS } from '../../../../core/constants/permissions.const';

@Component({
  selector: 'app-create-contract',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    FormErrorComponent,
    LoaderComponent,
    CurrencyArPipe,
    SearchableSelectComponent,
  ],
  templateUrl: './create-contract.component.html',
  styleUrl: './create-contract.component.scss',
})
export class CreateContractComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly contractsService = inject(ContractsService);
  private readonly customersService = inject(CustomersService);
  private readonly productsService = inject(ProductsService);
  private readonly warehouseService = inject(WarehouseService);
  private readonly treasuryService = inject(TreasuryService);
  private readonly repsService = inject(RepsService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);

  // --- Signals for Lookups ---
  clients = signal<DashboardClient[]>([]);
  products = signal<LookupItem[]>([]);
  warehouses = signal<LookupItem[]>([]);
  treasuries = signal<LookupItem[]>([]);
  representatives = signal<LookupItem[]>([]);

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

  // --- UI State ---
  loading = signal(true);
  submitting = signal(false);

  form!: FormGroup;

  frequencies: { value: ContractPaymentFrequency; label: string }[] = [
    { value: 'Monthly', label: 'شهري' },
    { value: 'Quarterly', label: 'ربع سنوي' },
    { value: 'SemiAnnual', label: 'نصف سنوي' },
  ];

  ngOnInit(): void {
    this.initForm();
    this.loadLookups();
    this.setupCalculations();
  }

  private initForm(): void {
    const today = new Date().toISOString().split('T')[0];
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const firstInstallmentDate = nextMonth.toISOString().split('T')[0];

    this.form = this.fb.nonNullable.group({
      clientId: [null, [Validators.required]],
      productId: [null, [Validators.required]],
      warehouseId: [null, [Validators.required]],
      quantity: [1, [Validators.required, Validators.min(1)]],
      dateOfSale: [today, [Validators.required]],
      purchasePrice: [0, [Validators.required, Validators.min(0)]],
      cashPrice: [0, [Validators.required, Validators.min(0)]],
      downPayment: [0, [Validators.required, Validators.min(0)]],
      profitRate: [18, [Validators.required, Validators.min(0)]],
      installmentsCount: [12, [Validators.required, Validators.min(1)]],
      installmentAmount: [{ value: 0, disabled: true }, [Validators.required]],
      paymentFrequency: ['Monthly', [Validators.required]],
      firstInstallmentDate: [firstInstallmentDate, [Validators.required]],
      treasuryId: [null, [Validators.required]],
      representativeId: [null],
      notes: [''],
    });
  }

  /**
   * Loads every picker source independently. `forkJoin` is all-or-nothing —
   * one rejected call (e.g. a Representative has no `Treasury.View` and
   * cannot list reps) would otherwise blank *every* dropdown. Wrapping each
   * stream in `catchError` degrades that source to an empty list while the
   * ones the user is allowed to see still populate.
   */
  private loadLookups(): void {
    this.loading.set(true);

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
    })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (res) => {
          this.clients.set(res.clients);
          this.products.set(res.products);
          this.warehouses.set(res.warehouses);
          this.treasuries.set(res.treasuries);
          this.representatives.set(res.reps);
        },
        error: () => this.toast.error('حدث خطأ أثناء تحميل البيانات'),
      });
  }

  private setupCalculations(): void {
    // Re-calculate installment amount whenever relevant fields change
    this.form.valueChanges.subscribe(() => {
      this.calculateInstallment();
    });

    // Auto-fill prices when product changes. The picker now carries only
    // `{id,name}` (lookup endpoint), so prices come from the cached detail.
    this.form.get('productId')?.valueChanges.subscribe((id) => {
      const productId = Number(id);
      if (!productId) return;
      // The product detail endpoint is gated by Suppliers.View; reps pick from
      // the lookup (id + name) and would 403 here, so skip the price prefill
      // for them and let them enter the prices manually.
      if (!this.auth.hasPermission(PERMISSIONS.suppliersView)) return;

      this.productsService.getById(productId).subscribe({
        next: (product) =>
          this.form.patchValue(
            {
              purchasePrice: product.purchasePrice,
              cashPrice: product.sellingPrice,
            },
            { emitEvent: true }
          ),
        error: () => {
          /* leave prices for manual entry */
        },
      });
    });
  }

  private calculateInstallment(): void {
    const cashPrice = this.form.get('cashPrice')?.value || 0;
    const downPayment = this.form.get('downPayment')?.value || 0;
    const profitRate = this.form.get('profitRate')?.value || 0;
    const count = this.form.get('installmentsCount')?.value || 1;

    const remaining = cashPrice - downPayment;
    if (remaining <= 0) {
      this.form.get('installmentAmount')?.setValue(0, { emitEvent: false });
      return;
    }

    // Standard Simple Profit Calculation:
    // Total = (CashPrice - DownPayment) * (1 + ProfitRate/100)
    // Installment = Total / Count
    const totalWithProfit = remaining * (1 + profitRate / 100);
    const amount = totalWithProfit / count;

    this.form
      .get('installmentAmount')
      ?.setValue(Number(amount.toFixed(2)), { emitEvent: false });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    const formValue = this.form.getRawValue();

    // The backend expects ISO strings for dates
    const payload: ContractFormState = {
      ...formValue,
      dateOfSale: new Date(formValue.dateOfSale).toISOString(),
      firstInstallmentDate: new Date(
        formValue.firstInstallmentDate
      ).toISOString(),
      clientId: Number(formValue.clientId),
      productId: Number(formValue.productId),
      warehouseId: Number(formValue.warehouseId),
      treasuryId: Number(formValue.treasuryId),
      representativeId: formValue.representativeId
        ? Number(formValue.representativeId)
        : null,
    };

    this.contractsService
      .create(payload)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => {
          this.toast.success('تم إنشاء العقد بنجاح');
          this.router.navigate(['/contracts']);
        },
        error: (err: ApiError) => {
          this.toast.error(apiErrorToMessage(err, 'فشل في إنشاء العقد'));
        },
      });
  }
}
