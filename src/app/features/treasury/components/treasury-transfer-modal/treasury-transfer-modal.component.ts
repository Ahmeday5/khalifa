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
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';

import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { FormErrorComponent } from '../../../../shared/components/form-error/form-error.component';
import { ApiError } from '../../../../core/models/api-response.model';
import { ToastService } from '../../../../core/services/toast.service';

import { Treasury, TreasuryTransfer } from '../../models/treasury.model';
import { TreasuryService } from '../../services/treasury.service';

/**
 * Inter-treasury transfer dialog.
 *
 *   <app-treasury-transfer-modal
 *     [open]="transferOpen()"
 *     [treasuries]="treasuries()"
 *     (closed)="closeTransfer()"
 *     (saved)="onTransferSaved($event)" />
 *
 * The form resets every time `open` flips to true so reopening never shows
 * stale state from the previous attempt. `fromTreasuryId` and `toTreasuryId`
 * must differ — enforced via a form-level validator.
 */
@Component({
  selector: 'app-treasury-transfer-modal',
  standalone: true,
  imports: [ReactiveFormsModule, ModalComponent, FormErrorComponent],
  templateUrl: './treasury-transfer-modal.component.html',
  styleUrl: './treasury-transfer-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TreasuryTransferModalComponent {
  // ── inputs ──
  readonly open = input.required<boolean>();
  readonly treasuries = input.required<Treasury[]>();

  // ── outputs ──
  readonly closed = output<void>();
  readonly saved = output<TreasuryTransfer>();

  // ── deps ──
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(TreasuryService);
  private readonly toast = inject(ToastService);

  // ── reactive state ──
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  // ── derived ──
  /** Only active treasuries can participate in transfers. */
  protected readonly activeTreasuries = computed(() =>
    this.treasuries().filter((t) => t.isActive),
  );

  // ── form ──
  protected readonly form = this.fb.nonNullable.group(
    {
      fromTreasuryId: [
        null as number | null,
        [Validators.required],
      ],
      toTreasuryId: [
        null as number | null,
        [Validators.required],
      ],
      amount: [0, [Validators.required, Validators.min(0.01)]],
      transferDate: [todayIso(), [Validators.required]],
      notes: [''],
    },
    { validators: [distinctTreasuriesValidator()] },
  );

  constructor() {
    effect(
      () => {
        if (!this.open()) return;
        this.serverError.set(null);
        this.submitting.set(false);
        this.resetForm();
      },
      { allowSignalWrites: true },
    );
  }

  protected onSubmit(): void {
    if (this.submitting()) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    this.serverError.set(null);
    this.submitting.set(true);

    this.service
      .createTransfer({
        fromTreasuryId: Number(raw.fromTreasuryId),
        toTreasuryId: Number(raw.toTreasuryId),
        amount: Number(raw.amount) || 0,
        transferDate: raw.transferDate,
        notes: (raw.notes ?? '').trim(),
      })
      .subscribe({
        next: (res) => {
          this.submitting.set(false);
          this.toast.success('تم تنفيذ التحويل بنجاح');
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

  /** Form-level error shown under the "to" select when both are equal. */
  protected showSameTreasuryError(): boolean {
    const err = this.form.errors?.['sameTreasury'];
    if (!err) return false;
    return this.form.controls.toTreasuryId.touched;
  }

  // ── internals ──

  private resetForm(): void {
    this.form.reset({
      fromTreasuryId: null,
      toTreasuryId: null,
      amount: 0,
      transferDate: todayIso(),
      notes: '',
    });
  }
}

/** Cross-field validator: `fromTreasuryId` must differ from `toTreasuryId`. */
function distinctTreasuriesValidator(): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const from = group.get('fromTreasuryId')?.value;
    const to = group.get('toTreasuryId')?.value;
    if (from == null || to == null) return null;
    return Number(from) === Number(to) ? { sameTreasury: true } : null;
  };
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
