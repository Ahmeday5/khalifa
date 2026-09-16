import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { PushNotificationsService } from '../../services/push-notifications.service';
import { NotificationsStore } from '../../../../core/stores/notifications.store';
import {
  PushNotificationItem,
  PushNotificationType,
} from '../../models/push-notification.model';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { ApiError } from '../../../../core/models/api-response.model';
import { ToastService } from '../../../../core/services/toast.service';
import { apiErrorToMessage } from '../../../../core/utils/api-error.util';
import { HttpCacheService } from '../../../../core/services/http-cache.service';
import { onInvalidate } from '../../../../core/utils/auto-refresh.util';

const DEFAULT_PAGE_SIZE = 20;

const TYPE_LABELS: Record<PushNotificationType, string> = {
  ContractCreated: 'عقد جديد',
  ContractUpdated: 'تعديل عقد',
  InstallmentCollected: 'تحصيل قسط',
  DownPaymentCollected: 'تحصيل مقدم',
};

@Component({
  selector: 'app-notifications-inbox',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PaginationComponent],
  templateUrl: './notifications-inbox.component.html',
  styleUrl: './notifications-inbox.component.scss',
})
export class NotificationsInboxComponent {
  private readonly service = inject(PushNotificationsService);
  protected readonly store = inject(NotificationsStore);
  private readonly toast = inject(ToastService);
  private readonly cache = inject(HttpCacheService);

  // ── state ──
  protected readonly rows = signal<PushNotificationItem[]>([]);
  protected readonly loading = signal(false);
  protected readonly count = signal(0);
  protected readonly totalPages = signal(0);
  protected readonly pageIndex = signal(1);
  protected readonly pageSize = signal(DEFAULT_PAGE_SIZE);

  constructor() {
    this.fetch();
    onInvalidate(this.cache, 'notification', () => this.refresh());
  }

  private fetch(force = false): void {
    this.loading.set(true);
    const query = { pageIndex: this.pageIndex(), pageSize: this.pageSize() };
    const stream$ = force
      ? this.service.refreshList(query)
      : this.service.list(query);

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
        this.toast.error(apiErrorToMessage(err, 'تعذّر تحميل الإشعارات'));
      },
    });
  }

  protected refresh(): void {
    this.fetch(true);
  }

  protected onPageChange(page: number): void {
    this.pageIndex.set(page);
    this.fetch();
  }

  protected onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.pageIndex.set(1);
    this.fetch();
  }

  protected markRead(item: PushNotificationItem): void {
    if (item.isRead) return;
    this.service.markRead(item.id).subscribe({
      next: () => {
        this.rows.update((list) =>
          list.map((i) => (i.id === item.id ? { ...i, isRead: true } : i)),
        );
        this.store.refreshUnreadCount(true);
      },
      error: (err: ApiError) => {
        this.toast.error(apiErrorToMessage(err, 'تعذّر تحديث الإشعار'));
      },
    });
  }

  protected markAllRead(): void {
    this.service.markAllRead().subscribe({
      next: () => {
        this.rows.update((list) => list.map((i) => ({ ...i, isRead: true })));
        this.store.refreshUnreadCount(true);
        this.toast.success('تم تعليم كل الإشعارات كمقروءة');
      },
      error: (err: ApiError) => {
        this.toast.error(apiErrorToMessage(err, 'تعذّر تعليم الإشعارات كمقروءة'));
      },
    });
  }

  protected typeLabel(type: PushNotificationType): string {
    return TYPE_LABELS[type] ?? type;
  }

  protected formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString('ar-EG', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
