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
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { DateArPipe } from '../../../../shared/pipes/date-ar.pipe';
import { RepsService } from '../../services/reps.service';
import { CommissionPayoutRow } from '../../models/rep.model';
import { CommonModule } from '@angular/common';
import { PrintService } from '../../../../core/services/print.service';
import { fetchAllPages } from '../../../../core/utils/api-list.util';

/**
 * Admin: paginated, name-searchable history of commission payouts
 * (`representatives/commission-payouts`).
 */
@Component({
  selector: 'app-commission-payouts-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, PaginationComponent, CurrencyArPipe, DateArPipe, CommonModule],
  templateUrl: './commission-payouts-modal.component.html',
})
export class CommissionPayoutsModalComponent {
  private readonly service = inject(RepsService);
  private readonly printer = inject(PrintService);

  readonly open = input.required<boolean>();
  readonly closed = output<void>();

  protected readonly rows = signal<CommissionPayoutRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly search = signal('');
  protected readonly pageIndex = signal(1);
  protected readonly pageSize = signal(10);
  protected readonly count = signal(0);
  protected readonly totalPages = signal(0);
  protected readonly isPrinting = signal(false);

  private debounce: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const search = this.search().trim();
      const pageIndex = this.pageIndex();
      const pageSize = this.pageSize();
      if (!this.open()) return;

      if (this.debounce) clearTimeout(this.debounce);
      this.debounce = setTimeout(
        () => this.fetch({ search, pageIndex, pageSize }),
        300,
      );
    });
  }

  private fetch(q: {
    search: string;
    pageIndex: number;
    pageSize: number;
  }): void {
    this.loading.set(true);
    this.service.commissionPayouts(q).subscribe({
      next: (res) => {
        this.rows.set(res.data ?? []);
        this.count.set(res.count ?? 0);
        this.totalPages.set(res.totalPages ?? 0);
        this.loading.set(false);
      },
      error: () => {
        this.rows.set([]);
        this.count.set(0);
        this.totalPages.set(0);
        this.loading.set(false);
      },
    });
  }

  protected onSearch(value: string): void {
    this.search.set(value);
    if (this.pageIndex() !== 1) this.pageIndex.set(1);
  }

  protected onPageChange(page: number): void {
    this.pageIndex.set(page);
  }

  protected onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.pageIndex.set(1);
  }

  protected printPayouts(): void {
    if (this.isPrinting()) return;
    this.isPrinting.set(true);
    const search = this.search().trim();

    fetchAllPages<CommissionPayoutRow>((pageIndex, pageSize) =>
      this.service.commissionPayouts({ search, pageIndex, pageSize }),
    ).subscribe({
      next: (rows) => {
        this.isPrinting.set(false);
        const total = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
        this.printer.print<CommissionPayoutRow>({
          title: 'سجل دفعات العمولات',
          subtitle: 'كل دفعات العمولات المسددة للمندوبين',
          meta: search ? [{ label: 'بحث', value: search }] : undefined,
          orientation: 'landscape',
          columns: [
            { key: 'voucherNumber',      header: 'رقم السند',  align: 'center', bold: true },
            { key: 'representativeName', header: 'المندوب',     align: 'start',  bold: true },
            { key: 'treasuryName',       header: 'الخزينة',     align: 'start' },
            { key: 'amount',             header: 'المبلغ',      align: 'end',    format: 'currency', bold: true },
            { key: 'date',               header: 'التاريخ',     align: 'center', format: 'shortDate' },
            { key: 'notes',              header: 'ملاحظات',    align: 'start' },
          ],
          totals: {
            label: 'إجمالي المسدد',
            labelColSpan: 3,
            cells: [
              `${Math.round(total).toLocaleString('ar-EG')} ج.م`,
              '',
              '',
            ],
          },
          rows,
        });
      },
      error: () => this.isPrinting.set(false),
    });
  }
}
