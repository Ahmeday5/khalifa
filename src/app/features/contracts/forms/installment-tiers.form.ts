import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';

import { InstallmentTier, InstallmentTierDraft } from '../models/installment-tier.model';
import {
  hasAtMostTwoDecimals,
  normalizeTiers,
  roundMoney,
  sumTierCounts,
} from '../utils/installment-tiers.util';

// ───────────────────────── types ─────────────────────────

export interface InstallmentTierControls {
  /** Installments in this tier — integer > 0. `null` while the row is blank. */
  count: FormControl<number | null>;
  /** Amount per installment — > 0, ≤ 2 decimals. `null` while the row is blank. */
  amount: FormControl<number | null>;
}

export type InstallmentTierFormGroup = FormGroup<InstallmentTierControls>;
export type InstallmentTiersFormArray = FormArray<InstallmentTierFormGroup>;

// ───────────────────────── validators ─────────────────────────

/** Rejects non-integer numbers (`2.5`). Empty values are left to `required`. */
export const integerValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = control.value;
  if (value === null || value === undefined || value === '') return null;
  return Number.isInteger(Number(value)) ? null : { integer: true };
};

/** Rejects amounts with more than two decimal places (`10.555`). */
export const twoDecimalsValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = control.value;
  if (value === null || value === undefined || value === '') return null;
  return hasAtMostTwoDecimals(Number(value)) ? null : { maxDecimals: { max: 2 } };
};

/** The plan needs at least one tier. */
export const atLeastOneTierValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null =>
  control instanceof FormArray && control.length > 0 ? null : { noTiers: true };

// ───────────────────────── factories ─────────────────────────

export function createInstallmentTierGroup(
  seed?: InstallmentTierDraft | null,
): InstallmentTierFormGroup {
  const count = Number(seed?.count) > 0 ? Number(seed?.count) : null;
  const amount = Number(seed?.amount) > 0 ? roundMoney(Number(seed?.amount)) : null;

  return new FormGroup<InstallmentTierControls>({
    count: new FormControl<number | null>(count, [
      Validators.required,
      Validators.min(1),
      integerValidator,
    ]),
    amount: new FormControl<number | null>(amount, [
      Validators.required,
      Validators.min(0.01),
      twoDecimalsValidator,
    ]),
  });
}

/**
 * Empty, **disabled** tiers array. A disabled control is ignored by the
 * parent form's validity, so the tiers never block saving while the
 * toggle is off — the old screen behavior stays 100% intact.
 */
export function createInstallmentTiersArray(): InstallmentTiersFormArray {
  const array = new FormArray<InstallmentTierFormGroup>([], [atLeastOneTierValidator]);
  array.disable({ emitEvent: false });
  return array;
}

// ───────────────────────── controller ─────────────────────────

/** The parent form's controls the tiers feature reads or drives. */
export interface InstallmentTiersBindings {
  /** The "تقسيط على أكثر من مبلغ" toggle. */
  enabled: FormControl<boolean>;
  tiers: InstallmentTiersFormArray;
  /** Driven to Σ count while tiered (shown read-only). */
  installmentsCount: FormControl<number>;
  /** Driven to the first tier's amount while tiered (the backend contract). */
  installmentAmount: FormControl<number>;
  /** Forced off and disabled while tiered — the backend rejects both together. */
  adjustLastInstallment: FormControl<boolean>;
}

/**
 * Owns every state transition of the tiered-installments toggle so the
 * stored-contract page and the direct-contract modal behave identically:
 *
 * - **on** → turns off/locks "ضبط القسط الأخير تلقائيًا", enables the tiers
 *   (seeded with two rows, the first taken from the current count/amount),
 *   and keeps `installmentsCount` = Σ count and `installmentAmount` = first
 *   tier's amount in sync on every edit.
 * - **off** → clears + disables the tiers and unlocks the adjust option;
 *   the host's own recalculation then restores the normal amount.
 *
 * Hosts must skip their own even-division recalculation while
 * {@link isActive} is true, or it would overwrite the synced amount.
 */
export class InstallmentTiersFormController {
  /** Blank rows to seed when the toggle is switched on by the operator. */
  private static readonly DEFAULT_ROWS = 2;

  constructor(
    private readonly c: InstallmentTiersBindings,
    destroyRef: DestroyRef,
  ) {
    c.enabled.valueChanges
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe((on) => (on ? this.activate(this.seedFromCurrentValues()) : this.deactivate()));

    c.tiers.valueChanges
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => this.syncDerivedFields());
  }

  /** Whether the tiered plan is currently in effect. */
  get isActive(): boolean {
    return this.c.enabled.value;
  }

  /**
   * Edit-mode prefill. More than one tier → tiered mode with exactly these
   * rows; a single tier (all installments equal) → normal mode untouched.
   */
  load(tiers: readonly InstallmentTier[]): void {
    if (tiers.length > 1) {
      this.c.enabled.setValue(true, { emitEvent: false });
      this.activate(tiers);
    } else {
      this.reset();
    }
  }

  /** Back to the default (toggle off, no tiers). Safe to call repeatedly. */
  reset(): void {
    this.c.enabled.setValue(false, { emitEvent: false });
    this.deactivate();
  }

  /** Wire value for `installmentTiers` — `null` when the toggle is off. */
  toPayload(): InstallmentTier[] | null {
    if (!this.isActive) return null;
    const tiers = normalizeTiers(this.c.tiers.getRawValue());
    return tiers.length ? tiers : null;
  }

  // ─── transitions ───

  private activate(rows: readonly InstallmentTierDraft[]): void {
    const { tiers, adjustLastInstallment } = this.c;

    // Emit so the host's own "adjust off" handler restores its normal state
    // (e.g. disables the manual total) before we lock the option.
    if (adjustLastInstallment.value) adjustLastInstallment.setValue(false);
    adjustLastInstallment.disable({ emitEvent: false });

    tiers.clear({ emitEvent: false });
    rows.forEach((row) => tiers.push(createInstallmentTierGroup(row), { emitEvent: false }));
    tiers.enable({ emitEvent: false });
    // One emitting update so subscribers (sync, editor view) see the new rows.
    tiers.updateValueAndValidity();
  }

  private deactivate(): void {
    const { tiers, adjustLastInstallment } = this.c;
    tiers.clear({ emitEvent: false });
    tiers.disable({ emitEvent: false });
    adjustLastInstallment.enable({ emitEvent: false });
  }

  /** First row mirrors the current count/amount (when set); then blank rows. */
  private seedFromCurrentValues(): InstallmentTierDraft[] {
    const first: InstallmentTierDraft = {
      count: Number(this.c.installmentsCount.value) || undefined,
      amount: Number(this.c.installmentAmount.value) || undefined,
    };
    const blanks = Array.from({ length: InstallmentTiersFormController.DEFAULT_ROWS - 1 }, () => ({}));
    return [first, ...blanks];
  }

  private syncDerivedFields(): void {
    if (!this.isActive) return;
    const raw = this.c.tiers.getRawValue();

    const countCtrl = this.c.installmentsCount;
    countCtrl.setValue(sumTierCounts(raw), { emitEvent: false });
    // Read-only while tiered — surface range errors (e.g. > 120) immediately.
    countCtrl.markAsTouched();

    const firstAmount = Number(raw[0]?.amount) || 0;
    this.c.installmentAmount.setValue(roundMoney(firstAmount), { emitEvent: false });
  }
}
