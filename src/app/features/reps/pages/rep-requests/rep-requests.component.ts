import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { RepsService } from '../../services/reps.service';
import { RepRequest } from '../../models/rep-request.model';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { ApiError } from '../../../../core/models/api-response.model';
import { ToastService } from '../../../../core/services/toast.service';
import { HttpCacheService } from '../../../../core/services/http-cache.service';
import { onInvalidate } from '../../../../core/utils/auto-refresh.util';

const DEFAULT_PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

@Component({
  selector: 'app-rep-requests',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PaginationComponent],
  templateUrl: './rep-requests.component.html',
  styleUrl: './rep-requests.component.scss',
})
export class RepRequestsComponent {
  private readonly service = inject(RepsService);
  private readonly toast = inject(ToastService);
  private readonly cache = inject(HttpCacheService);

  // ── state ──
  protected readonly rows = signal<RepRequest[]>([]);
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

  constructor() {
    effect(() => {
      const trigger = this.fetchTrigger();
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.fetch(trigger), SEARCH_DEBOUNCE_MS);
    });

    onInvalidate(this.cache, 'representatives', () => this.refresh());
  }

  // ── data ──

  private fetch(
    trigger: { search: string; pageIndex: number; pageSize: number },
    force = false,
  ): void {
    this.loading.set(true);
    const stream$ = force
      ? this.service.refreshRequests(trigger)
      : this.service.requests(trigger);

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
        this.toast.error(err?.message || 'تعذّر تحميل الطلبيات');
      },
    });
  }

  protected refresh(): void {
    this.fetch(this.fetchTrigger(), true);
  }

  // ── filter handlers ──

  protected onSearch(value: string): void {
    this.searchTerm.set(value);
    if (this.pageIndex() !== 1) this.pageIndex.set(1);
  }

  protected clearSearch(): void {
    if (!this.searchTerm()) return;
    this.searchTerm.set('');
    this.pageIndex.set(1);
  }

  protected onPageChange(page: number): void {
    this.pageIndex.set(page);
  }

  protected onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.pageIndex.set(1);
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

  protected formatTime(value: string | null | undefined): string {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  }
}
