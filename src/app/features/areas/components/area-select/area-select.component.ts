import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  Optional,
  Self,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NgControl } from '@angular/forms';
import { ApiError } from '../../../../core/models/api-response.model';
import { DialogService } from '../../../../core/services/dialog.service';
import { ToastService } from '../../../../core/services/toast.service';
import { FormMode } from '../../../../shared/models/form-mode.model';
import { Area } from '../../models/area.model';
import { AREAS_PICKER_PAGE_SIZE, AreasService } from '../../services/areas.service';
import { AreaFormModalComponent } from '../area-form-modal/area-form-modal.component';

/**
 * Reactive-Forms area picker — searches `/dashboard/areas` server-side
 * (rather than filtering an in-memory list like `SearchableSelectComponent`,
 * since the area roster can grow past what's comfortable to keep fully
 * loaded client-side):
 *
 *   - no search term: loads 20 areas per page; scrolling the panel to the
 *     bottom loads 20 more (classic infinite scroll)
 *   - a search term: drains *every* matching page from the server so
 *     results are never capped to the first page/pageSize
 *
 * Each row carries small edit/delete icon buttons, and the header exposes
 * an "+ إضافة منطقة" button — both open `AreaFormModalComponent` stacked
 * above the caller's own modal. A brand-new/edited/deleted area is folded
 * back into the in-memory list immediately, no full refetch needed.
 */
