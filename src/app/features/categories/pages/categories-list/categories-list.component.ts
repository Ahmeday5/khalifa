import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CategoriesService } from '../../services/categories.service';
import { Category } from '../../models/category.model';
import { CategoryFormModalComponent } from '../../components/category-form-modal/category-form-modal.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { FormMode } from '../../../../shared/models/form-mode.model';
import { DialogService } from '../../../../core/services/dialog.service';
import { ToastService } from '../../../../core/services/toast.service';
import { HttpCacheService } from '../../../../core/services/http-cache.service';
import { onInvalidate } from '../../../../core/utils/auto-refresh.util';
import { ApiError } from '../../../../core/models/api-response.model';
import { HasPermissionDirective } from '../../../../shared/directives/has-permission.directive';
import { PERMISSIONS } from '../../../../core/constants/permissions.const';

const DEFAULT_PAGE_SIZE = 10;

@Component({
  selector: 'app-categories-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CategoryFormModalComponent, PaginationComponent, HasPermissionDirective],
  templateUrl: './categories-list.component.html',
  styleUrl: './categories-list.component.scss',
})
export class CategoriesListComponent implements OnInit {
  private readonly service = inject(CategoriesService);
  private readonly dialog  = inject(DialogService);
  private readonly toast   = inject(ToastService);
  private readonly cache   = inject(HttpCacheService);

  /** Exposed so the template can gate write actions with `*appHasPermission`. */
  protected readonly PERMS = PERMISSIONS;

  // ── data ──
  protected readonly categories = signal<Category[]>([]);
  protected readonly loading    = signal(false);

  // ── filters ──
  protected readonly searchTerm = signal('');
  protected readonly pageIndex  = signal(1);
  protected readonly pageSize   = signal(DEFAULT_PAGE_SIZE);

  // ── pagination meta from server ──
  protected readonly count      = signal(0);
  protected readonly totalPages = signal(0);

  // ── modal state ──
  protected readonly modalOpen     = signal(false);
  protected readonly modalMode     = signal<FormMode>('create');
  protected readonly modalCategory = signal<Category | null>(null);

  protected readonly deletingId = signal<number | null>(null);

  // ── derived ──
  protected readonly hasFilters = computed(() => this.searchTerm().length > 0);

  // ── debounce machinery ──
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly fetchTrigger = computed(() => ({
    search: this.searchTerm().trim(),
    pageIndex: this.pageIndex(),
    pageSize: this.pageSize(),
  }));

  constructor() {
    effect(() => {
      const trigger = this.fetchTrigger();
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.fetch(trigger), 300);
    });

    onInvalidate(this.cache, 'categor', () => this.refresh());
  }

  ngOnInit(): void {
    /* effect fires on first render */
  }

  // ─────────── data loaders ───────────

  protected fetch(
    trigger: { search: string; pageIndex: number; pageSize: number },
    force = false,
  ): void {
    this.loading.set(true);
    const stream$ = force
      ? this.service.refreshList(trigger)
      : this.service.list(trigger);
    stream$.subscribe({
      next: (res) => {
        this.categories.set(res?.data ?? []);
        this.count.set(res?.count ?? 0);
        this.totalPages.set(res?.totalPages ?? 0);
        this.loading.set(false);
      },
      error: () => {
        this.categories.set([]);
        this.count.set(0);
        this.totalPages.set(0);
        this.loading.set(false);
      },
    });
  }

  protected refresh(): void {
    this.fetch(this.fetchTrigger(), true);
  }

  // ─────────── filter handlers ───────────

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

  // ─────────── modal handlers ───────────

  protected openCreate(): void {
    this.modalCategory.set(null);
    this.modalMode.set('create');
    this.modalOpen.set(true);
  }

  protected openEdit(category: Category): void {
    this.modalCategory.set(category);
    this.modalMode.set('edit');
    this.modalOpen.set(true);
  }

  protected closeModal(): void {
    this.modalOpen.set(false);
  }

  protected onSaved(saved: Category): void {
    const wasCreate = this.modalMode() === 'create';
    this.modalOpen.set(false);

    if (wasCreate) {
      if (this.pageIndex() !== 1) this.pageIndex.set(1);
      else this.refresh();
      return;
    }

    const onPage = this.categories().some((c) => c.id === saved.id);
    if (onPage) {
      this.categories.update((list) =>
        list.map((c) => (c.id === saved.id ? saved : c)),
      );
    } else {
      this.refresh();
    }
  }

  // ─────────── delete ───────────

  protected async confirmDelete(category: Category): Promise<void> {
    const ok = await this.dialog.confirm({
      title: 'حذف فئة',
      message: `هل أنت متأكد من حذف "${category.name}"؟ هذا الإجراء لا يمكن التراجع عنه.`,
      confirmText: 'حذف',
      cancelText: 'إلغاء',
      type: 'danger',
    });
    if (!ok) return;

    this.deletingId.set(category.id);
    this.service.delete(category.id).subscribe({
      next: () => {
        this.deletingId.set(null);
        this.toast.success('تم حذف الفئة بنجاح');
        if (this.categories().length === 1 && this.pageIndex() > 1) {
          this.pageIndex.update((p) => p - 1);
        } else {
          this.refresh();
        }
      },
      error: (err: ApiError) => {
        this.deletingId.set(null);
        this.toast.error(err.message || 'تعذّر حذف الفئة');
      },
    });
  }
}
