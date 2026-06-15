import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { CurrencyArPipe } from '../../../../shared/pipes/currency-ar.pipe';
import { FormMode } from '../../../../shared/models/form-mode.model';
import { ToastService } from '../../../../core/services/toast.service';
import { HttpCacheService } from '../../../../core/services/http-cache.service';
import { onInvalidate } from '../../../../core/utils/auto-refresh.util';
import { ApiError } from '../../../../core/models/api-response.model';

import { SubAccountsService } from '../../services/sub-accounts.service';
import { TreasuryService } from '../../services/treasury.service';
import { RepsService } from '../../../reps/services/reps.service';
import { SubAccount, SubAccountVoucher } from '../../models/sub-account.model';
import { LookupItem } from '../../../../core/models/lookup.model';
import { SubAccountFormModalComponent } from '../sub-account-form-modal/sub-account-form-modal.component';
import { SubAccountVoucherModalComponent } from '../sub-account-voucher-modal/sub-account-voucher-modal.component';
import { SubAccountStatementModalComponent } from '../sub-account-statement-modal/sub-account-statement-modal.component';
import { SubAccountVouchersModalComponent } from '../sub-account-vouchers-modal/sub-account-vouchers-modal.component';

const DEFAULT_PAGE_SIZE = 10;
const REFETCH_DEBOUNCE_MS = 250;

/**
 * Self-contained management surface for treasury sub-accounts — a single card
 * rendered beside the monthly-profits panel on the treasury home, gated to
 * Admin / GeneralManager by the host.
 *
 * Owns the paginated list and all four child dialogs (create/edit, add
 * voucher, per-account statement, all-vouchers log), so the host only has to
 * drop `<app-sub-accounts-panel />` into the grid.
 */
@Component({
  selector: 'app-sub-accounts-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PaginationComponent,
    CurrencyArPipe,
    SubAccountFormModalComponent,
    SubAccountVoucherModalComponent,
    SubAccountStatementModalComponent,
    SubAccountVouchersModalComponent,
  ],
  templateUrl: './sub-accounts-panel.component.html',
  styleUrl: './sub-accounts-panel.component.scss',
})
export class SubAccountsPanelComponent {
  private readonly service = inject(SubAccountsService);
  private readonly treasuryService = inject(TreasuryService);
  private readonly repsService = inject(RepsService);
  private readonly toast = inject(ToastService);
  private readonly cache = inject(HttpCacheService);

  // ── data ──
  protected readonly accounts = signal<SubAccount[]>([]);
  protected readonly loading = signal(false);

  // ── filters ──
  protected readonly searchTerm = signal('');
  protected readonly pageIndex = signal(1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);

  // ── server pagination meta ──
  protected readonly count = signal(0);
  protected readonly totalPages = signal(0);

  // ── form modal (create/edit) ──
  protected readonly formOpen = signal(false);
  protected readonly formMode = signal<FormMode>('create');
  protected readonly formAccount = signal<SubAccount | null>(null);

  // ── voucher modal ──
  protected readonly voucherOpen = signal(false);
  protected readonly voucherAccount = signal<SubAccount | null>(null);
  protected readonly treasuriesLookup = signal<LookupItem[]>([]);
  protected readonly repsLookup = signal<LookupItem[]>([]);

  // ── statement modal ──
  protected readonly statementOpen = signal(false);
  protected readonly statementAccount = signal<SubAccount | null>(null);

  // ── all-vouchers modal ──
  protected readonly vouchersOpen = signal(false);

  // ── derived ──
  protected readonly hasFilters = computed(() => this.searchTerm().trim().length > 0);
  protected readonly pageBalance = computed(() =>
    this.accounts().reduce((s, a) => s + (a.balance ?? 0), 0),
  );

  private readonly trigger = computed(() => ({
    search: this.searchTerm().trim(),
    pageIndex: this.pageIndex(),
    pageSize: this.pageSize(),
  }));

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const trigger = this.trigger();
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(
        () => this.fetch(trigger, false),
        REFETCH_DEBOUNCE_MS,
      );
    });

    // Any sub-account write (here or in another tab) refreshes the list.
    onInvalidate(this.cache, 'sub-account', () => this.refresh());

    this.treasuryService.lookup().subscribe({
      next: (items) => this.treasuriesLookup.set(items),
      error: () => {},
    });

    this.repsService.lookup().subscribe({
      next: (items) => this.repsLookup.set(items),
      error: () => {},
    });
  }

  // ─────────── data ───────────

  private fetch(
    trigger: ReturnType<typeof this.trigger>,
    force: boolean,
  ): void {
    this.loading.set(true);
    const stream$ = force
      ? this.service.refresh(trigger)
      : this.service.list(trigger);

    stream$.subscribe({
      next: (page) => {
        this.accounts.set(page?.data ?? []);
        this.count.set(page?.count ?? 0);
        this.totalPages.set(page?.totalPages ?? 0);
        this.loading.set(false);
      },
      error: (err: ApiError) => {
        this.accounts.set([]);
        this.count.set(0);
        this.totalPages.set(0);
        this.loading.set(false);
        this.toast.error(err?.message || 'تعذّر تحميل الحسابات الفرعية');
      },
    });
  }

  protected refresh(): void {
    this.fetch(this.trigger(), true);
  }

  // ─────────── filter handlers ───────────

  protected onSearch(value: string): void {
    this.searchTerm.set(value);
    this.resetPage();
  }

  protected clearSearch(): void {
    if (!this.searchTerm()) return;
    this.searchTerm.set('');
    this.resetPage();
  }

  protected onPageChange(page: number): void {
    this.pageIndex.set(page);
  }

  protected onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.resetPage();
  }

  private resetPage(): void {
    if (this.pageIndex() !== 1) this.pageIndex.set(1);
  }

  // ─────────── form modal ───────────

  protected openCreate(): void {
    this.formAccount.set(null);
    this.formMode.set('create');
    this.formOpen.set(true);
  }

  protected openEdit(account: SubAccount): void {
    this.formAccount.set(account);
    this.formMode.set('edit');
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
  }

  protected onSaved(saved: SubAccount): void {
    const wasCreate = this.formMode() === 'create';
    this.formOpen.set(false);
    if (wasCreate) {
      this.accounts.update((list) => [saved, ...list]);
      this.count.update((c) => c + 1);
      if (this.pageIndex() !== 1) this.pageIndex.set(1);
    } else {
      this.accounts.update((list) =>
        list.map((a) => (a.id === saved.id ? saved : a)),
      );
    }
  }

  // ─────────── voucher modal ───────────

  protected openVoucher(account: SubAccount): void {
    this.voucherAccount.set(account);
    this.voucherOpen.set(true);
  }

  protected closeVoucher(): void {
    this.voucherOpen.set(false);
  }

  protected onVoucherSaved(voucher: SubAccountVoucher): void {
    // Instant optimistic update — no round-trip needed; the response already
    // carries `balanceAfter` which is the account's new running balance.
    this.accounts.update((list) =>
      list.map((a) =>
        a.id === voucher.subAccountId ? { ...a, balance: voucher.balanceAfter } : a,
      ),
    );
    this.voucherOpen.set(false);
  }

  // ─────────── statement modal ───────────

  protected openStatement(account: SubAccount): void {
    this.statementAccount.set(account);
    this.statementOpen.set(true);
  }

  protected closeStatement(): void {
    this.statementOpen.set(false);
  }

  // ─────────── all-vouchers modal ───────────

  protected openVouchers(): void {
    this.vouchersOpen.set(true);
  }

  protected closeVouchers(): void {
    this.vouchersOpen.set(false);
  }
}
