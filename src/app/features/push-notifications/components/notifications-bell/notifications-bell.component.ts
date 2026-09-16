import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { NotificationsStore } from '../../../../core/stores/notifications.store';
import { PushNotificationsService } from '../../services/push-notifications.service';
import {
  PushNotificationItem,
  PushNotificationType,
} from '../../models/push-notification.model';

const RECENT_COUNT = 8;

const TYPE_LABELS: Record<PushNotificationType, string> = {
  ContractCreated: 'عقد جديد',
  ContractUpdated: 'تعديل عقد',
  InstallmentCollected: 'تحصيل قسط',
  DownPaymentCollected: 'تحصيل مقدم',
};

@Component({
  selector: 'app-notifications-bell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notifications-bell.component.html',
  styleUrl: './notifications-bell.component.scss',
})
export class NotificationsBellComponent {
  protected readonly store = inject(NotificationsStore);
  private readonly service = inject(PushNotificationsService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly panelOpen = signal(false);
  protected readonly loading = signal(false);
  protected readonly items = signal<PushNotificationItem[]>([]);

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.panelOpen()) return;
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.panelOpen.set(false);
    }
  }

  protected togglePanel(): void {
    const next = !this.panelOpen();
    this.panelOpen.set(next);
    if (next) this.loadRecent();
  }

  private loadRecent(): void {
    this.loading.set(true);
    this.service.refreshList({ pageIndex: 1, pageSize: RECENT_COUNT }).subscribe({
      next: (page) => {
        this.items.set(page?.data ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.items.set([]);
        this.loading.set(false);
      },
    });
  }

  protected typeLabel(type: PushNotificationType): string {
    return TYPE_LABELS[type] ?? type;
  }

  protected markRead(item: PushNotificationItem): void {
    if (item.isRead) return;
    this.service.markRead(item.id).subscribe({
      next: () => {
        this.items.update((list) =>
          list.map((i) => (i.id === item.id ? { ...i, isRead: true } : i)),
        );
        this.store.refreshUnreadCount(true);
      },
      error: () => {},
    });
  }

  protected markAllRead(): void {
    this.service.markAllRead().subscribe({
      next: () => {
        this.items.update((list) => list.map((i) => ({ ...i, isRead: true })));
        this.store.refreshUnreadCount(true);
      },
      error: () => {},
    });
  }

  protected viewAll(): void {
    this.panelOpen.set(false);
    this.router.navigate(['/push-notifications']);
  }

  protected formatTime(value: string): string {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('ar-EG', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
