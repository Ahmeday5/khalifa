import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { DateArPipe } from '../../../../shared/pipes/date-ar.pipe';
import {
  BadgeComponent,
  BadgeType,
} from '../../../../shared/components/badge/badge.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { REP_STATUS_BADGE, REP_STATUS_LABELS } from '../../constants/rep-meta';
import {
  RepStatementContractRow,
  RepStatementRepresentative,
  RepStatementSummary,
  RepresentativeStatement,
} from '../../models/rep.model';

/**
 * Presentational account-statement view shared by the admin modal
 * (`statement(id)`) and the representative's own page (`myStatement`).
 * Pure inputs/outputs — it never talks to a service, so both hosts stay
 * in control of fetching/paging and there's a single rendering to maintain.
 */
@Component({
  selector: 'app-rep-statement-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyArPipe, DateArPipe, BadgeComponent, PaginationComponent],
  templateUrl: './rep-statement-view.component.html',
  styleUrl: './rep-statement-view.component.scss',
})
export class RepStatementViewComponent {
  readonly statement = input<RepresentativeStatement | null>(null);
  readonly loading = input<boolean>(false);
  readonly pageIndex = input<number>(1);
  readonly pageSize = input<number>(10);

  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();

  protected readonly rep = computed<RepStatementRepresentative | null>(
    () => this.statement()?.representative ?? null,
  );
  protected readonly summary = computed<RepStatementSummary | null>(
    () => this.statement()?.summary ?? null,
  );
  protected readonly contracts = computed<RepStatementContractRow[]>(
    () => this.statement()?.contracts?.data ?? [],
  );
  protected readonly count = computed(
    () => this.statement()?.contracts?.count ?? 0,
  );
  protected readonly totalPages = computed(
    () => this.statement()?.contracts?.totalPages ?? 0,
  );

  protected statusLabel(s: string): string {
    return REP_STATUS_LABELS[s as keyof typeof REP_STATUS_LABELS] ?? s;
  }
  protected statusBadge(s: string): BadgeType {
    return REP_STATUS_BADGE[s as keyof typeof REP_STATUS_BADGE] ?? 'info';
  }

  /** Maps a contract status to a badge tone (Active = ok, else neutral). */
  protected contractBadge(s: string): BadgeType {
    return s === 'Active' ? 'ok' : 'info';
  }
}
