import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { CustomersService } from '../../services/customers.service';
import { PendingDownPaymentClientRow } from '../../models/pending-down-payments.model';
import { DownPaymentCollectModalComponent } from '../../components/down-payment-collect-modal/down-payment-collect-modal.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { ApiError } from '../../../../core/models/api-response.model';
import { ToastService } from '../../../../core/services/toast.service';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { HttpCacheService } from '../../../../core/services/http-cache.service';
import { onInvalidate } from '../../../../core/utils/auto-refresh.util';

const DEFAULT_PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

@Component({
  selector: 'app-pending-down-payments',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, PaginationComponent, CurrencyArPipe, DownPaymentCollectModalComponent],
  templateUrl: './pending-down-payments.component.html',
  styleUrl: './pending-down-payments.component.scss',
})
export class PendingDownPaymentsComponent {
  private readonly customersService = inject(CustomersService);
  private readonly toast = inject(ToastService);
  private readonly cache = inject(HttpCacheService);

  // ── state ──
  protected readonly rows = signal<PendingDownPaymentClientRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly count = signal(0);
  protected readonly totalPages = signal(0);

  // ── filters ──
  protected readonly searchTerm = signal('');
  protected readonly pageIndex = signal(1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);

  protected readonly hasFilters = computed(() => this.searchTerm().length > 0);

  private readonly fetchTrigger = computed(() => ({
    search: this.searchTerm().trim(),
    pageIndex: this.pageIndex(),
    pageSize: this.pageSize(),
  }));

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // ── collect modal ──
  protected readonly collectOpen = signal(false);
  protected readonly collectContractId = signal<number | null>(null);
  protected readonly collectContractCode = signal<string | null>(null);
  protected readonly collectAmount = signal(0);

  constructor() {
    this.fetch(this.fetchTrigger());

    onInvalidate(this.cache, 'client', () => this.refresh());
    onInvalidate(this.cache, 'payment', () => this.refresh());
    onInvalidate(this.cache, 'contract', () => this.refresh());
  }

  // ── data ──

  private fetch(
    trigger: { search: string; pageIndex: number; pageSize: number },
    force = false,
  ): void {
    this.loading.set(true);
    const stream$ = force
      ? this.customersService.refreshPendingDownPayments(trigger)
      : this.customersService.pendingDownPayments(trigger);

    stream$.subscribe({
      next: (page) => {
        this.rows.set(page?.data ?? []);
        this.count.set(page?.count ?? 0);
        this.totalPages.set(page?.totalPages ?? 0);
        this.loading.set(false);
      },
      error: (err: ApiError) => {
        this.rows.set([]);
        this.count.set(0);
        this.totalPages.set(0);
        this.loading.set(false);
        this.toast.error(apiErrorToMessage(err, 'تعذّر تحميل المقدمات المعلقة'));
      },
    });
  }

  protected refresh(): void {
    this.fetch(this.fetchTrigger(), true);
  }

  // ── filter handlers ──

  protected onSearch(value: string): void {
    this.searchTerm.set(value);
    this.pageIndex.set(1);
    this.debouncedFetch();
  }

  protected clearSearch(): void {
    if (!this.searchTerm()) return;
    this.searchTerm.set('');
    this.pageIndex.set(1);
    this.debouncedFetch();
  }

  protected onPageChange(page: number): void {
    this.pageIndex.set(page);
    this.fetch(this.fetchTrigger());
  }

  protected onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.pageIndex.set(1);
    this.fetch(this.fetchTrigger());
  }

  private debouncedFetch(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(
      () => this.fetch(this.fetchTrigger()),
      SEARCH_DEBOUNCE_MS,
    );
  }

  // ── collect modal handlers ──

  protected openCollect(
    contractId: number,
    contractCode: string | null,
    amount: number,
  ): void {
    this.collectContractId.set(contractId);
    this.collectContractCode.set(contractCode);
    this.collectAmount.set(amount);
    this.collectOpen.set(true);
  }

  protected closeCollect(): void {
    this.collectOpen.set(false);
  }

  protected onCollected(): void {
    this.collectOpen.set(false);
    this.refresh();
  }

  // ── view helpers ──

  protected formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }
}
