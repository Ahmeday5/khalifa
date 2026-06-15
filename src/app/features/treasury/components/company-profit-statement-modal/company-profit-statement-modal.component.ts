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

import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { DateArPipe } from '../../../../shared/pipes/date-ar.pipe';
import { ApiError } from '../../../../core/models/api-response.model';
import { ToastService } from '../../../../core/services/toast.service';

import { ShareholdersService } from '../../services/shareholders.service';
import {
  CompanyProfitEntry,
  CompanyProfitStatement,
  CompanyProfitStatementQuery,
  CompanyProfitVoucherType,
} from '../../models/company-profit-statement.model';
import {
  COMPANY_PROFIT_VOUCHER_BADGE,
  COMPANY_PROFIT_VOUCHER_LABELS,
  isCompanyProfitInflow,
  referenceTypeBadge,
  referenceTypeLabel,
} from '../../constants/company-profit-labels';

const DEFAULT_PAGE_SIZE = 10;
const VOUCHER_PREFIX_LEN = 18;

@Component({
  selector: 'app-company-profit-statement-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ModalComponent,
    PaginationComponent,
    BadgeComponent,
    CurrencyArPipe,
    DateArPipe,
  ],
  templateUrl: './company-profit-statement-modal.component.html',
  styleUrl: './company-profit-statement-modal.component.scss',
})
export class CompanyProfitStatementModalComponent {
  readonly open = input.required<boolean>();
  readonly closed = output<void>();

  private readonly service = inject(ShareholdersService);
  private readonly toast = inject(ToastService);

  protected readonly statement = signal<CompanyProfitStatement | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  // ── date filters ──
  protected readonly fromDate = signal('');
  protected readonly toDate = signal('');

  // ── pagination ──
  protected readonly pageIndex = signal(1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  protected readonly count = signal(0);
  protected readonly totalPages = signal(0);

  // ── derived ──
  protected readonly entries = computed(
    () => this.statement()?.entries.data ?? [],
  );

  protected readonly hasFilters = computed(
    () => !!this.fromDate() || !!this.toDate(),
  );

  private loaded = false;

  constructor() {
    effect(
      () => {
        if (!this.open()) return;
        if (this.loaded) return;
        this.loaded = true;
        this.fetch(1, this.pageSize(), false);
      },
      { allowSignalWrites: true },
    );
  }

  protected close(): void {
    this.closed.emit();
  }

  protected refresh(): void {
    this.fetch(this.pageIndex(), this.pageSize(), true);
  }

  protected applyDates(): void {
    this.pageIndex.set(1);
    this.fetch(1, this.pageSize(), true);
  }

  protected clearDates(): void {
    this.fromDate.set('');
    this.toDate.set('');
    this.pageIndex.set(1);
    this.fetch(1, this.pageSize(), true);
  }

  protected onPageChange(page: number): void {
    this.pageIndex.set(page);
    this.fetch(page, this.pageSize(), false);
  }

  protected onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.pageIndex.set(1);
    this.fetch(1, size, false);
  }

  protected voucherLabel(type: CompanyProfitVoucherType): string {
    return COMPANY_PROFIT_VOUCHER_LABELS[type] ?? type;
  }

  protected voucherBadge(type: CompanyProfitVoucherType) {
    return COMPANY_PROFIT_VOUCHER_BADGE[type] ?? 'info';
  }

  protected refLabel(type: string): string {
    return referenceTypeLabel(type);
  }

  protected refBadge(type: string) {
    return referenceTypeBadge(type);
  }

  protected isInflow(type: CompanyProfitVoucherType): boolean {
    return isCompanyProfitInflow(type);
  }

  private fetch(pageIndex: number, pageSize: number, force: boolean): void {
    this.loading.set(true);
    this.error.set(null);

    const query: CompanyProfitStatementQuery = {
      pageIndex,
      pageSize,
      fromDate: this.fromDate() || undefined,
      toDate: this.toDate() || undefined,
    };

    const stream$ = force
      ? this.service.refreshCompanyProfitStatement(query)
      : this.service.getCompanyProfitStatement(query);

    stream$.subscribe({
      next: (res) => {
        this.statement.set(res);
        this.count.set(res.entries.count ?? 0);
        this.totalPages.set(res.entries.totalPages ?? 0);
        this.loading.set(false);
      },
      error: (err: ApiError) => {
        this.statement.set(null);
        this.count.set(0);
        this.totalPages.set(0);
        this.error.set(err?.message || 'تعذّر تحميل كشف الحساب');
        this.loading.set(false);
        this.toast.error(err?.message || 'تعذّر تحميل كشف الحساب');
      },
    });
  }
}
