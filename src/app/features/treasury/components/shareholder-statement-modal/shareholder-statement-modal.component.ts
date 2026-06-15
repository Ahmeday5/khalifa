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
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { DateArPipe } from '../../../../shared/pipes/date-ar.pipe';
import { ApiError } from '../../../../core/models/api-response.model';
import { ToastService } from '../../../../core/services/toast.service';

import { ShareholdersService } from '../../services/shareholders.service';
import { Shareholder } from '../../models/shareholder.model';
import {
  ShareholderStatement,
  StatementQuery,
  StatementTransactionType,
} from '../../models/shareholder-statement.model';
import {
  STATEMENT_TX_BADGE,
  STATEMENT_TX_LABELS,
  isStatementInflow,
} from '../../constants/statement-transaction-labels';

const DEFAULT_PAGE_SIZE = 10;
const VOUCHER_PREFIX_LEN = 18;

@Component({
  selector: 'app-shareholder-statement-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    ModalComponent,
    PaginationComponent,
    BadgeComponent,
    CurrencyArPipe,
    DateArPipe,
  ],
  templateUrl: './shareholder-statement-modal.component.html',
  styleUrl: './shareholder-statement-modal.component.scss',
})
export class ShareholderStatementModalComponent {
  readonly open = input.required<boolean>();
  readonly shareholder = input<Shareholder | null>(null);
  readonly closed = output<void>();

  private readonly service = inject(ShareholdersService);
  private readonly toast = inject(ToastService);

  protected readonly statement = signal<ShareholderStatement | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  // ── date filters (UI state — applied on explicit click) ──
  protected readonly fromDate = signal('');
  protected readonly toDate = signal('');

  // ── pagination ──
  protected readonly pageIndex = signal(1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  protected readonly count = signal(0);
  protected readonly totalPages = signal(0);

  // ── derived ──
  protected readonly title = computed(() => {
    const sh = this.shareholder();
    return sh ? `كشف حساب — ${sh.name}` : 'كشف حساب مساهم';
  });

  protected readonly entries = computed(
    () => this.statement()?.entries.data ?? [],
  );

  protected readonly hasFilters = computed(
    () => !!this.fromDate() || !!this.toDate(),
  );

  private lastShId: number | null = null;

  constructor() {
    effect(
      () => {
        const sh = this.shareholder();
        if (!this.open() || !sh) return;
        if (sh.id === this.lastShId) return;
        this.lastShId = sh.id;
        this.statement.set(null);
        this.error.set(null);
        this.fromDate.set('');
        this.toDate.set('');
        this.pageIndex.set(1);
        this.fetch(sh.id, 1, this.pageSize(), false);
      },
      { allowSignalWrites: true },
    );
  }

  protected close(): void {
    this.closed.emit();
  }

  protected refresh(): void {
    const sh = this.shareholder();
    if (!sh) return;
    this.fetch(sh.id, this.pageIndex(), this.pageSize(), true);
  }

  protected applyDates(): void {
    const sh = this.shareholder();
    if (!sh) return;
    this.pageIndex.set(1);
    this.fetch(sh.id, 1, this.pageSize(), true);
  }

  protected clearDates(): void {
    this.fromDate.set('');
    this.toDate.set('');
    const sh = this.shareholder();
    if (!sh) return;
    this.pageIndex.set(1);
    this.fetch(sh.id, 1, this.pageSize(), true);
  }

  protected onPageChange(page: number): void {
    this.pageIndex.set(page);
    const sh = this.shareholder();
    if (sh) this.fetch(sh.id, page, this.pageSize(), false);
  }

  protected onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.pageIndex.set(1);
    const sh = this.shareholder();
    if (sh) this.fetch(sh.id, 1, size, false);
  }

  protected txLabel(type: StatementTransactionType): string {
    return STATEMENT_TX_LABELS[type] ?? type;
  }

  protected txBadge(type: StatementTransactionType) {
    return STATEMENT_TX_BADGE[type] ?? 'info';
  }

  protected isInflow(type: StatementTransactionType): boolean {
    return isStatementInflow(type);
  }

  protected shortVoucher(value: string | undefined): string {
    if (!value) return '—';
    return value.length > VOUCHER_PREFIX_LEN
      ? `${value.slice(0, VOUCHER_PREFIX_LEN)}…`
      : value;
  }

  private fetch(
    shId: number,
    pageIndex: number,
    pageSize: number,
    force: boolean,
  ): void {
    this.loading.set(true);
    this.error.set(null);

    const query: StatementQuery = {
      pageIndex,
      pageSize,
      fromDate: this.fromDate() || undefined,
      toDate: this.toDate() || undefined,
    };

    const stream$ = force
      ? this.service.refreshStatement(shId, query)
      : this.service.getStatement(shId, query);

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
