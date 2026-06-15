import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { ClientOrder, ClientOrderItem } from '../../models/catalog.model';

@Component({
  selector: 'app-client-order-details-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CurrencyArPipe, ModalComponent],
  templateUrl: './client-order-details-modal.component.html',
  styleUrl: './client-order-details-modal.component.scss',
})
export class ClientOrderDetailsModalComponent {
  readonly order = input<ClientOrder | null>(null);
  readonly onClose = output<void>();

  protected getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'Accepted':
        return 'badge-success';
      case 'Pending':
        return 'badge-warning';
      case 'Rejected':
        return 'badge-danger';
      case 'Converted':
        return 'badge-info';
      case 'Approved':
        return 'badge-primary';
      case 'Cancelled':
        return 'badge-secondary';
      default:
        return 'badge-secondary';
    }
  }

  protected getStatusLabel(status: string): string {
    switch (status) {
      case 'Accepted':
        return 'مقبول';
      case 'Pending':
        return 'قيد الانتظار';
      case 'Rejected':
        return 'مرفوض';
      case 'Converted':
        return 'محول لعقد';
      case 'Approved':
        return 'معتمد';
      case 'Cancelled':
        return 'ملغي';
      default:
        return status;
    }
  }

  protected getPaymentLabel(
    method: string,
    installments?: number | null,
  ): string {
    if (method === 'Cash') {
      return 'كاش';
    }
    if (installments && installments > 0) {
      return `أقساط - ${installments} شهري`;
    }
    return method;
  }

  protected getTotalItemsCount(): number {
    return (
      this.order()?.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0
    );
  }

  protected close(): void {
    this.onClose.emit();
  }
}
