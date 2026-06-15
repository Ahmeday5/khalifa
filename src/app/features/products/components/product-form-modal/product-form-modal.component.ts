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
import { Product, ProductFormInput } from '../../models/product.model';
import { ProductsService } from '../../services/products.service';
import {
  buildImageUrl,
  PRODUCT_IMAGE_ACCEPT,
  validateProductImage,
} from '../../utils/product-image.util';
import { Category } from '../../../categories/models/category.model';
import { CategoriesService } from '../../../categories/services/categories.service';

@Component({
  selector: 'app-product-form-modal',
  standalone: true,
  imports: [ReactiveFormsModule, ModalComponent, FormErrorComponent],
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

  // ── derived ──
  protected readonly isView = computed(() => this.mode() === 'view');
  protected readonly isCreate = computed(() => this.mode() === 'create');
  protected readonly title = computed(() => formModeTitle(this.mode(), 'منتج'));
  protected readonly submitLabel = computed(() =>
    formModeSubmitLabel(this.mode()),
  );

  /**
   * Image to render in the preview slot. Order of preference:
   *   1. Newly-picked file (object URL) — what the user sees mid-edit
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
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: ['', [Validators.required, Validators.minLength(2)]],
    purchasePrice: [0, [Validators.required, Validators.min(0)]],
    sellingPrice: [0, [Validators.required, Validators.min(0)]],
    isActive: [true, [Validators.required]],
    categoryId: this.fb.nonNullable.control<number | null>(null),
  });

  constructor() {
    effect(
      () => {
        if (!this.open()) {
          // Modal closed — release any object URL we held.
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

    const payload: ProductFormInput = {
      name: raw.name,
      description: raw.description,
      purchasePrice: Number(raw.purchasePrice) || 0,
      sellingPrice: Number(raw.sellingPrice) || 0,
      isActive: raw.isActive,
      categoryId: raw.categoryId ? Number(raw.categoryId) : null,
      image: this.pickedImage(),
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
      // Reset the input so picking the same bad file again still fires change.
      input.value = '';
      return;
    }

    this.imageError.set(null);
    this.releasePreview();
    this.pickedImage.set(file);

    const reader = new FileReader();
    reader.onload = () => {
      // Guard against late-arriving reads after the modal closed
      // or the user cleared / replaced the picked file.
      if (this.pickedImage() !== file) return;
      this.previewDataUrl.set(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Allow re-picking the same file later (`change` only fires on new value).
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
        name: p.name,
        description: p.description,
        purchasePrice: p.purchasePrice,
        sellingPrice: p.sellingPrice,
        isActive: p.isActive,
        categoryId: p.categoryId ?? null,
      });
      return;
    }
    this.form.reset({
      name: '',
      description: '',
      purchasePrice: 0,
      sellingPrice: 0,
      isActive: true,
      categoryId: null,
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
