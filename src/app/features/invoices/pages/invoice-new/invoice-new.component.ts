import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../../../shared/components/searchable-select/searchable-select.component';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { InvoicesService } from '../../services/invoices.service';
import {
  CreatePurchaseInvoicePayload,
  PurchaseInvoice,
  UpdatePurchaseInvoicePayload,
} from '../../models/invoice.model';
import { WarehouseService } from '../../../warehouse/services/warehouse.service';
import { ProductsService } from '../../../products/services/products.service';
import { SuppliersService } from '../../../suppliers/services/suppliers.service';
import { TreasuryService } from '../../../treasury/services/treasury.service';
import { LookupItem } from '../../../../core/models/lookup.model';
import { AuthService } from '../../../../core/services/auth.service';
import { PERMISSIONS } from '../../../../core/constants/permissions.const';

interface LineFormShape {
  productId: FormControl<number>;
  unitPrice: FormControl<number>;
  quantity: FormControl<number>;
  discountPercent: FormControl<number>;
}

/**
 * Tax is currently disabled business-wide: the rate is pinned to 0 and the
 * input is non-editable. Kept as a single constant so re-enabling it later
 * is a one-line change.
 */
const FIXED_TAX_RATE = 0;

@Component({
  selector: 'app-invoice-new',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, CurrencyArPipe, SearchableSelectComponent],
  templateUrl: './invoice-new.component.html',
  styleUrl: './invoice-new.component.scss',
})
export class InvoiceNewComponent implements OnInit {
  private readonly fb               = inject(FormBuilder);
  private readonly svc              = inject(InvoicesService);
  private readonly suppliersService = inject(SuppliersService);
  private readonly warehouseService = inject(WarehouseService);
  private readonly productsService  = inject(ProductsService);
  private readonly treasuryService  = inject(TreasuryService);
  private readonly toast            = inject(ToastService);
  private readonly router           = inject(Router);
  private readonly route            = inject(ActivatedRoute);
  private readonly destroyRef       = inject(DestroyRef);
  private readonly auth             = inject(AuthService);

  /**
   * The product *detail* endpoint (`/dashboard/products/{id}`) is gated by
   * `Suppliers.View`. A Representative can still pick products from the lookup
   * (`/products/lookup`, id + name only), so calling getById to prefill the
   * price would 403 for them — we gate the prefill on this flag instead.
   */
  private readonly canReadProductDetails = computed(() =>
    this.auth.hasPermission(PERMISSIONS.suppliersView),
  );

  /** Set when the route carries an `:id` — switches the form to edit mode. */
  protected readonly editId = signal<number | null>(null);
  protected readonly isEdit = computed(() => this.editId() !== null);
  /** True while the existing invoice is being fetched for edit prefill. */
  protected readonly loadingInvoice = signal(false);

  // ── data ──
  protected readonly suppliers  = signal<LookupItem[]>([]);
  protected readonly warehouses = signal<LookupItem[]>([]);
  protected readonly products   = signal<LookupItem[]>([]);
  protected readonly treasuries = signal<LookupItem[]>([]);
  protected readonly loadingRefs = signal(false);

  // Lookups are already active-only + role-scoped server-side.
  protected readonly activeWarehouses = computed(() => this.warehouses());
  protected readonly activeProducts = computed(() => this.products());
  protected readonly activeTreasuries = computed(() => this.treasuries());

  /** Picker options — searched in-memory by the searchable selects. */
  protected readonly supplierOptions = computed<SearchableSelectOption[]>(() =>
    this.suppliers().map((s) => ({ value: s.id, label: s.name })),
  );
  protected readonly warehouseOptions = computed<SearchableSelectOption[]>(() =>
    this.activeWarehouses().map((w) => ({ value: w.id, label: w.name })),
  );
  protected readonly treasuryOptions = computed<SearchableSelectOption[]>(() =>
    this.activeTreasuries().map((t) => ({ value: t.id, label: t.name })),
  );
  protected readonly productOptions = computed<SearchableSelectOption[]>(() =>
    this.activeProducts().map((p) => ({ value: p.id, label: p.name })),
  );

  // ── submit state ──
  protected readonly savingDraft = signal(false);
  protected readonly savingFinal = signal(false);
  protected readonly serverError = signal<string | null>(null);

