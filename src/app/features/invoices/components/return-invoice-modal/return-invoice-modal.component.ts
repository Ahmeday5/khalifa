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
import { InvoicesService } from '../../services/invoices.service';
import { PurchaseInvoice } from '../../models/invoice.model';

/**
 * Confirmation modal for returning (cancelling) a purchase invoice.
 *
 * The backend rejects the operation when any payment has already been
 * recorded — the error message is shown verbatim so the user knows
 * exactly why the return was blocked.
 *
 * Usage:
 *   <app-return-invoice-modal
 *     [open]="returnOpen()"
 *     [invoice]="invoice()"
 *     (closed)="returnOpen.set(false)"
 *     (returned)="onInvoiceReturned($event)"
 *   />
 */
@Component({
  selector: 'app-return-invoice-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, CurrencyArPipe],
  templateUrl: './return-invoice-modal.component.html',
})
export class ReturnInvoiceModalComponent {
  private readonly service = inject(InvoicesService);
  private readonly toast = inject(ToastService);

  readonly open = input.required<boolean>();
  readonly invoice = input<PurchaseInvoice | null>(null);

  readonly closed = output<void>();
  /** Emits the server success message on successful return. */
  readonly returned = output<string>();

  protected readonly submitting = signal(false);

  constructor() {
    effect(() => {
      if (!this.open()) this.submitting.set(false);
    }, { allowSignalWrites: true });
  }

  protected confirm(): void {
    const inv = this.invoice();
    if (!inv || this.submitting()) return;

    this.submitting.set(true);
    this.service.returnInvoice(inv.id).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.toast.success(res.message || 'تم إرجاع الفاتورة بنجاح');
        this.returned.emit(res.message);
      },
      error: (err: ApiError) => {
        this.submitting.set(false);
        this.toast.error(apiErrorToMessage(err, 'تعذّر إرجاع الفاتورة'));
      },
    });
  }
}
