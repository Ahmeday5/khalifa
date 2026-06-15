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
  CreateSupplierPayload,
  Supplier,
  UpdateSupplierPayload,
} from '../../models/supplier.model';
import { SuppliersService } from '../../services/suppliers.service';

/**
 * Add / edit / view dialog for a supplier.
 *
 *   <app-supplier-form-modal
 *     [open]="modalOpen()"
 *     [mode]="modalMode()"
 *     [supplier]="modalSupplier()"
 *     (closed)="closeModal()"
 *     (saved)="onSaved($event)" />
 *
 * Hard-resets the form whenever `open` flips to `true` so reopening in
 * a different mode never leaks data from the previous session.
 */
@Component({
  selector: 'app-supplier-form-modal',
  standalone: true,
  imports: [ReactiveFormsModule, ModalComponent, FormErrorComponent],
  templateUrl: './supplier-form-modal.component.html',
  styleUrl: './supplier-form-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupplierFormModalComponent {
  // ── inputs ──
  readonly open = input.required<boolean>();
  readonly mode = input.required<FormMode>();
  readonly supplier = input<Supplier | null>(null);

  // ── outputs ──
  readonly closed = output<void>();
  readonly saved = output<Supplier>();

  // ── deps ──
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(SuppliersService);
  private readonly toast = inject(ToastService);

  // ── state ──
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  // ── derived ──
  protected readonly isView = computed(() => this.mode() === 'view');
  protected readonly isCreate = computed(() => this.mode() === 'create');
  protected readonly title = computed(() =>
    formModeTitle(this.mode(), 'مورد'),
  );
  protected readonly submitLabel = computed(() =>
    formModeSubmitLabel(this.mode()),
  );

  // ── form ──
  protected readonly form = this.fb.nonNullable.group({
    fullName:    ['', [Validators.required, Validators.minLength(2)]],
    address:     ['', [Validators.required, Validators.minLength(2)]],
    phoneNumber: [
      '',
      [
        Validators.required,
        Validators.pattern(/^[0-9+\-\s()]{6,20}$/),
      ],
    ],
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

  // ─────────── template handlers ───────────

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

    const stream$ = isCreate
      ? this.service.create(this.toCreatePayload(raw))
      : this.service.update(this.supplier()!.id, this.toUpdatePayload(raw));

    stream$.subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.toast.success(
          isCreate ? 'تم إضافة المورد بنجاح' : 'تم حفظ التعديلات',
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

  protected async pickContact(): Promise<void> {
    if (!('contacts' in navigator)) {
      this.toast.error('هذه الميزة تتطلب كروم على أندرويد مع HTTPS');
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contacts = await (navigator as any).contacts.select(['tel'], { multiple: false });
      const raw: string = contacts?.[0]?.tel?.[0] ?? '';
      if (!raw) return;
      const cleaned = raw.replace(/[\s\-().]/g, '');
      this.form.controls.phoneNumber.setValue(cleaned);
      this.form.controls.phoneNumber.markAsDirty();
      this.form.controls.phoneNumber.markAsTouched();
    } catch { /* User cancelled */ }
  }

  protected isInvalid(field: keyof typeof this.form.controls): boolean {
    const ctrl = this.form.controls[field];
    return ctrl.invalid && (ctrl.dirty || ctrl.touched);
  }

  // ─────────── internals ───────────

  private applyModeRules(): void {
    if (this.isView()) {
      this.form.disable({ emitEvent: false });
      return;
    }
    this.form.enable({ emitEvent: false });
  }

  private resetFormToInputs(): void {
    const s = this.supplier();
    if (s && !this.isCreate()) {
      this.form.reset({
        fullName: s.fullName,
        address: s.address,
        phoneNumber: s.phoneNumber,
      });
      return;
    }
    this.form.reset({ fullName: '', address: '', phoneNumber: '' });
  }

  private toCreatePayload(raw: {
    fullName: string;
    address: string;
    phoneNumber: string;
  }): CreateSupplierPayload {
    return {
      fullName: raw.fullName.trim(),
      address: raw.address.trim(),
      phoneNumber: raw.phoneNumber.trim(),
    };
  }

  private toUpdatePayload(raw: {
    fullName: string;
    address: string;
    phoneNumber: string;
  }): UpdateSupplierPayload {
    return this.toCreatePayload(raw);
  }
}