  /** Bumps every time a line input changes — triggers summary recompute. */
  private readonly linesTick = signal(0);

  // ── form ──
  protected readonly form = this.fb.nonNullable.group({
    supplierId:   [0, [Validators.required, Validators.min(1)]],
    warehouseId:  [0, [Validators.required, Validators.min(1)]],
    treasuryId:   [0, [Validators.required, Validators.min(1)]],
    invoiceDate:  [this.todayISO(), [Validators.required]],
    dueDate:      [this.plusDaysISO(30), [Validators.required]],
    // Disabled + pinned to 0: tax is turned off business-wide. A disabled
    // control is excluded from validity and from user input, but its value
    // is still emitted by `getRawValue()` for the payload.
    taxRatePercent: [{ value: FIXED_TAX_RATE, disabled: true }, []],
    paidAmount:   [0, [Validators.required, Validators.min(0)]],
    notes:        [''],
    autoPostInventory: [true],
    items:        this.fb.array<FormGroup<LineFormShape>>([], Validators.minLength(1)),
  });

  protected get items(): FormArray<FormGroup<LineFormShape>> {
    return this.form.controls.items;
  }

  /**
   * Form-control values exposed as signals so the summary computeds
   * have a real reactive dependency on them. A naive
   * `computed(() => this.grandTotal() - this.form.controls.paidAmount.value)`
   * looks right but fails: signal dependency tracking only sees
   * `grandTotal`, which doesn't change when `paidAmount` changes, so
   * the dependent computed is never re-evaluated. `toSignal` turns the
   * control's `valueChanges` stream into a signal the computeds can
   * subscribe to — and Angular threads it onto the input's actual
   * change event, so OnPush picks up the update on the same tick.
   */
  protected readonly paidAmountSig = toSignal(
    this.form.controls.paidAmount.valueChanges,
    { initialValue: this.form.controls.paidAmount.value },
  );
  protected readonly taxRateSig = toSignal(
    this.form.controls.taxRatePercent.valueChanges,
    { initialValue: this.form.controls.taxRatePercent.value },
  );

  // ── computed summary ──
  protected readonly subtotal = computed(() => {
    this.linesTick(); // dependency
    return this.items.controls.reduce((sum, ctrl) => {
      const { quantity, unitPrice } = ctrl.getRawValue();
      return sum + (Number(quantity) || 0) * (Number(unitPrice) || 0);
    }, 0);
  });

  protected readonly discountAmount = computed(() => {
    this.linesTick();
    return this.items.controls.reduce((sum, ctrl) => {
      const { quantity, unitPrice, discountPercent } = ctrl.getRawValue();
      const lineGross = (Number(quantity) || 0) * (Number(unitPrice) || 0);
      return sum + lineGross * ((Number(discountPercent) || 0) / 100);
    }, 0);
  });

  protected readonly afterDiscount = computed(() =>
    Math.max(0, this.subtotal() - this.discountAmount()),
  );

  protected readonly taxAmount = computed(() => {
    const rate = Number(this.taxRateSig()) || 0;
    return this.afterDiscount() * (rate / 100);
  });

  protected readonly grandTotal = computed(() =>
    this.afterDiscount() + this.taxAmount(),
  );

  protected readonly remaining = computed(() =>
    Math.max(0, this.grandTotal() - (Number(this.paidAmountSig()) || 0)),
  );

  protected readonly canSubmit = computed(() =>
    this.form.valid && this.items.length > 0,
  );

  // ─────────── lifecycle ───────────

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = Number(idParam);
    if (idParam && Number.isFinite(id) && id > 0) {
      this.editId.set(id);
    }

    this.loadingRefs.set(true);
    this.suppliersService.lookup().subscribe({
      next: (s) => this.suppliers.set(s ?? []),
      error: () => this.suppliers.set([]),
    });
    this.warehouseService.lookup().subscribe({
      next: (w) => this.warehouses.set(w ?? []),
      error: () => this.warehouses.set([]),
    });
    this.productsService.lookup().subscribe({
      next: (p) => this.products.set(p ?? []),
      error: () => this.products.set([]),
    });
    this.treasuryService.lookup().subscribe({
      next: (t) => {
        this.treasuries.set(t ?? []);
        // Create only: pre-select the first treasury so the form is valid
        // without scrolling the select. In edit mode the value comes from
        // the existing invoice and must not be overwritten.
        const first = t[0];
        if (
          !this.isEdit() &&
          first &&
          this.form.controls.treasuryId.value === 0
        ) {
          this.form.controls.treasuryId.setValue(first.id);
        }
        this.loadingRefs.set(false);
      },
      error: () => {
        this.treasuries.set([]);
        this.loadingRefs.set(false);
      },
    });

