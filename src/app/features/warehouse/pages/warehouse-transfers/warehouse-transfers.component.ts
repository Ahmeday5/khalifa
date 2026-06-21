import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { WarehouseService } from '../../services/warehouse.service';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { DateArPipe } from '../../../../shared/pipes/date-ar.pipe';
import { ToastService } from '../../../../core/services/toast.service';
import { HttpCacheService } from '../../../../core/services/http-cache.service';
import { onInvalidate } from '../../../../core/utils/auto-refresh.util';
import { LookupItem } from '../../../../core/models/lookup.model';
import { HasPermissionDirective } from '../../../../shared/directives/has-permission.directive';
import { PERMISSIONS } from '../../../../core/constants/permissions.const';
import {
  CreateWarehouseTransferResponse,
  WarehouseTransferListItem,
} from '../../models/warehouse.model';
import {
  WarehouseTransferModalComponent,
  TransferModalMode,
} from '../../components/warehouse-transfer-modal/warehouse-transfer-modal.component';

const DEFAULT_PAGE_SIZE = 10;

@Component({
  selector: 'app-warehouse-transfers',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DecimalPipe,
    DateArPipe,
    PaginationComponent,
    WarehouseTransferModalComponent,
    HasPermissionDirective,
  ],
  templateUrl: './warehouse-transfers.component.html',
  styleUrl: './warehouse-transfers.component.scss',
})
export class WarehouseTransfersComponent implements OnInit {
  private readonly svc    = inject(WarehouseService);
  private readonly toast  = inject(ToastService);
  private readonly cache  = inject(HttpCacheService);

  protected readonly PERMS = PERMISSIONS;

  constructor() {
    onInvalidate(this.cache, 'transfer', () => this.refresh());
    onInvalidate(this.cache, 'warehous', () => this.loadWarehouseLookup());
  }

  // ── data ──
  protected readonly transfers   = signal<WarehouseTransferListItem[]>([]);
  protected readonly loading     = signal(false);
  protected readonly count       = signal(0);
  protected readonly totalPages  = signal(0);

  // ── filter state ──
  protected readonly fromWarehouseId = signal<number>(0);
  protected readonly toWarehouseId   = signal<number>(0);
  protected readonly pageIndex       = signal(1);
  protected readonly pageSize        = signal(DEFAULT_PAGE_SIZE);

  // ── warehouse lookup for filter dropdowns ──
  protected readonly warehouseLookup = signal<LookupItem[]>([]);

  // ── modal state ──
  protected readonly modalOpen       = signal(false);
  protected readonly modalMode       = signal<TransferModalMode>('create');
  protected readonly viewTransferId  = signal<number | null>(null);

  ngOnInit(): void {
    this.loadWarehouseLookup();
    this.fetchTransfers();
  }

  // ─────────── data loaders ───────────

  private loadWarehouseLookup(): void {
    this.svc.lookup().subscribe({
      next: (list) => this.warehouseLookup.set(list ?? []),
    });
  }

  protected refresh(): void {
    this.fetchTransfers(true);
  }

  private fetchTransfers(force = false): void {
    this.loading.set(true);
    const query = {
      pageIndex: this.pageIndex(),
      pageSize: this.pageSize(),
      fromWarehouseId: this.fromWarehouseId() || null,
      toWarehouseId: this.toWarehouseId() || null,
    };

    const stream$ = force
      ? this.svc.refreshTransfers(query)
      : this.svc.listTransfers(query);

    stream$.subscribe({
      next: (res) => {
        this.transfers.set(res?.data ?? []);
        this.count.set(res?.count ?? 0);
        this.totalPages.set(res?.totalPages ?? 0);
        this.loading.set(false);
      },
      error: () => {
        this.transfers.set([]);
        this.count.set(0);
        this.totalPages.set(0);
        this.loading.set(false);
        this.toast.error('تعذّر تحميل سجل التحويلات');
      },
    });
  }

  // ─────────── filter handlers ───────────

  protected onFromWarehouseChange(value: string): void {
    this.fromWarehouseId.set(Number(value) || 0);
    this.pageIndex.set(1);
    this.fetchTransfers();
  }

  protected onToWarehouseChange(value: string): void {
    this.toWarehouseId.set(Number(value) || 0);
    this.pageIndex.set(1);
    this.fetchTransfers();
  }

  protected clearFilters(): void {
    this.fromWarehouseId.set(0);
    this.toWarehouseId.set(0);
    this.pageIndex.set(1);
    this.fetchTransfers();
  }

  protected onPageChange(page: number): void {
    this.pageIndex.set(page);
    this.fetchTransfers();
  }

  protected onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.pageIndex.set(1);
    this.fetchTransfers();
  }

  // ─────────── modal ───────────

  protected openCreate(): void {
    this.modalMode.set('create');
    this.viewTransferId.set(null);
    this.modalOpen.set(true);
  }

  protected openView(transferId: number): void {
    this.modalMode.set('view');
    this.viewTransferId.set(transferId);
    this.modalOpen.set(true);
  }

  protected closeModal(): void {
    this.modalOpen.set(false);
    this.viewTransferId.set(null);
  }

  protected onTransferCreated(_res: CreateWarehouseTransferResponse): void {
    this.modalOpen.set(false);
    if (this.pageIndex() !== 1) this.pageIndex.set(1);
    else this.refresh();
  }

  // ─────────── view helpers ───────────

  protected get hasFilters(): boolean {
    return this.fromWarehouseId() !== 0 || this.toWarehouseId() !== 0;
  }

  protected warehouseName(id: number): string {
    return this.warehouseLookup().find((w) => w.id === id)?.name ?? String(id);
  }
}
