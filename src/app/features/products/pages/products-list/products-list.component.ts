import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ProductsService } from '../../services/products.service';
import { Product } from '../../models/product.model';
import { ProductFormModalComponent } from '../../components/product-form-modal/product-form-modal.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { FormMode } from '../../../../shared/models/form-mode.model';
import { DialogService } from '../../../../core/services/dialog.service';
import { ToastService } from '../../../../core/services/toast.service';
import { HttpCacheService } from '../../../../core/services/http-cache.service';
import { onInvalidate } from '../../../../core/utils/auto-refresh.util';
import { ApiError } from '../../../../core/models/api-response.model';
import { buildImageUrl } from '../../utils/product-image.util';
import { Category } from '../../../categories/models/category.model';
import { CategoriesService } from '../../../categories/services/categories.service';
import { HasPermissionDirective } from '../../../../shared/directives/has-permission.directive';
import { PERMISSIONS } from '../../../../core/constants/permissions.const';

const DEFAULT_PAGE_SIZE = 12;

/**
 * Products listing page.
 *
 *   - server-paginated card grid with search + category filter
 *   - debounced search (300ms) → resets to page 1
 *   - hero summary card driven by the current page's data
 *   - CRUD: create / edit / delete via the form modal + confirm dialog
 *   - mutations re-fetch the active page so server-side ordering stays
 *     authoritative (especially relevant after a delete might empty
 *     the trailing page)
 */
@Component({
  selector: 'app-products-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ProductFormModalComponent,
    PaginationComponent,
    CurrencyArPipe,
    HasPermissionDirective,
  ],
  templateUrl: './products-list.component.html',
  styleUrl: './products-list.component.scss',
})
export class ProductsListComponent implements OnInit {
  private readonly service = inject(ProductsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly cache = inject(HttpCacheService);

  /** Exposed so the template can gate write actions with `*appHasPermission`. */
  protected readonly PERMS = PERMISSIONS;

  // ── data ──
  protected readonly products = signal<Product[]>([]);
  protected readonly categories = signal<Category[]>([]);
  protected readonly loading = signal(false);

  // ── filters ──
  protected readonly searchTerm = signal('');
  protected readonly categoryFilter = signal<number | ''>('');
  protected readonly pageIndex = signal(1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);

  // ── pagination meta from server ──
  protected readonly count = signal(0);
  protected readonly totalPages = signal(0);

  // ── modal state ──
  protected readonly modalOpen = signal(false);
  protected readonly modalMode = signal<FormMode>('create');
  protected readonly modalProduct = signal<Product | null>(null);

  protected readonly deletingId = signal<number | null>(null);

  // ── derived ──
  protected readonly hasFilters = computed(
    () => this.searchTerm().length > 0 || this.categoryFilter() !== '',
  );

  // Stats — reflect the current page (full totals come from `count()`).
  protected readonly activeCount = computed(
    () => this.products().filter((p) => p.isActive).length,
  );
  protected readonly inactiveCount = computed(
    () => this.products().length - this.activeCount(),
  );

  /** Sum of unit purchase prices on this page — kept as a quick reference. */
  protected readonly pageInventoryCost = computed(() =>
    this.products().reduce((sum, p) => sum + (p.purchasePrice ?? 0), 0),
  );

  // ── debounce machinery ──
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly fetchTrigger = computed(() => ({
    search: this.searchTerm().trim(),
    categoryId: this.categoryFilter(),
    pageIndex: this.pageIndex(),
    pageSize: this.pageSize(),
  }));

  constructor() {
    effect(() => {
      const trigger = this.fetchTrigger();
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.fetch(trigger), 300);
    });

    // Auto-refresh on `product` invalidations (own mutations + invoice
    // mutations that touch product stock) AND on `categor` invalidations
    // (since the table embeds categoryName).
    onInvalidate(this.cache, 'product', () => this.refresh());
    onInvalidate(this.cache, 'categor', () => this.loadCategories());
  }

  ngOnInit(): void {
    this.loadCategories();
  }

  // ─────────────── data loaders ───────────────

