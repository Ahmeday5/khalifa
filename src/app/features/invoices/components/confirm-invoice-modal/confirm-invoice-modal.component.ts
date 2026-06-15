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
import { TreasuryService } from '../../../treasury/services/treasury.service';
import { LookupItem } from '../../../../core/models/lookup.model';
import {
  ConfirmPurchaseInvoicePayload,
  PurchaseInvoice,
  PurchaseInvoiceListItem,
} from '../../models/invoice.model';
import { InvoicesService } from '../../services/invoices.service';

/**
 * Captures the treasury that funds the `paidAmount` portion of a Draft
 * invoice and finalizes it on the server.
 *
 *   <app-confirm-invoice-modal
 *     [open]="confirmOpen()"
 *     [invoice]="confirmTarget()"
 *     (closed)="closeConfirm()"
 *     (confirmed)="onConfirmed($event)" />
 *
 * Accepts both the lite list shape and the full invoice shape, so the
 * caller can pass whichever it has on hand.
 */
@Component({
  selector: 'app-confirm-invoice-modal',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    ModalComponent,
    FormErrorComponent,
    CurrencyArPipe,
  ],
  templateUrl: './confirm-invoice-modal.component.html',
  styleUrl: './confirm-invoice-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmInvoiceModalComponent {
  // ── inputs ──
  readonly open = input.required<boolean>();
  readonly invoice = input<PurchaseInvoiceListItem | PurchaseInvoice | null>(null);

  // ── outputs ──
  readonly closed = output<void>();
  readonly confirmed = output<PurchaseInvoice>();

  // ── deps ──
  private readonly fb = inject(FormBuilder);
  private readonly invoicesService = inject(InvoicesService);
  private readonly treasuryService = inject(TreasuryService);
  private readonly toast = inject(ToastService);

  // ── state ──
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly treasuries = signal<LookupItem[]>([]);
  protected readonly loadingTreasuries = signal(false);
  /** Full invoice (with `treasuryId`) — fetched lazily so the modal can
   *  pre-select whatever treasury the user already chose at create-time. */
  protected readonly fullInvoice = signal<PurchaseInvoice | null>(null);
  protected readonly loadingInvoice = signal(false);

  /** Lookup is already active-only + role-scoped server-side. */
  protected readonly activeTreasuries = computed(() => this.treasuries());

  protected readonly title = 'تأكيد الفاتورة';

  protected readonly form = this.fb.nonNullable.group({
    treasuryId: [0, [Validators.required, Validators.min(1)]],
  });

  constructor() {
    effect(
      () => {
        if (!this.open()) return;
        this.serverError.set(null);
        this.submitting.set(false);
        this.fullInvoice.set(null);
        this.form.reset({ treasuryId: 0 });
        this.loadTreasuriesIfNeeded();
        this.preselectTreasury();
      },
      { allowSignalWrites: true },
    );
  }

  // ─────────────── template handlers ───────────────

  protected onSubmit(): void {
    if (this.submitting()) return;

    const inv = this.invoice();
    if (!inv) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const payload: ConfirmPurchaseInvoicePayload = {
      treasuryId: Number(this.form.controls.treasuryId.value),
    };

    this.serverError.set(null);
    this.submitting.set(true);

    this.invoicesService.confirm(inv.id, payload).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.toast.success(`تم تأكيد فاتورة ${inv.invoiceNumber}`);
        this.confirmed.emit(res);
      },
      error: (err: ApiError) => {
        this.submitting.set(false);
        this.serverError.set(
          err.message || 'تعذّر تأكيد الفاتورة — حاول مرة أخرى',
        );
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

  // ─────────────── internals ───────────────

  private loadTreasuriesIfNeeded(): void {
    if (this.treasuries().length > 0) return;
    this.loadingTreasuries.set(true);
    this.treasuryService.lookup().subscribe({
      next: (list) => {
        this.treasuries.set(list ?? []);
        this.loadingTreasuries.set(false);
      },
      error: () => {
        this.treasuries.set([]);
        this.loadingTreasuries.set(false);
      },
    });
  }

  /**
   * Pre-fill the treasury picker with whatever the invoice was created
   * with. The list-shape (`PurchaseInvoiceListItem`) doesn't carry
   * `treasuryId`, so we fetch the full invoice when needed.
   */
  private preselectTreasury(): void {
    const inv = this.invoice();
    if (!inv) return;

    const fromInput = (inv as PurchaseInvoice).treasuryId;
    if (fromInput) {
      this.form.controls.treasuryId.setValue(fromInput);
      return;
    }

    // List-item shape — fetch the full invoice to get the treasuryId.
    this.loadingInvoice.set(true);
    this.invoicesService.getById(inv.id).subscribe({
      next: (full) => {
        this.fullInvoice.set(full);
        if (full.treasuryId) {
          this.form.controls.treasuryId.setValue(full.treasuryId);
        }
        this.loadingInvoice.set(false);
      },
      error: () => this.loadingInvoice.set(false),
    });
  }
}
