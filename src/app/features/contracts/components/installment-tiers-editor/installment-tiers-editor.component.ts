import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { InstallmentTierDraft } from '../../models/installment-tier.model';
import {
  createInstallmentTierGroup,
  InstallmentTierFormGroup,
  InstallmentTiersFormArray,
} from '../../forms/installment-tiers.form';
import {
  expandTiersToSchedule,
  moneyEquals,
  summarizeTiers,
} from '../../utils/installment-tiers.util';
import { formatPlanAmount } from '../../pipes/installment-plan-label.pipe';

/**
 * Editor for a tiered installment plan ("تقسيط على أكثر من مبلغ"):
 * tiers table (add / remove), live totals, optional reconciliation against
 * an operator-entered total, and a per-installment schedule preview.
 *
 * Presentational only — it edits the `FormArray` it's given; mode switching
 * and payload building stay with `InstallmentTiersFormController`.
 */
@Component({
  selector: 'app-installment-tiers-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './installment-tiers-editor.component.html',
  styleUrl: './installment-tiers-editor.component.scss',
})
export class InstallmentTiersEditorComponent {
  /** The tiers being edited. */
  readonly tiers = input.required<InstallmentTiersFormArray>();
  /** Current down payment — feeds the contract total. */
  readonly downPayment = input<number>(0);
  /** `yyyy-MM-dd` — first due date of the schedule preview. */
  readonly firstInstallmentDate = input<string>('');
  /**
   * Optional "expected total" input to reconcile against. When given, the
   * editor renders it and warns (never blocks) on any mismatch.
   */
  readonly expectedTotalControl = input<FormControl<number> | null>(null);

  // ── live values (FormArray/FormControl → signals) ──
  private readonly tierValues = signal<InstallmentTierDraft[]>([]);
  private readonly expectedTotal = signal<number>(0);

  protected readonly summary = computed(() =>
    summarizeTiers(this.tierValues(), this.downPayment(), this.expectedTotal()),
  );

  /** Calculated vs. expected total — `null` when no expected total was entered. A warning only, never blocks saving. */
  protected readonly reconciliation = computed(() => {
    const diff = this.summary().differenceFromExpected;
    if (diff === null) return null;
    return { matches: moneyEquals(diff, 0), over: diff > 0, difference: Math.abs(diff) };
  });

  protected readonly schedule = computed(() =>
    this.firstInstallmentDate()
      ? expandTiersToSchedule(this.tierValues(), this.firstInstallmentDate())
      : [],
  );

  /** "من قسط X إلى Y" for each row; `null` while the row's count is blank. */
  protected readonly ranges = computed(() => {
    let start = 1;
    return this.tierValues().map((t) => {
      const count = Number(t?.count);
      if (!Number.isInteger(count) || count < 1) return null;
      const range = { from: start, to: start + count - 1 };
      start += count;
      return range;
    });
  });

  constructor() {
    effect(
      (onCleanup) => {
        const array = this.tiers();
        const sync = () => this.tierValues.set(array.getRawValue());
        sync();
        const sub = array.valueChanges.subscribe(sync);
        onCleanup(() => sub.unsubscribe());
      },
      { allowSignalWrites: true },
    );

    effect(
      (onCleanup) => {
        const control = this.expectedTotalControl();
        if (!control) {
          this.expectedTotal.set(0);
          return;
        }
        const sync = () => this.expectedTotal.set(Number(control.value) || 0);
        sync();
        const sub = control.valueChanges.subscribe(sync);
        onCleanup(() => sub.unsubscribe());
      },
      { allowSignalWrites: true },
    );
  }

  // ── row management ──

  protected get rows(): InstallmentTierFormGroup[] {
    return this.tiers().controls;
  }

  protected get canRemove(): boolean {
    return this.tiers().length > 1;
  }

  protected addTier(): void {
    this.tiers().push(createInstallmentTierGroup());
  }

  protected removeTier(index: number): void {
    if (!this.canRemove) return;
    this.tiers().removeAt(index);
  }

  protected showError(row: InstallmentTierFormGroup, field: 'count' | 'amount'): boolean {
    const ctrl = row.controls[field];
    return ctrl.invalid && (ctrl.dirty || ctrl.touched);
  }

  protected countError(row: InstallmentTierFormGroup): string {
    const e = row.controls.count.errors;
    if (e?.['required']) return 'عدد الشهور مطلوب';
    if (e?.['integer']) return 'يجب أن يكون عددًا صحيحًا';
    return 'يجب أن يكون أكبر من صفر';
  }

  protected amountError(row: InstallmentTierFormGroup): string {
    const e = row.controls.amount.errors;
    if (e?.['required']) return 'مبلغ القسط مطلوب';
    if (e?.['maxDecimals']) return 'رقمين عشريين بحد أقصى';
    return 'يجب أن يكون أكبر من صفر';
  }

  // ── formatting ──

  protected money(value: number): string {
    return formatPlanAmount(value);
  }

  /** `yyyy-MM-dd` → `dd/MM/yyyy` without timezone conversion. */
  protected displayDate(iso: string): string {
    const [y, m, d] = iso.split('-');
    return y && m && d ? `${d}/${m}/${y}` : iso;
  }
}
