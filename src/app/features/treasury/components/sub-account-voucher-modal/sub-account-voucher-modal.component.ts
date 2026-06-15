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
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { ApiError } from '../../../../core/models/api-response.model';
import { ToastService } from '../../../../core/services/toast.service';

import { VoucherType } from '../../../vouchers/enums/voucher.enums';
import { VOUCHER_TYPE_OPTIONS } from '../../../vouchers/constants/voucher-labels';

import { SubAccountsService } from '../../services/sub-accounts.service';
import {
  CreateSubAccountVoucherPayload,
  SubAccount,
  SubAccountVoucher,
} from '../../models/sub-account.model';
import { LookupItem } from '../../../../core/models/lookup.model';

/**
 * Add a receipt / payment voucher to a single sub-account.
 *
 * A `Receipt` raises the account balance, a `Payment` lowers it. The live
 * projected balance under the amount field gives the operator an at-a-glance
 * confirmation before they commit — and turns red if a payment would overdraw.
 */
@Component({
  selector: 'app-sub-account-voucher-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ModalComponent, FormErrorComponent, CurrencyArPipe],
  templateUrl: './sub-account-voucher-modal.component.html',
})
export class SubAccountVoucherModalComponent {
  // ── inputs ──
  readonly open = input.required<boolean>();
  readonly account = input<SubAccount | null>(null);
  readonly treasuries = input<LookupItem[]>([]);

  // ── outputs ──
  readonly closed = output<void>();
  readonly saved = output<SubAccountVoucher>();

  // ── deps ──
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(SubAccountsService);
  private readonly toast = inject(ToastService);

  // ── option table (shared with the vouchers feature) ──
  protected readonly typeOptions = VOUCHER_TYPE_OPTIONS;
  protected readonly VoucherType = VoucherType;

  // ── state ──
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);
  /** Mirrors the form so the projected-balance preview stays reactive. */
  protected readonly draftType = signal<VoucherType>(VoucherType.Receipt);
  protected readonly draftAmount = signal(0);

  // ── derived ──
  protected readonly currentBalance = computed(() => this.account()?.balance ?? 0);

  /** Balance after this voucher posts — receipts add, payments subtract. */
  protected readonly projectedBalance = computed(() => {
    const delta =
      this.draftType() === VoucherType.Receipt
        ? this.draftAmount()
        : -this.draftAmount();
    return this.currentBalance() + delta;
  });

  protected readonly wouldOverdraw = computed(
    () => this.draftType() === VoucherType.Payment && this.projectedBalance() < 0,
  );

  // ── form ──
  protected readonly form = this.fb.nonNullable.group({
    treasuryId: [0, [Validators.required, Validators.min(1)]],
    type: [VoucherType.Receipt, [Validators.required]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    date: [this.todayISO(), [Validators.required]],
    notes: [''],
  });

  constructor() {
    effect(
      () => {
        if (!this.open()) return;
        this.serverError.set(null);
        this.submitting.set(false);
        this.draftType.set(VoucherType.Receipt);
        this.draftAmount.set(0);
        this.form.reset({
          treasuryId: 0,
          type: VoucherType.Receipt,
          amount: 0,
          date: this.todayISO(),
          notes: '',
        });
      },
      { allowSignalWrites: true },
    );
  }

  // ─────────── template handlers ───────────

  protected onTypeChange(value: string): void {
    this.draftType.set(value as VoucherType);
  }

  protected onAmountChange(value: string): void {
    this.draftAmount.set(Number(value) || 0);
  }

  protected onSubmit(): void {
    if (this.submitting()) return;
    const account = this.account();
    if (!account) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.serverError.set(null);
    this.submitting.set(true);

    this.service.createVoucher(account.id, this.toPayload()).subscribe({
      next: (voucher) => {
        this.submitting.set(false);
        this.toast.success('تم تسجيل السند بنجاح');
        this.saved.emit(voucher);
      },
      error: (err: ApiError) => {
        this.submitting.set(false);
        this.serverError.set(err.message || 'تعذّر تسجيل السند');
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

  private toPayload(): CreateSubAccountVoucherPayload {
    const raw = this.form.getRawValue();
    return {
      treasuryId: Number(raw.treasuryId),
      type: raw.type,
      amount: Number(raw.amount) || 0,
      date: raw.date,
      notes: (raw.notes ?? '').trim(),
    };
  }

  private todayISO(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
