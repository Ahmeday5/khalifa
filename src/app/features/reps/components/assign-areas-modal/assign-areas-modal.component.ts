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
import { forkJoin } from 'rxjs';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { ApiError } from '../../../../core/models/api-response.model';
import { ToastService } from '../../../../core/services/toast.service';
import { fetchAllPages } from '../../../../core/utils/api-list.util';
import { Area } from '../../../areas/models/area.model';
import { AreasService } from '../../../areas/services/areas.service';
import { RepsService } from '../../services/reps.service';

/**
 * Assigns the full set of areas a representative may operate in.
 *
 * Both the entire area catalogue and the representative's current
 * assignment are small, slow-moving lists (tens, not thousands, of rows),
 * so the modal drains every page of `/dashboard/areas` up front (via
 * `fetchAllPages` — never trusting a single hard-coded page size) and does
 * search/select-all entirely in memory. The save button always PUTs the
 * *complete* selected id set — the backend replaces the assignment
 * wholesale, it doesn't diff.
 */
@Component({
  selector: 'app-assign-areas-modal',
  standalone: true,
  imports: [ModalComponent],
  templateUrl: './assign-areas-modal.component.html',
  styleUrl: './assign-areas-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssignAreasModalComponent {
  readonly open = input.required<boolean>();
  readonly representativeId = input<number | null>(null);
  readonly representativeName = input<string>('');

  readonly closed = output<void>();
  readonly saved = output<void>();

  private readonly areasService = inject(AreasService);
  private readonly repsService = inject(RepsService);
  private readonly toast = inject(ToastService);

  protected readonly loading = signal(false);
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly allAreas = signal<Area[]>([]);
  protected readonly selectedIds = signal<Set<number>>(new Set());
  protected readonly term = signal('');

  protected readonly filteredAreas = computed(() => {
    const q = this.term().trim().toLowerCase();
    const list = this.allAreas();
    if (!q) return list;
    return list.filter((a) => a.name.toLowerCase().includes(q));
  });

  protected readonly selectedCount = computed(() => this.selectedIds().size);
  protected readonly totalCount = computed(() => this.allAreas().length);
  protected readonly allFilteredSelected = computed(() => {
    const visible = this.filteredAreas();
    if (visible.length === 0) return false;
    const selected = this.selectedIds();
    return visible.every((a) => selected.has(a.id));
  });

  constructor() {
    effect(
      () => {
        const id = this.representativeId();
        if (!this.open() || id === null) return;
        this.serverError.set(null);
        this.submitting.set(false);
        this.term.set('');
        this.loadData(id);
      },
      { allowSignalWrites: true },
    );
  }

  protected onSearch(event: Event): void {
    this.term.set((event.target as HTMLInputElement).value);
  }

  protected isSelected(id: number): boolean {
    return this.selectedIds().has(id);
  }

  protected toggle(id: number): void {
    this.selectedIds.update((set) => {
      const next = new Set(set);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  protected toggleSelectAllFiltered(): void {
    const visible = this.filteredAreas();
    const selectAll = !this.allFilteredSelected();
    this.selectedIds.update((set) => {
      const next = new Set(set);
      for (const a of visible) {
        selectAll ? next.add(a.id) : next.delete(a.id);
      }
      return next;
    });
  }

  protected clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  protected onSubmit(): void {
    const id = this.representativeId();
    if (id === null || this.submitting()) return;

    this.serverError.set(null);
    this.submitting.set(true);

    this.repsService
      .assignAreas(id, { areaIds: Array.from(this.selectedIds()) })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.toast.success('تم تحديث مناطق المندوب بنجاح');
          this.saved.emit();
        },
        error: (err: ApiError) => {
          this.submitting.set(false);
          this.serverError.set(err.message || 'تعذّر تحديث مناطق المندوب');
        },
      });
  }

  protected close(): void {
    if (this.submitting()) return;
    this.closed.emit();
  }

  // ─────────── internals ───────────

  private loadData(repId: number): void {
    this.loading.set(true);
    this.allAreas.set([]);
    this.selectedIds.set(new Set());

    forkJoin({
      all: fetchAllPages<Area>((pageIndex, pageSize) =>
        this.areasService.list({ pageIndex, pageSize }),
      ),
      assigned: this.repsService.getAreas(repId),
    }).subscribe({
      next: ({ all, assigned }) => {
        this.allAreas.set(all);
        this.selectedIds.set(new Set(assigned.map((a) => a.id)));
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('تعذّر تحميل بيانات المناطق');
      },
    });
  }
}
