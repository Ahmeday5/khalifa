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
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { FormErrorComponent } from '../../../../shared/components/form-error/form-error.component';
import {
  FormMode,
  formModeSubmitLabel,
  formModeTitle,
} from '../../../../shared/models/form-mode.model';
import { ApiError } from '../../../../core/models/api-response.model';
import { ToastService } from '../../../../core/services/toast.service';
import {
  CommissionType,
  COMMISSION_TYPE_LABELS,
  Product,
  ProductFormInput,
} from '../../models/product.model';
import { ProductsService } from '../../services/products.service';
import {
  buildImageUrl,
  PRODUCT_IMAGE_ACCEPT,
  validateProductImage,
} from '../../utils/product-image.util';
import { Category } from '../../../categories/models/category.model';
import { CategoriesService } from '../../../categories/services/categories.service';
import { DecimalPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-product-form-modal',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    ModalComponent,
    FormErrorComponent,
    DecimalPipe,
  ],
  templateUrl: './product-form-modal.component.html',
  styleUrl: './product-form-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductFormModalComponent {
  // ── inputs ──
  readonly open = input.required<boolean>();
  readonly mode = input.required<FormMode>();
  readonly product = input<Product | null>(null);

  // ── outputs ──
  readonly closed = output<void>();
  readonly saved = output<Product>();

  // ── deps ──
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(ProductsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly toast = inject(ToastService);

  // ── reactive state ──
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  /** Categories for the dropdown — lazy-loaded on first open. */
  protected readonly categories = signal<Category[]>([]);
  protected readonly loadingCategories = signal(false);

  /** Prevents the effect from re-triggering a fetch after categories load. */
  private categoriesLoaded = false;

  /** The picked file, if any. Service serializes this as the `Image` field. */
  protected readonly pickedImage = signal<File | null>(null);
  /** Local error from client-side image validation (size / MIME type). */
  protected readonly imageError = signal<string | null>(null);
  /** Data URL for the picked file's preview. */
  protected readonly previewDataUrl = signal<string | null>(null);

  protected readonly imageAccept = PRODUCT_IMAGE_ACCEPT;

  /** Commission type options for the radio group — rendered in template. */
  protected readonly commissionTypeOptions: {
    value: CommissionType;
    label: string;
  }[] = [
    { value: 'None', label: COMMISSION_TYPE_LABELS['None'] },
    { value: 'Percentage', label: COMMISSION_TYPE_LABELS['Percentage'] },
    { value: 'FixedAmount', label: COMMISSION_TYPE_LABELS['FixedAmount'] },
  ];

  // ── derived ──
  protected readonly isView = computed(() => this.mode() === 'view');
  protected readonly isCreate = computed(() => this.mode() === 'create');
  protected readonly title = computed(() => formModeTitle(this.mode(), 'منتج'));
  protected readonly submitLabel = computed(() =>
    formModeSubmitLabel(this.mode()),
  );

  /**
   * Image to render in the preview slot. Order of preference:
   *   1. Newly-picked file (data URL) — what the user sees mid-edit
   *   2. Existing product image (edit/view modes) — converted to absolute URL
   *   3. null → render the empty placeholder
   */
  protected readonly previewSrc = computed<string | null>(() => {
    const fromPick = this.previewDataUrl();
    if (fromPick) return fromPick;
    return buildImageUrl(this.product()?.imageUrl);
  });

  // ── form ──
  protected readonly form = this.fb.nonNullable.group({
    name:                   ['', [Validators.required, Validators.minLength(2)]],
    description:            ['', [Validators.required, Validators.minLength(2)]],
    purchasePrice:          [0, [Validators.required, Validators.min(0)]],
    quarterlySellingPrice:  [0, [Validators.required, Validators.min(0)]],
    semiAnnualSellingPrice: [0, [Validators.required, Validators.min(0)]],
    annualSellingPrice:     [0, [Validators.required, Validators.min(0)]],
    isActive:        [true],
    categoryId:      this.fb.nonNullable.control<number | null>(null),
    commissionType:  this.fb.nonNullable.control<CommissionType>('None'),
    commissionValue: [0, [Validators.required, Validators.min(0)]],
  });

  /** Reactive snapshot of the whole form — drives all computed derivations. */
  private readonly formValues = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  /** Reactive signal tracking the selected commission type — must be after `form`. */
  private readonly commissionTypeValue = toSignal(
    this.form.controls.commissionType.valueChanges,
    { initialValue: this.form.controls.commissionType.value },
  );

  /**
   * Show the commission value input only when the selected type needs one.
   * Also drives the conditional Validators.min(0.01) on commissionValue.
   */
  protected readonly needsCommissionValue = computed(
    () => this.commissionTypeValue() !== 'None',
  );

  /** Placeholder / suffix label for the commission value input. */
  protected readonly commissionValueSuffix = computed<string>(() => {
    switch (this.commissionTypeValue() as CommissionType) {
      case 'Percentage':
        return '%';
      case 'FixedAmount':
        return 'ج.م';
      default:
        return '';
    }
  });

  constructor() {
    // Keep commissionValue validators in sync with the selected type.
    this.form.controls.commissionType.valueChanges.subscribe(() => {
      this.syncCommissionValueValidators();
    });

    effect(
      () => {
        if (!this.open()) {
          this.releasePreview();
          return;
        }

        this.serverError.set(null);
        this.submitting.set(false);
        this.imageError.set(null);
        this.releasePreview();
        this.pickedImage.set(null);
        this.applyModeRules();
        this.resetFormToInputs();
        this.loadCategoriesIfNeeded();
      },
      { allowSignalWrites: true },
    );
  }

  // ─────────────── public template handlers ───────────────

  protected onSubmit(): void {
    if (this.isView() || this.submitting()) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.imageError()) return;

    const raw = this.form.getRawValue();
    const isCreate = this.isCreate();
    const commissionType = raw.commissionType as CommissionType;

    const payload: ProductFormInput = {
      name:                   raw.name,
      description:            raw.description,
      purchasePrice:          Number(raw.purchasePrice) || 0,
      quarterlySellingPrice:  Number(raw.quarterlySellingPrice) || 0,
      semiAnnualSellingPrice: Number(raw.semiAnnualSellingPrice) || 0,
      annualSellingPrice:     Number(raw.annualSellingPrice) || 0,
      isActive:        raw.isActive,
      categoryId:      raw.categoryId ? Number(raw.categoryId) : null,
      image:           this.pickedImage(),
      commissionType,
      commissionValue: commissionType === 'None' ? 0 : Number(raw.commissionValue) || 0,
    };

    this.serverError.set(null);
    this.submitting.set(true);

    const stream = isCreate
      ? this.service.create(payload)
      : this.service.update(this.product()!.id, payload);

    stream.subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.toast.success(
          isCreate ? 'تم إضافة المنتج بنجاح' : 'تم حفظ التعديلات',
        );
        this.saved.emit(res);
      },
      error: (err: ApiError) => {
        this.submitting.set(false);
        this.serverError.set(err.message);
      },
    });
  }

  protected close(): void {
    if (this.submitting()) return;
    this.closed.emit();
  }

  protected isInvalid(field: keyof typeof this.form.controls): boolean {
    const ctrl = this.form.controls[field];
    return ctrl.invalid && (ctrl.dirty || ctrl.touched);
  }

  protected onFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) return;

    const validation = validateProductImage(file);
    if (!validation.ok) {
      this.imageError.set(validation.error);
      input.value = '';
      return;
    }

    this.imageError.set(null);
    this.releasePreview();
    this.pickedImage.set(file);

    const reader = new FileReader();
    reader.onload = () => {
      if (this.pickedImage() !== file) return;
      this.previewDataUrl.set(reader.result as string);
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  protected clearPickedImage(): void {
    this.releasePreview();
    this.pickedImage.set(null);
    this.imageError.set(null);
  }

  // ─────────────── internals ───────────────

  private applyModeRules(): void {
    if (this.isView()) {
      this.form.disable({ emitEvent: false });
      return;
    }
    this.form.enable({ emitEvent: false });
  }

  private resetFormToInputs(): void {
    const p = this.product();
    if (p && !this.isCreate()) {
      this.form.reset({
        name:                   p.name,
        description:            p.description,
        purchasePrice:          p.purchasePrice,
        quarterlySellingPrice:  p.quarterlySellingPrice,
        semiAnnualSellingPrice: p.semiAnnualSellingPrice,
        annualSellingPrice:     p.annualSellingPrice,
        isActive:        p.isActive,
        categoryId:      p.categoryId ?? null,
        commissionType:  (p.commissionType as CommissionType) ?? 'None',
        commissionValue: p.commissionValue ?? 0,
      });
    } else {
      this.form.reset({
        name:                   '',
        description:            '',
        purchasePrice:          0,
        quarterlySellingPrice:  0,
        semiAnnualSellingPrice: 0,
        annualSellingPrice:     0,
        isActive:        true,
        categoryId:      null,
        commissionType:  'None',
        commissionValue: 0,
      });
    }
    this.syncCommissionValueValidators();
  }

  /**
   * Applies Validators.min(0.01) on commissionValue only when a type that
   * needs a value is selected. Removes the validator (allows 0) for None.
   */
  /** هامش الربح لكل دورية دفع — يُعرض بجانب كل سعر بيع في الـ template. */
  protected readonly profitMargins = computed(() => {
    const v        = this.formValues();
    const purchase = Number(v.purchasePrice ?? 0);
    if (!purchase || purchase <= 0) return { quarterly: 0, semiAnnual: 0, annual: 0 };
    const calc = (selling: number) =>
      ((Number(selling ?? 0) - purchase) / purchase) * 100;
    return {
      quarterly:  calc(v.quarterlySellingPrice  ?? 0),
      semiAnnual: calc(v.semiAnnualSellingPrice ?? 0),
      annual:     calc(v.annualSellingPrice     ?? 0),
    };
  });

  private syncCommissionValueValidators(): void {
    const ctrl = this.form.controls.commissionValue;

    const type = this.form.controls.commissionType.value;

    switch (type) {
      case 'Percentage':
        ctrl.setValidators([
          Validators.required,
          Validators.min(0.01),
          Validators.max(100),
        ]);
        break;

      case 'FixedAmount':
        ctrl.setValidators([Validators.required, Validators.min(0.01)]);
        break;

      default:
        ctrl.setValidators([Validators.required, Validators.min(0)]);
    }

    ctrl.updateValueAndValidity({
      emitEvent: false,
    });
  }

  private loadCategoriesIfNeeded(): void {
    if (this.categoriesLoaded) return;
    this.categoriesLoaded = true;
    this.loadingCategories.set(true);
    this.categoriesService.listAll().subscribe({
      next: (list) => {
        this.categories.set(list);
        this.loadingCategories.set(false);
      },
      error: () => {
        this.categoriesLoaded = false;
        this.categories.set([]);
        this.loadingCategories.set(false);
      },
    });
  }

  private releasePreview(): void {
    this.previewDataUrl.set(null);
  }
}
