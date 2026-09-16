import { Injectable, effect, inject, signal, untracked } from '@angular/core';

import { PushNotificationsService } from '../../features/push-notifications/services/push-notifications.service';
import { HttpCacheService } from '../services/http-cache.service';

/**
 * Live unread-notification counter for the topbar bell badge — mirrors
 * `NavCountsStore`'s counter pattern, kept in its own store since it has a
 * distinct invalidation trigger (`'notification'`) and no shared source
 * data with the nav badges.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsStore {
  private readonly pushNotifications = inject(PushNotificationsService);
  private readonly cache = inject(HttpCacheService);

  private readonly _unreadCount = signal<number>(0);
  private readonly _unreadPulse = signal(0);

  readonly unreadCount = this._unreadCount.asReadonly();
  readonly unreadPulse = this._unreadPulse.asReadonly();

  constructor() {
    this.refreshUnreadCount(false);

    effect(() => {
      const event = this.cache.invalidations();
      if (!event.pattern?.includes('notification')) return;
      untracked(() => this.refreshUnreadCount(true));
    });
  }

  refreshUnreadCount(force = true): void {
    this.pushNotifications.unreadCount(force).subscribe({
      next: (count) => {
        const prev = this._unreadCount();
        this._unreadCount.set(count);
        if (count > prev) this._unreadPulse.update((t) => t + 1);
      },
      error: () => {},
    });
  }
}
