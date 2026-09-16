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
import { FormsModule } from '@angular/forms';

import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { todayIsoDate } from '../../../../shared/utils/date-iso.util';
import { LookupItem } from '../../../../core/models/lookup.model';
import { ApiError } from '../../../../core/models/api-response.model';
import { ToastService } from '../../../../core/services/toast.service';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { TreasuryService } from '../../../treasury/services/treasury.service';
import { ContractsService } from '../../../contracts/services/contracts.service';
import { PayDownPaymentPayload } from '../../models/client-statement.model';

type PaymentMethodKey = 'Cash' | 'Transfer' | 'Card' | 'STCPay' | 'ApplePay';

interface DownPaymentForm {
  treasuryId: number | null;
  paymentMethod: PaymentMethodKey;
  paymentDate: string;
  notes: string;
}

/**
 * Shared modal for collecting a contract's full pending down payment in one
 * shot. Consumed by both `statement.component` (row/details actions) and
 * `pending-down-payments.component` (nested contract rows) so the flow
 * isn't duplicated.
 */
@Component({
  selector: 'app-down-payment-collect-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ModalComponent, CurrencyArPipe],
  templateUrl: './down-payment-collect-modal.component.html',
  styleUrl: './down-payment-collect-modal.component.scss',
})
export class DownPaymentCollectModalComponent {
  // ── inputs ──
  readonly open = input.required<boolean>();
  readonly contractId = input<number | null>(null);
  readonly contractCode = input<string | null>(null);
  readonly downPaymentAmount = input<number>(0);

  // ── outputs ──
  readonly closed = output<void>();
  readonly collected = output<void>();

  // ── deps ──
  private readonly contractsService = inject(ContractsService);
  private readonly treasuryService = inject(TreasuryService);
  private readonly toast = inject(ToastService);

  // ── state ──
  protected readonly submitting = signal(false);
  protected readonly treasuries = signal<LookupItem[]>([]);
  protected readonly form = signal<DownPaymentForm>(this.emptyForm());

  protected readonly title = computed(() =>
    this.contractCode() ? `تحصيل مقدم — عقد ${this.contractCode()}` : 'تحصيل المقدم',
  );

  constructor() {
    this.loadTreasuries();

    // Reset the form to sensible defaults each time the modal opens.
    effect(() => {
      if (!this.open()) return;
      this.form.set(this.emptyForm());
    });
  }

  private loadTreasuries(): void {
    this.treasuryService.lookup().subscribe({
      next: (list) => this.treasuries.set(list),
      error: () => this.treasuries.set([]),
    });
  }

  protected updateForm<K extends keyof DownPaymentForm>(
    key: K,
    value: DownPaymentForm[K],
  ): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  protected close(): void {
    if (this.submitting()) return;
    this.closed.emit();
  }

  protected submit(): void {
    const id = this.contractId();
    const f = this.form();
    if (!id) return;
    if (f.treasuryId === null) {
      this.toast.error('اختر الخزينة');
      return;
    }

    const payload: PayDownPaymentPayload = {
      treasuryId: f.treasuryId,
      paymentDate: new Date(f.paymentDate).toISOString(),
      paymentMethod: this.toServerMethod(f.paymentMethod),
      notes: f.notes?.trim() || '',
    };

    this.submitting.set(true);
    this.contractsService.payDownPayment(id, payload).subscribe({
      next: () => {
        this.submitting.set(false);
        this.toast.success('تم تحصيل المقدم بنجاح');
        this.collected.emit();
      },
      error: (err: ApiError) => {
        this.submitting.set(false);
        this.toast.error(apiErrorToMessage(err, 'فشل تحصيل المقدم'));
      },
    });
  }

  private toServerMethod(key: PaymentMethodKey): string {
    const map: Record<PaymentMethodKey, string> = {
      Cash: 'cash',
      Transfer: 'transfer',
      Card: 'card',
      STCPay: 'stcpay',
      ApplePay: 'applepay',
    };
    return map[key];
  }

  private emptyForm(): DownPaymentForm {
    return {
      treasuryId: this.treasuries()[0]?.id ?? null,
      paymentMethod: 'Cash',
      paymentDate: todayIsoDate(),
      notes: '',
    };
  }
}
