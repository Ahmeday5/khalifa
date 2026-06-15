import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RepStatementViewComponent } from '../../components/rep-statement-view/rep-statement-view.component';
import { RepsService } from '../../services/reps.service';
import { RepresentativeStatement } from '../../models/rep.model';

/**
 * Representative-only "my account" page. Backed by
 * `representatives/me/statement` (the backend forbids this for admins,
 * who use the per-id statement instead). Renders through the same shared
 * {@link RepStatementViewComponent} the admin modal uses.
 */
@Component({
  selector: 'app-my-account',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RepStatementViewComponent],
  template: `
    <div class="pgh">
      <div>
        <div class="pgt">كشف حسابي</div>
        <div class="pgs">
          ملخص مبيعاتك وعمولاتك وعقودك مع رصيد خزينتك الحالي
        </div>
      </div>
      <button
        type="button"
        class="btn btn-sm d-inline-flex align-items-center gap-1"
        [disabled]="loading()"
        (click)="refresh()"
      >
        @if (loading()) {
          <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
        }
        <span>تحديث</span>
      </button>
    </div>

    <div class="card">
      <app-rep-statement-view
        [statement]="statement()"
        [loading]="loading()"
        [pageIndex]="pageIndex()"
        [pageSize]="pageSize()"
        (pageChange)="pageIndex.set($event)"
        (pageSizeChange)="onPageSize($event)"
      />
    </div>
  `,
})
export class MyAccountComponent {
  private readonly service = inject(RepsService);

  protected readonly statement = signal<RepresentativeStatement | null>(null);
  protected readonly loading = signal(false);
  protected readonly pageIndex = signal(1);
  protected readonly pageSize = signal(10);

  /** Bumped by the refresh button to re-run the fetch (cache-bypassed). */
  private readonly refreshTick = signal(0);

  constructor() {
    effect(() => {
      const pageIndex = this.pageIndex();
      const pageSize = this.pageSize();
      const bypass = this.refreshTick() > 0;

      this.loading.set(true);
      this.service.myStatement({ pageIndex, pageSize }, bypass).subscribe({
        next: (res) => {
          this.statement.set(res);
          this.loading.set(false);
        },
        error: () => {
          this.statement.set(null);
          this.loading.set(false);
        },
      });
    }, { allowSignalWrites: true });
  }

  protected refresh(): void {
    this.refreshTick.update((t) => t + 1);
  }

  protected onPageSize(size: number): void {
    this.pageSize.set(size);
    this.pageIndex.set(1);
  }
}