@Component({
  selector: 'app-area-select',
  standalone: true,
  imports: [AreaFormModalComponent],
  templateUrl: './area-select.component.html',
  styleUrl: './area-select.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AreaSelectComponent implements ControlValueAccessor {
  readonly placeholder = input<string>('اختر المنطقة…');
  readonly searchPlaceholder = input<string>('ابحث عن منطقة…');
  readonly isDisabled = input<boolean>(false);

  private readonly service = inject(AreasService);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastService);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchBox');

  // ── list state ──
  protected readonly areas = signal<Area[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadingMore = signal(false);
  protected readonly searching = signal(false);
  protected readonly pageIndex = signal(1);
  protected readonly hasMore = signal(true);

  // ── panel state ──
  protected readonly open = signal(false);
  private readonly cvaDisabled = signal(false);
  protected readonly disabled = computed(() => this.cvaDisabled() || this.isDisabled());
  protected readonly term = signal('');

  /** Selected value — synced via writeValue() and option clicks. */
  protected readonly value = signal<number | null>(null);
  /** Kept alongside `value` so the closed control can show a label without the full list loaded. */
  protected readonly selectedLabel = signal<string | null>(null);

  // ── inline add/edit modal ──
  protected readonly formOpen = signal(false);
  protected readonly formMode = signal<FormMode>('create');
  protected readonly formTarget = signal<Area | null>(null);
  protected readonly deletingId = signal<number | null>(null);

  private onChange: (val: number | null) => void = () => {};
  private onTouched: () => void = () => {};
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  constructor(@Self() @Optional() public ngControl: NgControl) {
    if (this.ngControl) this.ngControl.valueAccessor = this;
  }

  protected readonly selectedOption = computed(() => {
    const v = this.value();
    if (v === null) return null;
    return this.areas().find((a) => a.id === v) ?? null;
  });

  protected readonly displayLabel = computed(
    () => this.selectedOption()?.name ?? this.selectedLabel(),
  );

  protected isInvalid(): boolean {
    const c = this.ngControl?.control;
    return !!(c && c.invalid && (c.touched || c.dirty));
  }

  // ─────────── ControlValueAccessor ───────────

  writeValue(value: number | null): void {
    this.value.set(value ?? null);
  }
  registerOnChange(fn: (val: number | null) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.cvaDisabled.set(isDisabled);
  }

  // ─────────── panel open/close ───────────

  protected toggle(): void {
    if (this.disabled()) return;
    this.open() ? this.close() : this.openPanel();
  }

  private openPanel(): void {
    this.open.set(true);
    this.term.set('');
    if (this.areas().length === 0) this.loadFirstPage();
    queueMicrotask(() => this.searchInput()?.nativeElement.focus());
  }

  protected close(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.onTouched();
  }

  protected select(opt: Area): void {
    this.value.set(opt.id);
    this.selectedLabel.set(opt.name);
    this.onChange(opt.id);
    this.close();
  }

  protected clear(event: Event): void {
    event.stopPropagation();
    if (this.disabled()) return;
    this.value.set(null);
    this.selectedLabel.set(null);
    this.onChange(null);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  // ─────────── data loading ───────────

  private loadFirstPage(): void {
    this.loading.set(true);
    this.pageIndex.set(1);
    this.service.list({ pageIndex: 1, pageSize: AREAS_PICKER_PAGE_SIZE }).subscribe({
      next: (res) => {
        const rows = res?.data ?? [];
        this.areas.set(rows);
        this.hasMore.set(rows.length >= AREAS_PICKER_PAGE_SIZE && this.pageIndex() < (res?.totalPages ?? 1));
        this.loading.set(false);
      },
      error: () => {
        this.areas.set([]);
        this.hasMore.set(false);
        this.loading.set(false);
      },
    });
  }

  /** Infinite scroll — called from the template when the list nears its bottom. */
  protected onListScroll(event: Event): void {
    if (this.term().trim()) return; // search mode already loaded everything
    if (this.loading() || this.loadingMore() || !this.hasMore()) return;

    const el = event.target as HTMLElement;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 48;
    if (!nearBottom) return;

    const next = this.pageIndex() + 1;
    this.loadingMore.set(true);
    this.service.list({ pageIndex: next, pageSize: AREAS_PICKER_PAGE_SIZE }).subscribe({
      next: (res) => {
        const rows = res?.data ?? [];
        this.areas.update((list) => [...list, ...rows]);
        this.pageIndex.set(next);
        this.hasMore.set(rows.length >= AREAS_PICKER_PAGE_SIZE && next < (res?.totalPages ?? next));
        this.loadingMore.set(false);
      },
      error: () => {
        this.loadingMore.set(false);
      },
    });
  }

  protected onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.term.set(value);

    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.runSearch(value.trim()), 300);
  }

  private runSearch(term: string): void {
    if (!term) {
      this.loadFirstPage();
      return;
    }
    this.searching.set(true);
    this.service.searchAll(term).subscribe({
      next: (rows) => {
        this.areas.set(rows);
        this.hasMore.set(false);
        this.searching.set(false);
      },
      error: () => {
        this.areas.set([]);
        this.hasMore.set(false);
        this.searching.set(false);
      },
    });
  }

  // ─────────── inline add/edit/delete ───────────

  /**
   * Whether the search panel was open right before the add/edit modal took
   * over — the panel is force-closed while the modal is up (both render in
   * the same `.app-modal-backdrop` stacking context, so a nested modal
   * can't reliably paint above an already-open panel) and restored after.
   */
  private reopenPanelAfterForm = false;

  protected openCreateArea(event?: Event): void {
    event?.stopPropagation();
    this.formTarget.set(null);
    this.formMode.set('create');
    this.beginAreaForm();
  }

  protected openEditArea(area: Area, event: Event): void {
    event.stopPropagation();
    this.formTarget.set(area);
    this.formMode.set('edit');
    this.beginAreaForm();
  }

  private beginAreaForm(): void {
    this.reopenPanelAfterForm = this.open();
    this.open.set(false);
    this.formOpen.set(true);
  }

  protected closeAreaForm(): void {
    this.formOpen.set(false);
    if (this.reopenPanelAfterForm) this.open.set(true);
  }

  /** New/edited area lands in the list immediately — no refetch needed. */
  protected onAreaSaved(area: Area): void {
    const wasCreate = this.formMode() === 'create';
    this.formOpen.set(false);

    if (wasCreate) {
      this.areas.update((list) => [area, ...list]);
      this.select(area);
      this.open.set(true); // select() closes the panel — reopen so the new row is visible
      return;
    }

    this.areas.update((list) => list.map((a) => (a.id === area.id ? area : a)));
    if (this.value() === area.id) this.selectedLabel.set(area.name);
    if (this.reopenPanelAfterForm) this.open.set(true);
  }

  protected async confirmDeleteArea(area: Area, event: Event): Promise<void> {
    event.stopPropagation();
    const ok = await this.dialog.confirm({
      title: 'حذف منطقة',
      message: `هل أنت متأكد من حذف "${area.name}"؟ هذا الإجراء لا يمكن التراجع عنه.`,
      confirmText: 'حذف',
      cancelText: 'إلغاء',
      type: 'danger',
    });
    if (!ok) return;

    this.deletingId.set(area.id);
    this.service.delete(area.id).subscribe({
      next: () => {
        this.deletingId.set(null);
        this.toast.success('تم حذف المنطقة بنجاح');
        this.areas.update((list) => list.filter((a) => a.id !== area.id));
        if (this.value() === area.id) {
          this.value.set(null);
          this.selectedLabel.set(null);
          this.onChange(null);
        }
      },
      error: (err: ApiError) => {
        this.deletingId.set(null);
        this.toast.error(err.message || 'تعذّر حذف المنطقة');
      },
    });
  }
}
