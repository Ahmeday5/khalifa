import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

/**
 * Reusable, accessible pagination control.
 *
 *   <app-pagination
 *     [pageIndex]="pageIndex()"
 *     [pageSize]="pageSize()"
 *     [count]="count()"
 *     [totalPages]="totalPages()"
 *     [pageSizeOptions]="[10, 25, 50, 100]"
 *     (pageChange)="onPageChange($event)"
 *     (pageSizeChange)="onPageSizeChange($event)" />
 *
 * Conventions:
 *   - `pageIndex` is **1-based** to match the backend's `pageIndex` query.
 *   - `count` is the total number of records across all pages.
 *   - The component renders nothing useful when `count === 0`, but stays
 *     in the layout so the page footer doesn't reflow when results clear.
 *
 * The page-number window keeps the current page centered with up to 5
 * numeric buttons (e.g. `1 … 4 5 [6] 7 8 … 20`), with first/last anchors
 * and ellipses on either side when the range is wider than the window.
 */
export interface PageWindowItem {
  /** Either a numeric page index (1-based) or `null` for an ellipsis. */
  page: number | null;
  /** True when this item is the currently-active page. */
  active: boolean;
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const WINDOW_SIZE = 5;

@Component({
  selector: 'app-pagination',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pagination.component.html',
  styleUrl: './pagination.component.scss',
})
export class PaginationComponent {
  // ── inputs ──
  readonly pageIndex = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly count = input.required<number>();
  readonly totalPages = input.required<number>();
  readonly pageSizeOptions = input<readonly number[]>(DEFAULT_PAGE_SIZE_OPTIONS);
  /** Hide the page-size selector when the caller wants a fixed size. */
  readonly showPageSize = input<boolean>(true);
  /** Disabled while a fetch is in flight. */
  readonly disabled = input<boolean>(false);

  // ── outputs ──
  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();

  // ── derived ──

  /** First record index displayed on this page (1-based, inclusive). */
  protected readonly fromIndex = computed(() => {
    const total = this.count();
    if (total === 0) return 0;
    return (this.pageIndex() - 1) * this.pageSize() + 1;
  });

  /** Last record index displayed on this page (1-based, inclusive). */
  protected readonly toIndex = computed(() =>
    Math.min(this.pageIndex() * this.pageSize(), this.count()),
  );

  protected readonly canPrev = computed(() => this.pageIndex() > 1);
  protected readonly canNext = computed(
    () => this.pageIndex() < this.totalPages(),
  );

  /**
   * Builds the visible page-number window around the current page,
   * with ellipses + first/last anchors as needed.
   */
  protected readonly windowItems = computed<PageWindowItem[]>(() => {
    const total = this.totalPages();
    const current = this.pageIndex();
    if (total <= 0) return [];
    if (total <= WINDOW_SIZE + 2) {
      return Array.from({ length: total }, (_, i) => ({
        page: i + 1,
        active: i + 1 === current,
      }));
    }

    const half = Math.floor(WINDOW_SIZE / 2);
    let start = Math.max(2, current - half);
    let end = Math.min(total - 1, current + half);

    // Pad the window to keep WINDOW_SIZE buttons in view when near edges.
    if (current - half < 2) end = Math.min(total - 1, start + WINDOW_SIZE - 1);
    if (current + half > total - 1) start = Math.max(2, end - WINDOW_SIZE + 1);

    const items: PageWindowItem[] = [{ page: 1, active: current === 1 }];
    if (start > 2) items.push({ page: null, active: false });

    for (let p = start; p <= end; p++) {
      items.push({ page: p, active: p === current });
    }

    if (end < total - 1) items.push({ page: null, active: false });
    items.push({ page: total, active: current === total });
    return items;
  });

  // ─────────── handlers ───────────

  protected goTo(page: number | null): void {
    if (page === null) return;
    if (this.disabled()) return;
    if (page < 1 || page > this.totalPages()) return;
    if (page === this.pageIndex()) return;
    this.pageChange.emit(page);
  }

  protected prev(): void {
    if (!this.canPrev() || this.disabled()) return;
    this.pageChange.emit(this.pageIndex() - 1);
  }

  protected next(): void {
    if (!this.canNext() || this.disabled()) return;
    this.pageChange.emit(this.pageIndex() + 1);
  }

  protected onPageSizeChange(value: string): void {
    const size = Number(value);
    if (!Number.isFinite(size) || size <= 0) return;
    this.pageSizeChange.emit(size);
  }
}
