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
import { RepStatementViewComponent } from '../rep-statement-view/rep-statement-view.component';
import { RepsService } from '../../services/reps.service';
import {
  RepresentativeStatement,
  RepStatementContractRow,
} from '../../models/rep.model';
import { CommonModule } from '@angular/common';
import { map } from 'rxjs/operators';
import { PrintService } from '../../../../core/services/print.service';
import { fetchAllPages } from '../../../../core/utils/api-list.util';

/**
 * Admin-facing wrapper that loads a specific representative's account
 * statement (`representatives/{id}/statement`) and renders it through the
 * shared {@link RepStatementViewComponent}. Paging is owned here so the
 * presentational view stays a pure projection.
 */
@Component({
  selector: 'app-rep-statement-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, RepStatementViewComponent, CommonModule],
  template: `
    <app-modal
      [open]="open()"
      [title]="'كشف حساب المندوب' + (representativeName() ? ' — ' + representativeName() : '')"
      size="xl"
      (closed)="closed.emit()"
    >
      <app-rep-statement-view
        [statement]="statement()"
        [loading]="loading()"
        [pageIndex]="pageIndex()"
        [pageSize]="pageSize()"
        (pageChange)="pageIndex.set($event)"
        (pageSizeChange)="onPageSize($event)"
      />

      <ng-container modal-footer>
        <button type="button" class="btn" (click)="closed.emit()">إغلاق</button>
        <button
          type="button"
          class="btn btn-bl d-inline-flex align-items-center gap-1"
          [disabled]="!statement() || loading() || isPrinting()"
          (click)="printStatement()"
          title="طباعة"
        >
          @if (isPrinting()) {
            <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
          }
          <span>🖨 طباعة PDF</span>
        </button>
      </ng-container>
    </app-modal>
  `,
})
export class RepStatementModalComponent {
  private readonly service = inject(RepsService);
  private readonly printer = inject(PrintService);

  readonly open = input.required<boolean>();
  readonly representativeId = input<number | null>(null);
  readonly representativeName = input<string>('');

  readonly closed = output<void>();

  protected readonly statement = signal<RepresentativeStatement | null>(null);
  protected readonly loading = signal(false);
  protected readonly pageIndex = signal(1);
  protected readonly pageSize = signal(10);
  protected readonly isPrinting = signal(false);

  constructor() {
    // Reset paging whenever a different representative is opened.
    effect(
      () => {
        this.representativeId();
        this.pageIndex.set(1);
        this.statement.set(null);
      },
      { allowSignalWrites: true },
    );

    // Fetch on open + whenever the page/size/representative changes.
    effect(
      () => {
        const id = this.representativeId();
        const pageIndex = this.pageIndex();
        const pageSize = this.pageSize();
        if (!this.open() || id == null) return;

        this.loading.set(true);
        this.service.statement(id, { pageIndex, pageSize }).subscribe({
          next: (res) => {
            this.statement.set(res);
            this.loading.set(false);
          },
          error: () => {
            this.statement.set(null);
            this.loading.set(false);
          },
        });
      },
      { allowSignalWrites: true },
    );
  }

  protected onPageSize(size: number): void {
    this.pageSize.set(size);
    this.pageIndex.set(1);
  }

  /**
   * Exports the full statement (not just the current page) as PDF via the
   * unified {@link PrintService}. We fetch every contract row from the server
   * so the printed document is consistent regardless of the active page size.
   */
  protected printStatement(): void {
    const id = this.representativeId();
    if (id == null || this.isPrinting()) return;
    this.isPrinting.set(true);

    // The statement endpoint wraps the contract rows inside a PagedResponse
    // field (`data.contracts`), so we adapt it to fetchAllPages' shape.
    fetchAllPages<RepStatementContractRow>((pageIndex, pageSize) =>
      this.service
        .statement(id, { pageIndex, pageSize })
        .pipe(map((res) => res.contracts)),
    ).subscribe({
      next: (rows) => this.dispatchPrint(rows),
      error: () => this.isPrinting.set(false),
    });
  }

  private dispatchPrint(rows: RepStatementContractRow[]): void {
    const snap = this.statement();
    const rep = snap?.representative;
    const sum = snap?.summary;

    const meta: Array<{ label: string; value: string }> = [];
    if (rep) {
      meta.push({ label: 'المندوب', value: rep.fullName });
      if (rep.phoneNumber) meta.push({ label: 'الهاتف', value: rep.phoneNumber });
      meta.push({ label: 'نسبة الربح', value: `${rep.profitRatePercent}%` });
    }
    if (sum?.firstContractDate && sum?.lastContractDate) {
      meta.push({
        label: 'الفترة',
        value: `${this.fmtDate(sum.firstContractDate)} → ${this.fmtDate(sum.lastContractDate)}`,
      });
    }

    this.printer.print<RepStatementContractRow>({
      title: 'كشف حساب المندوب',
      subtitle: rep ? rep.fullName : undefined,
      meta,
      orientation: 'landscape',
      columns: [
        { key: 'contractId',   header: 'العقد',     align: 'center', width: '52px', format: (v) => `#${v}` },
        { key: 'clientName',   header: 'العميل',    align: 'start',  bold: true },
        { key: 'productName',  header: 'المنتج',    align: 'start' },
        { key: 'quantity',     header: 'الكمية',    align: 'center', format: 'number' },
        { key: 'cashPrice',    header: 'سعر النقد', align: 'end',    format: 'currency' },
        { key: 'saleAmount',   header: 'سعر البيع', align: 'end',    format: 'currency', bold: true },
        { key: 'cost',         header: 'التكلفة',  align: 'end',    format: 'currency' },
        { key: 'profit',       header: 'الربح',    align: 'end',    format: 'currency', bold: true },
        { key: 'commission',   header: 'العمولة',  align: 'end',    format: 'currency' },
        { key: 'status',       header: 'الحالة',   align: 'center' },
        { key: 'dateOfSale', header: 'تاريخ البيع', align: 'center', format: 'shortDate' },
      ],
      totals: sum
        ? {
            label: 'الإجمالي',
            labelColSpan: 5,
            cells: [
              null,
              this.fmtCurrency(sum.totalSales),
              this.fmtCurrency(sum.totalCost),
              this.fmtCurrency(sum.totalProfit),
              this.fmtCurrency(sum.totalCommission),
              null,
              null,
            ],
          }
        : undefined,
      rows,
    });

    this.isPrinting.set(false);
  }

  private fmtCurrency(value: number): string {
    return `${Math.round(value ?? 0).toLocaleString('ar-EG')} ج.م`;
  }

  private fmtDate(iso: string): string {
    const d = new Date(iso);
    return isNaN(d.getTime())
      ? '—'
      : `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  }
}
