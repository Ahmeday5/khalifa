import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { ContractsService } from '../../services/contracts.service';
import { ContractDetails } from '../../../customers/models/client-statement.model';

/**
 * Confirmation modal for returning (cancelling) a contract.
 *
 * The backend rejects the operation when any installment payment has
 * already been recorded — the error message is shown verbatim so the
 * user knows exactly why the return was blocked.
 *
 * Usage:
 *   <app-return-contract-modal
 *     [open]="returnOpen()"
 *     [details]="details()"
 *     (closed)="returnOpen.set(false)"
 *     (returned)="onContractReturned()"
 *   />
 */
@Component({
  selector: 'app-return-contract-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, CurrencyArPipe],
  templateUrl: './return-contract-modal.component.html',
})
export class ReturnContractModalComponent {
  private readonly service = inject(ContractsService);
  private readonly toast = inject(ToastService);

  readonly open = input.required<boolean>();
  readonly details = input<ContractDetails | null>(null);

  readonly closed = output<void>();
  readonly returned = output<void>();

  protected readonly submitting = signal(false);

  constructor() {
    effect(() => {
      if (!this.open()) this.submitting.set(false);
    }, { allowSignalWrites: true });
  }

  protected confirm(): void {
    const d = this.details();
    if (!d || this.submitting()) return;

    this.submitting.set(true);
    this.service.returnContract(d.contract.id).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.toast.success(res.message || 'تم إرجاع العقد بنجاح');
        this.returned.emit();
      },
      error: (err: ApiError) => {
        this.submitting.set(false);
        this.toast.error(apiErrorToMessage(err, 'تعذّر إرجاع العقد'));
      },
    });
  }
}
