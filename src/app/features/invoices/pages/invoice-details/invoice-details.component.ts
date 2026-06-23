import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { ApiError } from '../../../../core/models/api-response.model';
import { ToastService } from '../../../../core/services/toast.service';
import { InvoicesService } from '../../services/invoices.service';
import {
  PURCHASE_INVOICE_STATUS_VIEW,
  PurchaseInvoice,
  PurchaseInvoiceStatusView,
} from '../../models/invoice.model';
import { ConfirmInvoiceModalComponent } from '../../components/confirm-invoice-modal/confirm-invoice-modal.component';
import { PayInvoiceModalComponent } from '../../components/pay-invoice-modal/pay-invoice-modal.component';
import { ReturnInvoiceModalComponent } from '../../components/return-invoice-modal/return-invoice-modal.component';

/**
 * Standalone invoice details / preview page.
 *
 *   /invoices/:id  →  full document view, print-ready
 *
 * Lives outside the tabbed shell because the print view shouldn't
 * carry the list/new chrome. From here the user can print, return to
 * the list, or — if the invoice is still a Draft — open the confirm
 * modal to attach a treasury and finalize it.
 */
@Component({
  selector: 'app-invoice-details',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DecimalPipe,
    CurrencyArPipe,
    ConfirmInvoiceModalComponent,
    PayInvoiceModalComponent,
    ReturnInvoiceModalComponent,
  ],
  templateUrl: './invoice-details.component.html',
  styleUrl: './invoice-details.component.scss',
})
export class InvoiceDetailsComponent implements OnInit {
  private readonly route   = inject(ActivatedRoute);
  private readonly router  = inject(Router);
  private readonly svc     = inject(InvoicesService);
  private readonly toast   = inject(ToastService);

  // ── data ──
  protected readonly invoice    = signal<PurchaseInvoice | null>(null);
  protected readonly loading    = signal(false);
  protected readonly notFound   = signal(false);

  // ── confirm modal ──
  protected readonly confirmOpen = signal(false);

  // ── payment modal ──
  protected readonly paymentOpen = signal(false);

  // ── return modal ──
  protected readonly returnOpen = signal(false);

  // ── derived ──
  protected readonly status = computed<PurchaseInvoiceStatusView | null>(() => {
    const inv = this.invoice();
    if (!inv) return null;
    return PURCHASE_INVOICE_STATUS_VIEW[inv.status] ?? {
      label: inv.status,
      variant: 'info',
    };
  });

  protected readonly canConfirm = computed(
    () => this.invoice()?.status === 'Draft',
  );

  protected readonly canPay = computed(() => {
    const inv = this.invoice();
    if (!inv) return false;
    return (
      (inv.remainingAmount ?? 0) > 0 &&
      inv.status !== 'Draft' &&
      inv.status !== 'Cancelled'
    );
  });

  /** إرجاع الفاتورة متاح فقط قبل تسجيل أي دفعة وقبل إلغائها. */
  protected readonly canReturn = computed(() => {
    const inv = this.invoice();
    if (!inv) return false;
    return inv.status !== 'Cancelled' && (inv.paidAmount ?? 0) === 0;
  });

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = Number(idParam);
    if (!idParam || Number.isNaN(id) || id <= 0) {
      this.notFound.set(true);
      return;
    }
    this.fetch(id);
  }

  // ─────────── data ───────────

  private fetch(id: number): void {
    this.loading.set(true);
    this.notFound.set(false);
    this.svc.getById(id).subscribe({
      next: (inv) => {
        this.invoice.set(inv);
        this.loading.set(false);
      },
      error: (err: ApiError) => {
        this.loading.set(false);
        if (err.status === 404) {
          this.notFound.set(true);
        } else {
          this.toast.error(err.message || 'تعذّر تحميل بيانات الفاتورة');
        }
      },
    });
  }

  // ─────────── confirm ───────────

  protected openConfirm(): void {
    if (!this.canConfirm()) return;
    this.confirmOpen.set(true);
  }

  protected closeConfirm(): void {
    this.confirmOpen.set(false);
  }

  protected onConfirmed(updated: PurchaseInvoice): void {
    this.confirmOpen.set(false);
    this.invoice.set(updated);
    this.toast.success(`تم تأكيد الفاتورة ${updated.invoiceNumber}`);
  }

  // ─────────── payment ───────────

  protected openPayment(): void {
    if (!this.canPay()) return;
    this.paymentOpen.set(true);
  }

  protected closePayment(): void {
    this.paymentOpen.set(false);
  }

  protected onPaid(updated: PurchaseInvoice): void {
    this.paymentOpen.set(false);
    this.invoice.set(updated);
  }

  // ─────────── return ───────────

  protected openReturn(): void {
    if (!this.canReturn()) return;
    this.returnOpen.set(true);
  }

  protected closeReturn(): void {
    this.returnOpen.set(false);
  }

  protected onInvoiceReturned(): void {
    this.returnOpen.set(false);
    this.router.navigate(['/invoices/list']);
  }

  // ─────────── print ───────────

  protected print(): void {
    if (typeof window === 'undefined') return;
    window.print();
  }

  // ─────────── nav ───────────

  protected goToList(): void {
    this.router.navigate(['/invoices/list']);
  }

  // ─────────── view helpers ───────────

  protected formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  protected lineDiscountAmount(line: {
    quantity: number;
    unitPrice: number;
    discountPercent: number;
  }): number {
    const gross = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
    return gross * ((Number(line.discountPercent) || 0) / 100);
  }
}
