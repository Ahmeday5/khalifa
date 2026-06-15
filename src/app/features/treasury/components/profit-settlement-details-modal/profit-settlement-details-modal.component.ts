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
import { DecimalPipe } from '@angular/common';

import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { DateArPipe } from '../../../../shared/pipes/date-ar.pipe';
import { ApiError } from '../../../../core/models/api-response.model';
import { ToastService } from '../../../../core/services/toast.service';

import { ShareholdersService } from '../../services/shareholders.service';
import { ProfitSettlement } from '../../models/profit-settlement.model';

const VOUCHER_PREFIX_LEN = 18;

/**
 * Read-only details for one executed profit settlement.
 *
 *   <app-profit-settlement-details-modal
 *     [open]="detailsOpen()"
 *     [settlementId]="detailsId()"
 *     (closed)="closeDetails()" />
 *
 * Fetches the full record (header + per-shareholder lines with their issued
 * voucher numbers) whenever it opens with an id. Voucher numbers are 70+ chars,
 * so they're truncated in the table and copyable on click.
 */
@Component({
  selector: 'app-profit-settlement-details-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, ModalComponent, CurrencyArPipe, DateArPipe],
  templateUrl: './profit-settlement-details-modal.component.html',
  styleUrl: './profit-settlement-details-modal.component.scss',
})
export class ProfitSettlementDetailsModalComponent {
  // ── inputs ──
  readonly open = input.required<boolean>();
  readonly settlementId = input<number | null>(null);

  // ── outputs ──
  readonly closed = output<void>();

  // ── deps ──
  private readonly service = inject(ShareholdersService);
  private readonly toast = inject(ToastService);

  // ── state ──
  protected readonly settlement = signal<ProfitSettlement | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  // ── derived ──
  protected readonly lines = computed(() => this.settlement()?.lines ?? []);

  constructor() {
    effect(
      () => {
        const id = this.settlementId();
        if (!this.open() || id == null) return;
        this.load(id);
      },
      { allowSignalWrites: true },
    );
  }

  // ─────────── template handlers ───────────

  protected close(): void {
    this.closed.emit();
  }

  protected shortVoucher(value: string | undefined): string {
    if (!value) return '—';
    return value.length > VOUCHER_PREFIX_LEN
      ? `${value.slice(0, VOUCHER_PREFIX_LEN)}…`
      : value;
  }

  protected copyVoucher(value: string | undefined): void {
    if (!value) return;
    const clipboard = navigator.clipboard;
    if (clipboard?.writeText) {
      clipboard.writeText(value).then(
        () => this.toast.success('تم نسخ رقم السند'),
        () => this.toast.error('تعذّر النسخ'),
      );
    } else {
      this.toast.error('النسخ غير مدعوم في هذا المتصفح');
    }
  }

  // ─────────── internals ───────────

  private load(id: number): void {
    this.settlement.set(null);
    this.error.set(null);
    this.loading.set(true);
    this.service.getSettlement(id).subscribe({
      next: (settlement) => {
        this.settlement.set(settlement);
        this.loading.set(false);
      },
      error: (err: ApiError) => {
        this.loading.set(false);
        this.error.set(err.message || 'تعذّر تحميل تفاصيل التوزيع');
      },
    });
  }
}
