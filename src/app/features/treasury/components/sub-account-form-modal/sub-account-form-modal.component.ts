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
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../../../shared/components/searchable-select/searchable-select.component';
import {
  FormMode,
  formModeSubmitLabel,
  formModeTitle,
} from '../../../../shared/models/form-mode.model';
import { ApiError } from '../../../../core/models/api-response.model';
import { ToastService } from '../../../../core/services/toast.service';
import { LookupItem } from '../../../../core/models/lookup.model';

import { SubAccountsService } from '../../services/sub-accounts.service';
import { SubAccount, SubAccountPayload } from '../../models/sub-account.model';

/**
 * Add / edit dialog for a sub-account. Only `name` and `phoneNumber` are
 * writable — the balance is derived from vouchers and never set by hand.
 *
 *   <app-sub-account-form-modal
 *     [open]="formOpen()"
 *     [mode]="formMode()"
 *     [account]="formAccount()"
 *     (closed)="closeForm()"
 *     (saved)="onSaved($event)" />
 */
@Component({
  selector: 'app-sub-account-form-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ModalComponent, FormErrorComponent, SearchableSelectComponent],
  templateUrl: './sub-account-form-modal.component.html',
})
export class SubAccountFormModalComponent {
  // ── inputs ──
  readonly open = input.required<boolean>();
  readonly mode = input.required<FormMode>();
  readonly account = input<SubAccount | null>(null);
  readonly representatives = input<LookupItem[]>([]);

  protected readonly repOptions = computed<SearchableSelectOption[]>(() =>
    this.representatives().map((r) => ({ value: r.id, label: r.name })),
  );

  // ── outputs ──
  readonly closed = output<void>();
  readonly saved = output<SubAccount>();

  // ── deps ──
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(SubAccountsService);
  private readonly toast = inject(ToastService);

  // ── state ──
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  // ── derived ──
  protected readonly isCreate = computed(() => this.mode() === 'create');
  protected readonly title = computed(() =>
    formModeTitle(this.mode(), 'حساب فرعي'),
  );
  protected readonly submitLabel = computed(() =>
    formModeSubmitLabel(this.mode()),
  );

  // ── form ──
  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    phoneNumber: [
      '',
      [Validators.required, Validators.pattern(/^[0-9+\-\s()]{6,20}$/)],
    ],
    representativeId: [null as number | null],
  });

  constructor() {
    effect(
      () => {
        if (!this.open()) return;
        this.serverError.set(null);
        this.submitting.set(false);
        this.resetFormToInputs();
      },
      { allowSignalWrites: true },
    );
  }

  // ─────────── template handlers ───────────

  protected onSubmit(): void {
    if (this.submitting()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const isCreate = this.isCreate();
    const payload = this.toPayload();

    this.serverError.set(null);
    this.submitting.set(true);

    const stream$ = isCreate
      ? this.service.create(payload)
      : this.service.update(this.account()!.id, payload);

    stream$.subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.toast.success(
          isCreate ? 'تمت إضافة الحساب الفرعي بنجاح' : 'تم حفظ التعديلات',
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

  // ─────────── internals ───────────

  private resetFormToInputs(): void {
    const a = this.account();
    if (a && !this.isCreate()) {
      this.form.reset({
        name: a.name,
        phoneNumber: a.phoneNumber,
        representativeId: a.representativeId ?? null,
      });
      return;
    }
    this.form.reset({ name: '', phoneNumber: '', representativeId: null });
  }

  private toPayload(): SubAccountPayload {
    const raw = this.form.getRawValue();
    const payload: SubAccountPayload = {
      name: raw.name.trim(),
      phoneNumber: raw.phoneNumber.trim(),
    };
    if (raw.representativeId && raw.representativeId > 0) {
      payload.representativeId = raw.representativeId;
    }
    return payload;
  }
}
