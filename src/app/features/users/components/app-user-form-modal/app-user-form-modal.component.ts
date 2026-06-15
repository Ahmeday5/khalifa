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
import { PasswordInputComponent } from '../../../../shared/components/password-input/password-input.component';
import {
  FormMode,
  formModeSubmitLabel,
  formModeTitle,
} from '../../../../shared/models/form-mode.model';
import { AppUsersService } from '../../services/app-users.service';
import {
  AppUser,
  CreateAppUserPayload,
  RoleOption,
  UpdateAppUserPayload,
} from '../../models/app-user.model';
import { UserRole } from '../../../../core/models/auth.model';
import { ApiError } from '../../../../core/models/api-response.model';
import { ToastService } from '../../../../core/services/toast.service';

@Component({
  selector: 'app-app-user-form-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ModalComponent,
    FormErrorComponent,
    PasswordInputComponent,
  ],
  templateUrl: './app-user-form-modal.component.html',
  styleUrl: './app-user-form-modal.component.scss',
})
export class AppUserFormModalComponent {
  // ── inputs ──
  readonly open = input.required<boolean>();
  readonly mode = input.required<FormMode>();
  readonly user = input<AppUser | null>(null);

  // ── outputs ──
  readonly closed = output<void>();
  readonly saved = output<AppUser>();

  // ── deps ──
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(AppUsersService);
  private readonly toast = inject(ToastService);

  // ── reactive state (template-bound — must be signals) ──
  protected readonly roles = signal<RoleOption[]>([]);
  protected readonly rolesLoading = signal(false);
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  // ── derived ──
  protected readonly isView = computed(() => this.mode() === 'view');
  protected readonly title = computed(() =>
    formModeTitle(this.mode(), 'مستخدم'),
  );
  protected readonly submitLabel = computed(() =>
    formModeSubmitLabel(this.mode()),
  );

  // ── form ──
  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    phoneNumber: [
      '',
      [Validators.required, Validators.pattern(/^[0-9+\-\s]{8,15}$/)],
    ],
    password: ['', [Validators.required, Validators.minLength(6)]],
    role: ['', [Validators.required]],
  });

  constructor() {
    effect(
      () => {
        if (!this.open()) return;

        this.serverError.set(null);
        this.submitting.set(false);
        this.applyModeRules();
        this.ensureRolesThenReset();
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
    const isCreate = this.mode() === 'create';

    this.serverError.set(null);
    this.submitting.set(true);

    const stream = isCreate
      ? this.service.create(this.toCreatePayload(raw))
      : this.service.update(this.user()!.id, this.toUpdatePayload(raw));

    stream.subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.toast.success(
          isCreate ? 'تم إضافة المستخدم بنجاح' : 'تم حفظ التعديلات',
        );
        this.saved.emit({
          id: res.id,
          email: res.email,
          phoneNumber: raw.phoneNumber,
          role: res.role,
        });
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

  private ensureRolesThenReset(): void {
    if (this.roles().length > 0) {
      this.resetFormToInputs();
      return;
    }

    this.rolesLoading.set(true);
    this.service.getRoles().subscribe({
      next: (rs) => {
        this.roles.set(rs);
        this.rolesLoading.set(false);
        this.resetFormToInputs();
      },
      error: () => {
        this.rolesLoading.set(false);
        // Still reset so the user sees the rest of their data — the role
        // field will simply have no matching option until roles arrive.
        this.resetFormToInputs();
      },
    });
  }

  private resetFormToInputs(): void {
    const u = this.user();
    const base = { email: '', phoneNumber: '', password: '', role: '' };

    if (u && this.mode() !== 'create') {
      this.form.reset({
        email: u.email ?? '',
        phoneNumber: u.phoneNumber ?? '',
        password: '',
        role: u.role ?? '',
      });
    } else {
      this.form.reset(base);
    }
  }


  private applyModeRules(): void {
    if (this.mode() === 'view') {
      this.form.disable({ emitEvent: false });
      return;
    }

    this.form.enable({ emitEvent: false });

    const password = this.form.controls.password;
    password.setValidators(
      this.mode() === 'create'
        ? [Validators.required, Validators.minLength(6)]
        : [Validators.minLength(6)],
    );
    password.updateValueAndValidity({ emitEvent: false });
  }

  // ─────────── payload builders ───────────

  private toCreatePayload(raw: {
    email: string;
    phoneNumber: string;
    password: string;
    role: string;
  }): CreateAppUserPayload {
    return {
      email: raw.email.trim(),
      phoneNumber: raw.phoneNumber.trim(),
      password: raw.password,
      role: raw.role as UserRole,
    };
  }

  private toUpdatePayload(raw: {
    email: string;
    phoneNumber: string;
    password: string;
    role: string;
  }): UpdateAppUserPayload {
    const payload: UpdateAppUserPayload = {
      email: raw.email.trim(),
      phoneNumber: raw.phoneNumber.trim(),
      role: raw.role as UserRole,
    };
    const newPassword = raw.password?.trim() ?? '';
    if (newPassword.length > 0) {
      payload.password = newPassword;
    }
    return payload;
  }
}
