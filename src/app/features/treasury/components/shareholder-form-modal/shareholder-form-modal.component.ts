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
import { LookupItem } from '../../../../core/models/lookup.model';

import { ShareholdersService } from '../../services/shareholders.service';
import { TreasuryService } from '../../services/treasury.service';
import {
  CreateShareholderPayload,
  Shareholder,
  UpdateShareholderPayload,
} from '../../models/shareholder.model';

@Component({
  selector: 'app-shareholder-form-modal',
  standalone: true,
  imports: [ReactiveFormsModule, ModalComponent, FormErrorComponent],
  templateUrl: './shareholder-form-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShareholderFormModalComponent {
  // ── inputs ──
  readonly open = input.required<boolean>();
  readonly mode = input.required<FormMode>();
  readonly shareholder = input<Shareholder | null>(null);

  // ── outputs ──
  readonly closed = output<void>();
  readonly saved = output<Shareholder>();

  // ── deps ──
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(ShareholdersService);
  private readonly treasuryService = inject(TreasuryService);
  private readonly toast = inject(ToastService);

  // ── state ──
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly treasuries = signal<LookupItem[]>([]);
  protected readonly treasuriesLoading = signal(false);

  // ── derived ──
  protected readonly isCreate = computed(() => this.mode() === 'create');
  protected readonly title = computed(() =>
    formModeTitle(this.mode(), 'مساهم'),
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
    address: ['', [Validators.required, Validators.minLength(2)]],
    contributedAmount: [0, [Validators.required, Validators.min(0.01)]],
    companyPercentage: [0, [Validators.required, Validators.min(0)]],
    capitalTreasuryId: [0, [Validators.required, Validators.min(1)]],
    notes: [''],
  });

  constructor() {
    effect(
      () => {
        if (!this.open()) return;
        this.serverError.set(null);
        this.submitting.set(false);
        this.applyModeRules();
        this.resetFormToInputs();
        if (this.isCreate()) this.loadTreasuries();
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

    const raw = this.form.getRawValue();
    const isCreate = this.isCreate();

    this.serverError.set(null);
    this.submitting.set(true);

    const stream$ = isCreate
      ? this.service.create(this.toCreatePayload(raw))
      : this.service.update(
          this.shareholder()!.id,
          this.toUpdatePayload(raw),
        );

    stream$.subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.toast.success(
          isCreate ? 'تم إضافة المساهم بنجاح' : 'تم حفظ التعديلات',
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

  /** Contribution + its treasury are immutable post-creation — lock them on edit. */
  private applyModeRules(): void {
    const { contributedAmount, capitalTreasuryId } = this.form.controls;
    if (this.isCreate()) {
      contributedAmount.enable({ emitEvent: false });
      capitalTreasuryId.enable({ emitEvent: false });
    } else {
      contributedAmount.disable({ emitEvent: false });
      capitalTreasuryId.disable({ emitEvent: false });
    }
  }

  private resetFormToInputs(): void {
    const s = this.shareholder();
    if (s && !this.isCreate()) {
      this.form.reset({
        name: s.name,
        phoneNumber: s.phoneNumber,
        address: s.address,
        contributedAmount: s.contributedAmount,
        companyPercentage: s.companyPercentage,
        capitalTreasuryId: s.capitalTreasuryId,
        notes: s.notes ?? '',
      });
      return;
    }

    this.form.reset({
      name: '',
      phoneNumber: '',
      address: '',
      contributedAmount: 0,
      capitalTreasuryId: 0,
      notes: '',
    });
  }

  private loadTreasuries(): void {
    this.treasuriesLoading.set(true);
    this.treasuryService.lookup().subscribe({
      next: (list) => {
        this.treasuries.set(list ?? []);
        this.treasuriesLoading.set(false);
      },
      error: () => {
        this.treasuries.set([]);
        this.treasuriesLoading.set(false);
      },
    });
  }

  private toCreatePayload(raw: {
    name: string;
    phoneNumber: string;
    address: string;
    contributedAmount: number;
    companyPercentage: number;
    capitalTreasuryId: number;
    notes: string;
  }): CreateShareholderPayload {
    return {
      name: raw.name.trim(),
      phoneNumber: raw.phoneNumber.trim(),
      address: raw.address.trim(),
      contributedAmount: Number(raw.contributedAmount) || 0,
      companyPercentage: Number(raw.companyPercentage) || 0,
      capitalTreasuryId: Number(raw.capitalTreasuryId),
      notes: (raw.notes ?? '').trim(),
    };
  }

  private toUpdatePayload(raw: {
    name: string;
    phoneNumber: string;
    address: string;
    companyPercentage: number;
    notes: string;
  }): UpdateShareholderPayload {
    return {
      name: raw.name.trim(),
      phoneNumber: raw.phoneNumber.trim(),
      address: raw.address.trim(),
      companyPercentage: Number(raw.companyPercentage) || 0,
      notes: (raw.notes ?? '').trim(),
    };
  }
}
