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
import {
  SearchableSelectComponent,
  SearchableSelectOption,
} from '../../../../shared/components/searchable-select/searchable-select.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { ApiError } from '../../../../core/models/api-response.model';
import { ToastService } from '../../../../core/services/toast.service';
import { LookupItem } from '../../../../core/models/lookup.model';

import { TreasuryService } from '../../../treasury/services/treasury.service';
import { InvoicesService } from '../../services/invoices.service';
import {
  PurchaseInvoice,
  PurchaseInvoiceListItem,
} from '../../models/invoice.model';

/**
 * Partial / full payment dialog for a non-Draft purchase invoice.
 *
 *   <app-pay-invoice-modal
 *     [open]="paymentOpen()"
 *     [invoice]="paymentTarget()"
 *     (closed)="closePayment()"
 *     (paid)="onPaid($event)" />
 *
 * Accepts either the lite list shape or the full invoice shape.
 * Amount defaults to the full remaining balance; the user can reduce it
 * for a partial payment. Client-side cap prevents over-payment submission.
 * Server may still reject for insufficient treasury balance — shown inline.
 */
@Component({
  selector: 'app-pay-invoice-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ModalComponent,
    FormErrorComponent,
    SearchableSelectComponent,
    CurrencyArPipe,
  ],
  templateUrl: './pay-invoice-modal.component.html',
  styleUrl: './pay-invoice-modal.component.scss',
})
export class PayInvoiceModalComponent {
  // ── inputs ──
  readonly open = input.required<boolean>();
  readonly invoice = input<PurchaseInvoiceListItem | PurchaseInvoice | null>(null);

  // ── outputs ──
  readonly closed = output<void>();
  readonly paid = output<PurchaseInvoice>();

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
  protected readonly draftAmount = signal(0);

  // ── derived ──
  protected readonly remaining = computed(
    () => this.invoice()?.remainingAmount ?? 0,
  );

  protected readonly projectedRemaining = computed(() =>
    Math.max(0, this.remaining() - this.draftAmount()),
  );

  protected readonly amountExceedsRemaining = computed(
    () => this.draftAmount() > this.remaining() + 1e-9,
  );

  protected readonly treasuryOptions = computed<SearchableSelectOption[]>(() =>
    this.treasuries().map((t) => ({ value: t.id, label: t.name })),
  );

  // ── form ──
  protected readonly form = this.fb.nonNullable.group({
    treasuryId: this.fb.control<number | null>(null, [Validators.required]),
    amount: [0, [Validators.required, Validators.min(0.01)]],
    paymentDate: [this.todayISO(), [Validators.required]],
    notes: [''],
  });

  constructor() {
    effect(
      () => {
        const inv = this.invoice();
        if (!this.open() || !inv) return;
        const remaining = inv.remainingAmount ?? 0;
        this.serverError.set(null);
        this.submitting.set(false);
        this.draftAmount.set(remaining);
        this.form.reset({
          treasuryId: null,
          amount: remaining,
          paymentDate: this.todayISO(),
          notes: '',
        });
        this.loadTreasuries();
      },
      { allowSignalWrites: true },
    );
  }

  // ─────────── template handlers ───────────

  protected onAmountChange(value: string): void {
    this.draftAmount.set(Number(value) || 0);
  }

  /** Pre-fills the amount with the full outstanding balance. */
  protected useFullRemaining(): void {
    const amount = Number(this.remaining().toFixed(2));
    this.form.controls.amount.setValue(amount);
    this.draftAmount.set(amount);
  }

  protected onSubmit(): void {
    if (this.submitting()) return;
    const inv = this.invoice();
    if (!inv) return;

    if (this.form.invalid || this.amountExceedsRemaining()) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    this.serverError.set(null);
    this.submitting.set(true);

    this.invoicesService
      .pay(inv.id, {
        treasuryId: Number(raw.treasuryId),
        amount: Number(raw.amount),
        paymentDate: raw.paymentDate,
        notes: (raw.notes ?? '').trim(),
      })
      .subscribe({
        next: (updated) => {
          this.submitting.set(false);
          this.toast.success(
            updated.remainingAmount <= 0
              ? `تم سداد فاتورة ${updated.invoiceNumber} بالكامل`
              : `تم تسجيل دفعة بمبلغ ${Number(raw.amount).toLocaleString('ar-EG')} ج.م على فاتورة ${updated.invoiceNumber}`,
          );
          this.paid.emit(updated);
        },
        error: (err: ApiError) => {
          this.submitting.set(false);
          this.serverError.set(err.message || 'تعذّر تسجيل الدفعة');
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

  private loadTreasuries(): void {
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

  private todayISO(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
