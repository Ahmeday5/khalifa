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
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { FormErrorComponent } from '../../../../shared/components/form-error/form-error.component';
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../../../shared/components/searchable-select/searchable-select.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { todayIsoDate } from '../../../../shared/utils/date-iso.util';
import { TreasuryService } from '../../../treasury/services/treasury.service';
import { RepsService } from '../../services/reps.service';
import { CommissionPayoutResult } from '../../models/rep.model';

/**
 * Admin: pays (part of) a representative's outstanding commission. The
 * amount is capped client-side at `outstanding` for instant feedback; the
 * backend enforces the same rule authoritatively.
 */
@Component({
  selector: 'app-commission-payout-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ModalComponent,
    FormErrorComponent,
    SearchableSelectComponent,
    CurrencyArPipe,
  ],
  templateUrl: './commission-payout-modal.component.html',
})
export class CommissionPayoutModalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly treasuryService = inject(TreasuryService);
  private readonly service = inject(RepsService);
  private readonly toast = inject(ToastService);

  readonly open = input.required<boolean>();
  readonly representativeId = input<number | null>(null);
  readonly representativeName = input<string>('');
  readonly outstanding = input<number>(0);

  readonly closed = output<void>();
  readonly paid = output<CommissionPayoutResult>();

  protected readonly submitting = signal(false);
  protected readonly treasuries = signal<SearchableSelectOption[]>([]);

  protected readonly form = this.fb.nonNullable.group({
    amount: [0, [Validators.required, Validators.min(0.01)]],
    treasuryId: [null as number | null, [Validators.required]],
    date: [todayIsoDate(), [Validators.required]],
    notes: [''],
  });

  /** True when the entered amount exceeds what's owed. */
  protected readonly overpaying = computed(() => this.amountSig() > this.outstanding());
  private readonly amountSig = signal(0);

  constructor() {
    this.form.controls.amount.valueChanges.subscribe((v) =>
      this.amountSig.set(Number(v) || 0),
    );

    // Load treasury options + reset the form each time the modal opens.
    effect(
      () => {
        if (!this.open()) return;
        this.form.reset({
          amount: 0,
          treasuryId: null,
          date: todayIsoDate(),
          notes: '',
        });
        this.amountSig.set(0);
        this.treasuryService.lookup().subscribe({
          next: (list) =>
            this.treasuries.set(
              list.map((t) => ({ value: t.id, label: t.name })),
            ),
          error: () => this.treasuries.set([]),
        });
      },
      { allowSignalWrites: true },
    );
  }

  protected submit(): void {
    const id = this.representativeId();
    if (id == null) return;

    const amount = Number(this.form.controls.amount.value);
    if (this.form.invalid || amount <= 0) {
      this.form.markAllAsTouched();
      return;
    }
    if (amount > this.outstanding()) {
      this.toast.error('المبلغ أكبر من العمولة المستحقة للمندوب');
      return;
    }

    this.submitting.set(true);
    this.service
      .payCommission(id, {
        amount,
        treasuryId: Number(this.form.controls.treasuryId.value),
        date: this.form.controls.date.value,
        notes: this.form.controls.notes.value.trim(),
      })
      .subscribe({
        next: (res) => {
          this.submitting.set(false);
          this.toast.success(
            `تم صرف ${res.amountPaid} للمندوب ${res.representativeName}`,
          );
          this.paid.emit(res);
        },
        error: (err: ApiError) => {
          this.submitting.set(false);
          this.toast.error(apiErrorToMessage(err, 'تعذّر صرف العمولة'));
        },
      });
  }
}