  protected fetch(
    trigger: {
      search: string;
      categoryId: number | '';
      pageIndex: number;
      pageSize: number;
    },
    force = false,
  ): void {
    this.loading.set(true);
    const stream$ = force
      ? this.service.refreshList(trigger)
      : this.service.list(trigger);
    stream$.subscribe({
      next: (res) => {
        this.products.set(res?.data ?? []);
        this.count.set(res?.count ?? 0);
        this.totalPages.set(res?.totalPages ?? 0);
        this.loading.set(false);
      },
      error: () => {
        this.products.set([]);
        this.count.set(0);
        this.totalPages.set(0);
        this.loading.set(false);
      },
    });
  }

  protected refresh(): void {
    this.fetch(this.fetchTrigger(), true);
  }

  private loadCategories(): void {
    this.categoriesService.listAll().subscribe({
      next: (list) => this.categories.set(list),
      error: () => this.categories.set([]),
    });
  }

  // ─────────────── filter handlers ───────────────

  protected onSearch(value: string): void {
    this.searchTerm.set(value);
    if (this.pageIndex() !== 1) this.pageIndex.set(1);
  }

  protected onCategoryChange(value: string): void {
    this.categoryFilter.set(value === '' ? '' : Number(value));
    this.pageIndex.set(1);
  }

  protected clearFilters(): void {
    this.searchTerm.set('');
    this.categoryFilter.set('');
    this.pageIndex.set(1);
  }

  protected onPageChange(page: number): void {
    this.pageIndex.set(page);
  }

  protected onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.pageIndex.set(1);
  }

  // ─────────────── modal handlers ───────────────

  protected openCreate(): void {
    this.modalProduct.set(null);
    this.modalMode.set('create');
    this.modalOpen.set(true);
  }

  protected openEdit(product: Product): void {
    this.modalProduct.set(product);
    this.modalMode.set('edit');
    this.modalOpen.set(true);
  }

  protected closeModal(): void {
    this.modalOpen.set(false);
  }

  protected onSaved(saved: Product): void {
    const wasCreate = this.modalMode() === 'create';
    this.modalOpen.set(false);

    if (wasCreate) {
      if (this.pageIndex() !== 1) this.pageIndex.set(1);
      else this.refresh();
      return;
    }

    const onPage = this.products().some((p) => p.id === saved.id);
    if (onPage) {
      this.products.update((list) =>
        list.map((p) => (p.id === saved.id ? saved : p)),
      );
    } else {
      this.refresh();
    }
  }

  // ─────────────── delete ───────────────

  protected async confirmDelete(product: Product): Promise<void> {
    const ok = await this.dialog.confirm({
      title: 'حذف منتج',
      message: `هل أنت متأكد من حذف "${product.name}"؟ هذا الإجراء لا يمكن التراجع عنه.`,
      confirmText: 'حذف',
      cancelText: 'إلغاء',
      type: 'danger',
    });
    if (!ok) return;

    this.deletingId.set(product.id);
    this.service.delete(product.id).subscribe({
      next: () => {
        this.deletingId.set(null);
        this.toast.success('تم حذف المنتج بنجاح');
        if (this.products().length === 1 && this.pageIndex() > 1) {
          this.pageIndex.update((p) => p - 1);
        } else {
          this.refresh();
        }
      },
      error: (err: ApiError) => {
        this.deletingId.set(null);
        this.toast.error(err.message || 'تعذّر حذف المنتج');
      },
    });
  }

  // ─────────────── view helpers ───────────────

  protected imageOf(product: Product): string | null {
    return buildImageUrl(product.imageUrl);
  }

  protected profitOf(product: Product): number {
    return (product.sellingPrice ?? 0) - (product.purchasePrice ?? 0);
  }

  /**
   * Prefer the server-computed margin when present (it accounts for
   * promotions / cost adjustments); fall back to a local calc only if
   * the server returned 0 to avoid showing a stale percentage.
   */
  protected marginPctOf(product: Product): number {
    if (product.profitRatePercent) {
      return Math.round(product.profitRatePercent);
    }
    const cost = product.purchasePrice ?? 0;
    if (cost <= 0) return 0;
    return Math.round((this.profitOf(product) / cost) * 100);
  }

  protected commissionLabel(product: Product): string {
    switch (product.commissionType) {
      case 'Percentage':
        return `${product.commissionValue ?? 0}%`;

      case 'FixedAmount':
        return `${product.commissionValue ?? 0} ج.م`;

      default:
        return 'بدون عمولة';
    }
  }

  protected onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
  }
}
