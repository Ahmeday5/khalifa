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
  CreateWarehousePayload,
  UpdateWarehousePayload,
  Warehouse,
} from '../../models/warehouse.model';
import { WarehouseService } from '../../services/warehouse.service';

/**
 * Add / edit dialog for a Warehouse.
 *
 *   <app-warehouse-form-modal
 *     [open]="modalOpen()"
 *     [mode]="modalMode()"
 *     [warehouse]="modalWarehouse()"
 *     (closed)="closeModal()"
 *     (saved)="onSaved($event)" />
 *
 * The form fully resets every time `open` flips to true, so reopening
 * the modal in a different mode never shows stale data from the
 * previous session.
 */
@Component({
  selector: 'app-warehouse-form-modal',
  standalone: true,
  imports: [ReactiveFormsModule, ModalComponent, FormErrorComponent],
  templateUrl: './warehouse-form-modal.component.html',
  styleUrl: './warehouse-form-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WarehouseFormModalComponent {
  // ── inputs ──
  readonly open = input.required<boolean>();
  readonly mode = input.required<FormMode>();
  readonly warehouse = input<Warehouse | null>(null);

  // ── outputs ──
  readonly closed = output<void>();
  readonly saved = output<Warehouse>();

  // ── deps ──
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(WarehouseService);
  private readonly toast = inject(ToastService);

  // ── reactive state (template-bound — must be signals) ──
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  // ── derived ──
  protected readonly isView = computed(() => this.mode() === 'view');
  protected readonly isCreate = computed(() => this.mode() === 'create');
  protected readonly title = computed(() =>
    formModeTitle(this.mode(), 'مخزن'),
  );
  protected readonly submitLabel = computed(() =>
    formModeSubmitLabel(this.mode()),
  );

  // ── form ──
  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    location: ['', [Validators.required, Validators.minLength(2)]],
    isActive: [true, [Validators.required]],
  });

  constructor() {
    effect(
      () => {
        if (!this.open()) return;

        this.serverError.set(null);
        this.submitting.set(false);
        this.applyModeRules();
        this.resetFormToInputs();
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

    const raw = this.form.getRawValue();
    const isCreate = this.isCreate();

    this.serverError.set(null);
    this.submitting.set(true);

    const stream = isCreate
      ? this.service.create(this.toCreatePayload(raw))
      : this.service.update(this.warehouse()!.id, this.toUpdatePayload(raw));

    stream.subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.toast.success(
          isCreate ? 'تم إضافة المخزن بنجاح' : 'تم حفظ التعديلات',
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

  // ─────────────── internals ───────────────

  private applyModeRules(): void {
    if (this.isView()) {
      this.form.disable({ emitEvent: false });
      return;
    }
    this.form.enable({ emitEvent: false });
  }

  /**
   * Hydrate the form from the input warehouse (edit/view) or reset to
   * sensible defaults (create).
   */
  private resetFormToInputs(): void {
    const w = this.warehouse();
    if (w && !this.isCreate()) {
      this.form.reset({
        name: w.name,
        location: w.location,
        isActive: w.isActive,
      });
      return;
    }
    this.form.reset({ name: '', location: '', isActive: true });
  }

  // ─────────── payload builders ───────────

  private toCreatePayload(raw: {
    name: string;
    location: string;
    isActive: boolean;
  }): CreateWarehousePayload {
    return {
      name: raw.name.trim(),
      location: raw.location.trim(),
      isActive: raw.isActive,
    };
  }

  private toUpdatePayload(raw: {
    name: string;
    location: string;
    isActive: boolean;
  }): UpdateWarehousePayload {
    return {
      name: raw.name.trim(),
      location: raw.location.trim(),
      isActive: raw.isActive,
    };
  }
}