    // `paidAmount` and `taxRatePercent` flow into the summary via the
    // `paidAmountSig` / `taxRateSig` signals at the top of the class —
    // no manual subscription needed. `linesTick` covers the FormArray
    // (which has no signal equivalent) via `onLineFieldChange`.

    if (this.isEdit()) {
      this.loadInvoiceForEdit(this.editId()!);
    } else {
      // Start with one blank row.
      this.addLine();
    }
  }

  /** Fetches the existing invoice and patches the form for edit mode. */
  private loadInvoiceForEdit(id: number): void {
    this.loadingInvoice.set(true);
    this.svc.getById(id).subscribe({
      next: (inv) => {
        this.form.patchValue({
          supplierId: inv.supplierId,
          warehouseId: inv.warehouseId,
          treasuryId: inv.treasuryId ?? 0,
          invoiceDate: this.isoToDateInput(inv.invoiceDate),
          dueDate: this.isoToDateInput(inv.dueDate),
          paidAmount: inv.paidAmount ?? 0,
          notes: inv.notes ?? '',
        });

        this.items.clear();
        for (const line of inv.items ?? []) {
          this.registerLine(this.createLineGroup(line));
        }
        if (this.items.length === 0) this.addLine();

        this.linesTick.update((v) => v + 1);
        this.loadingInvoice.set(false);
      },
      error: (err: ApiError) => {
        this.loadingInvoice.set(false);
        this.toast.error(err.message || 'تعذّر تحميل بيانات الفاتورة');
        this.router.navigate(['/invoices/list']);
      },
    });
  }

  // ─────────── line management ───────────

  protected addLine(): void {
    this.registerLine(this.createLineGroup());
  }

  /** Builds a line group, optionally prefilled from an existing invoice line. */
  private createLineGroup(line?: {
    productId: number;
    unitPrice: number;
    quantity: number;
    discountPercent: number;
  }): FormGroup<LineFormShape> {
    return this.fb.group<LineFormShape>({
      productId:       this.fb.nonNullable.control(line?.productId ?? 0, [Validators.required, Validators.min(1)]),
      unitPrice:       this.fb.nonNullable.control(line?.unitPrice ?? 0, [Validators.required, Validators.min(0)]),
      quantity:        this.fb.nonNullable.control(line?.quantity ?? 1, [Validators.required, Validators.min(1)]),
      discountPercent: this.fb.nonNullable.control(line?.discountPercent ?? 0, [Validators.required, Validators.min(0), Validators.max(100)]),
    });
  }

  /**
   * Appends a line and wires its product picker. The searchable-select is a
   * ControlValueAccessor, so it emits no DOM `change` event — we react to the
   * control's `valueChanges` instead to keep the prefill + summary refresh.
   * `valueChanges` doesn't fire for the initial value, so prefilled edit lines
   * never get their unit price clobbered.
   */
  private registerLine(group: FormGroup<LineFormShape>): void {
    group.controls.productId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.onProductChange(group));
    this.items.push(group);
    this.linesTick.update((v) => v + 1);
  }

  protected removeLine(idx: number): void {
    if (this.items.length <= 1) return;
    this.items.removeAt(idx);
    this.linesTick.update((v) => v + 1);
  }

  /**
   * Reads the picked product straight from the form control (which
   * `formControlName` already synced). Reading `$event.target.value`
   * here would NOT work — with `[ngValue]` Angular sets each option's
   * DOM value to an encoded string like `"1: 1"`, not the raw id, so
   * `Number(...)` would land on `NaN` and break both the model and the
   * select's display text.
   *
   * Side effect: when the user picks a product, update the unit price to
   * the product's `purchasePrice` so they don't have to retype it every
   * time they select a different product. This ensures that changing from
   * one product to another will update the price.
   */
  private onProductChange(ctrl: FormGroup<LineFormShape>): void {
    const productId = Number(ctrl.controls.productId.value);
    this.linesTick.update((v) => v + 1);
    if (!productId) {
      return;
    }
    // Skip the price prefill for roles without products access (e.g. reps) —
    // the detail endpoint would 403; they enter the unit price manually.
    if (!this.canReadProductDetails()) return;
    // The picker carries only `{id,name}` (lookup) — pull the purchase
    // price from the cached product detail to pre-fill the line.
    this.productsService.getById(productId).subscribe({
      next: (product) => {
        ctrl.controls.unitPrice.setValue(product.purchasePrice ?? 0);
        this.linesTick.update((v) => v + 1);
      },
      error: () => {
        /* leave the unit price for manual entry */
      },
    });
  }

  protected onLineFieldChange(idx: number, field: keyof LineFormShape, raw: string): void {
    const num = Number(raw);
    if (Number.isNaN(num)) return;
    this.items.at(idx).controls[field].setValue(num);
    this.linesTick.update((v) => v + 1);
  }

  protected lineTotal(idx: number): number {
    const ctrl = this.items.at(idx);
    const { quantity, unitPrice, discountPercent } = ctrl.getRawValue();
    const gross = (Number(quantity) || 0) * (Number(unitPrice) || 0);
    return gross * (1 - (Number(discountPercent) || 0) / 100);
  }

  // ─────────── submit ───────────

  protected saveDraft(): void {
    this.submit(true);
  }

  protected saveAndConfirm(): void {
    this.submit(false);
  }

  private submit(asDraft: boolean): void {
    if (this.savingDraft() || this.savingFinal()) return;
    if (!this.canSubmit()) {
      this.form.markAllAsTouched();
      this.toast.warning('أكمل بيانات الفاتورة الناقصة');
      return;
    }

    const raw = this.form.getRawValue();

    const payload: CreatePurchaseInvoicePayload = {
      supplierId:        Number(raw.supplierId),
      warehouseId:       Number(raw.warehouseId),
      invoiceDate:       this.toIso(raw.invoiceDate),
      dueDate:           this.toIso(raw.dueDate),
      // Tax is disabled business-wide — always sent as a fixed 0.
      taxRatePercent:    FIXED_TAX_RATE,
      paidAmount:        Number(raw.paidAmount) || 0,
      treasuryId:        Number(raw.treasuryId) || null,
      isDraft:           asDraft,
      autoPostInventory: !!raw.autoPostInventory,
      notes:             (raw.notes ?? '').trim(),
      items: raw.items.map((line) => ({
        productId:       Number(line.productId),
        quantity:        Number(line.quantity) || 0,
        unitPrice:       Number(line.unitPrice) || 0,
        discountPercent: Number(line.discountPercent) || 0,
      })),
    };

    this.serverError.set(null);
    if (asDraft) this.savingDraft.set(true);
    else this.savingFinal.set(true);

    const editId = this.editId();
    const request$ = editId
      ? this.svc.update(editId, payload as UpdatePurchaseInvoicePayload)
      : this.svc.create(payload);

    request$.subscribe({
      next: (res: PurchaseInvoice) => {
        this.savingDraft.set(false);
        this.savingFinal.set(false);
        this.toast.success(
          editId
            ? `تم تعديل الفاتورة ${res.invoiceNumber}`
            : asDraft
              ? `تم حفظ المسودة ${res.invoiceNumber}`
              : `تم إنشاء الفاتورة ${res.invoiceNumber}`,
        );
        this.router.navigate(
          editId ? ['/invoices', editId] : ['/invoices/list'],
        );
      },
      error: (err: ApiError) => {
        this.savingDraft.set(false);
        this.savingFinal.set(false);
        this.serverError.set(err.message || 'تعذّر حفظ الفاتورة');
      },
    });
  }

  // ─────────── helpers ───────────

  private todayISO(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private plusDaysISO(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  /** Converts a `YYYY-MM-DD` value to a midday-UTC ISO string. */
  private toIso(value: string): string {
    if (!value) return new Date().toISOString();
    const d = new Date(`${value}T12:00:00`);
    return Number.isNaN(d.getTime())
      ? new Date().toISOString()
      : d.toISOString();
  }

  /** Converts an API ISO datetime to the `YYYY-MM-DD` a date input expects. */
  private isoToDateInput(iso: string | null | undefined): string {
    if (!iso) return this.todayISO();
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? this.todayISO()
      : d.toISOString().slice(0, 10);
  }
}
