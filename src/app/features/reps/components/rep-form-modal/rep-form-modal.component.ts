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
  CreateRepresentativePayload,
  Representative,
  RepresentativePermission,
  RepresentativeStatus,
  UpdateRepresentativePayload,
} from '../../models/rep.model';
import {
  REP_PERMISSION_OPTIONS,
  REP_STATUS_OPTIONS,
} from '../../constants/rep-meta';
import { RepsService } from '../../services/reps.service';
import { PasswordInputComponent } from '../../../../shared/components/password-input/password-input.component';

@Component({
  selector: 'app-rep-form-modal',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    ModalComponent,
    FormErrorComponent,
    PasswordInputComponent,
  ],
  templateUrl: './rep-form-modal.component.html',
  styleUrl: './rep-form-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RepFormModalComponent {
  // ── inputs ──
  readonly open = input.required<boolean>();
  readonly mode = input.required<FormMode>();
  readonly representative = input<Representative | null>(null);

  // ── outputs ──
  readonly closed = output<void>();
  readonly saved = output<Representative>();

  // ── deps ──
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(RepsService);
  private readonly toast = inject(ToastService);

  // ── reactive state ──
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly showPassword = signal(false);

  // ── meta exposed to the template ──
  protected readonly statusOptions = REP_STATUS_OPTIONS;
  protected readonly permissionOptions = REP_PERMISSION_OPTIONS;

  // ── derived ──
  protected readonly isView = computed(() => this.mode() === 'view');
  protected readonly isCreate = computed(() => this.mode() === 'create');
  protected readonly isEdit = computed(() => this.mode() === 'edit');
  protected readonly title = computed(() =>
    formModeTitle(this.mode(), 'مندوب'),
  );
  protected readonly submitLabel = computed(() =>
    formModeSubmitLabel(this.mode()),
  );

  // ── form ──
  protected readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email: [
      '',
      [Validators.required, Validators.email, Validators.maxLength(120)],
    ],
    password: ['', [Validators.required, Validators.minLength(8)]],
    phoneNumber: [
      '',
      [Validators.required, Validators.pattern(/^[0-9+\-\s()]{6,20}$/)],
    ],
    permissions: [
      'SalesAndCollection' as RepresentativePermission,
      [Validators.required],
    ],
    profitRatePercent: [
      0,
      [Validators.required, Validators.min(0), Validators.max(100)],
    ],
    performanceRating: [
      0,
      [Validators.required, Validators.min(0), Validators.max(5)],
    ],
    status: ['Active' as RepresentativeStatus, [Validators.required]],
  });

  constructor() {
    effect(
      () => {
        if (!this.open()) return;
        this.serverError.set(null);
        this.submitting.set(false);
        this.showPassword.set(false);
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
      : this.service.update(
          this.representative()!.id,
          this.toUpdatePayload(raw),
        );

    stream$.subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.toast.success(
          isCreate ? 'تم إضافة المندوب بنجاح' : 'تم حفظ التعديلات',
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

  protected togglePasswordVisibility(): void {
    this.showPassword.update((v) => !v);
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

    const password = this.form.controls.password;

    password.setValidators(
      this.isCreate()
        ? [Validators.required, Validators.minLength(8)]
        : [Validators.minLength(8)],
    );

    password.updateValueAndValidity({ emitEvent: false });
  }

  private resetFormToInputs(): void {
    const r = this.representative();
    if (r && !this.isCreate()) {
      this.form.reset({
        fullName: r.fullName,
        email: r.appUser?.email ?? '',
        password: '',
        phoneNumber: r.phoneNumber,
        permissions: r.permissions,
        profitRatePercent: r.profitRatePercent,
        performanceRating: r.performanceRating,
        status: r.status,
      });
      return;
    }
    this.form.reset({
      fullName: '',
      email: '',
      password: '',
      phoneNumber: '',
      permissions: 'SalesAndCollection',
      profitRatePercent: 0,
      performanceRating: 0,
      status: 'Active',
    });
  }

  // ─────────── payload builders ───────────

  private toCreatePayload(raw: {
    fullName: string;
    email: string;
    password: string;
    phoneNumber: string;
    permissions: RepresentativePermission;
    profitRatePercent: number;
    performanceRating: number;
    status: RepresentativeStatus;
  }): CreateRepresentativePayload {
    return {
      fullName: raw.fullName.trim(),
      email: raw.email.trim(),
      password: raw.password,
      phoneNumber: raw.phoneNumber.trim(),
      permissions: raw.permissions,
      profitRatePercent: Number(raw.profitRatePercent) || 0,
      performanceRating: Number(raw.performanceRating) || 0,
      status: raw.status,
    };
  }

  private toUpdatePayload(raw: {
    fullName: string;
    email: string;
    password: string;
    phoneNumber: string;
    permissions: RepresentativePermission;
    profitRatePercent: number;
    performanceRating: number;
    status: RepresentativeStatus;
  }): UpdateRepresentativePayload {
    const payload: UpdateRepresentativePayload = {
      fullName: raw.fullName.trim(),
      email: raw.email.trim(),
      phoneNumber: raw.phoneNumber.trim(),
      permissions: raw.permissions,
      profitRatePercent: Number(raw.profitRatePercent) || 0,
      performanceRating: Number(raw.performanceRating) || 0,
      status: raw.status,
    };

    const newPassword = raw.password?.trim() ?? '';

    if (newPassword.length > 0) {
      payload.password = newPassword;
    }

    return payload;
  }
}
