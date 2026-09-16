import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiService } from '../../../core/services/api.service';
import { API_ENDPOINTS } from '../../../core/constants/api-endpoints.const';
import {
  withCache,
  withCacheBypass,
  withCacheInvalidate,
  withInlineHandling,
} from '../../../core/http/http-context.tokens';
import {
  PushNotificationsPage,
  PushNotificationsQuery,
  RegisterDevicePayload,
  UnreadCountResponse,
} from '../models/push-notification.model';

const NOTIFICATIONS_CACHE_KEY = 'notification';
const NOTIFICATIONS_TTL_MS = 30 * 1000;

@Injectable({ providedIn: 'root' })
export class PushNotificationsService {
  private readonly api = inject(ApiService);

  list(query: PushNotificationsQuery = {}): Observable<PushNotificationsPage> {
    return this.api.get<PushNotificationsPage>(API_ENDPOINTS.notifications.base, {
      params: this.toParams(query),
      context: withCache({ ttlMs: NOTIFICATIONS_TTL_MS }),
    });
  }

  refreshList(
    query: PushNotificationsQuery = {},
  ): Observable<PushNotificationsPage> {
    return this.api.get<PushNotificationsPage>(API_ENDPOINTS.notifications.base, {
      params: this.toParams(query),
      context: withCacheBypass(withCache({ ttlMs: NOTIFICATIONS_TTL_MS })),
    });
  }

  unreadCount(force = false): Observable<number> {
    const stream$ = this.api.get<UnreadCountResponse>(
      API_ENDPOINTS.notifications.unreadCount,
      {
        context: force
          ? withCacheBypass(withCache({ ttlMs: NOTIFICATIONS_TTL_MS }))
          : withCache({ ttlMs: NOTIFICATIONS_TTL_MS }),
      },
    );
    return stream$.pipe(map((res) => res?.count ?? 0));
  }

  /**
   * Read-state is global/shared across all dashboard users — invalidating
   * the `'notification'` cache pattern (rather than an optimistic local
   * decrement) is what keeps every open tab/page correct.
   */
  markRead(id: number): Observable<void> {
    return this.api.post<void>(
      API_ENDPOINTS.notifications.markRead(id),
      {},
      {
        context: withInlineHandling(
          withCacheInvalidate([NOTIFICATIONS_CACHE_KEY]),
        ),
      },
    );
  }

  markAllRead(): Observable<void> {
    return this.api.post<void>(
      API_ENDPOINTS.notifications.markAllRead,
      {},
      {
        context: withInlineHandling(
          withCacheInvalidate([NOTIFICATIONS_CACHE_KEY]),
        ),
      },
    );
  }

  /** Best-effort — errors are swallowed by the caller (`FirebaseMessagingService`). */
  registerDevice(deviceToken: string): Observable<void> {
    const payload: RegisterDevicePayload = { deviceToken };
    return this.api.post<void>(
      API_ENDPOINTS.notifications.registerDevice,
      payload,
      { context: withInlineHandling() },
    );
  }

  private toParams(query: PushNotificationsQuery): Record<string, unknown> {
    return {
      PageIndex: query.pageIndex ?? 1,
      PageSize: query.pageSize ?? 10,
    };
  }
}
