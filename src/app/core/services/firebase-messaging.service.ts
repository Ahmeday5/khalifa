import { Injectable, NgZone, inject } from '@angular/core';
import { FirebaseApp, initializeApp } from 'firebase/app';
import {
  Messaging,
  getMessaging,
  getToken,
  onMessage,
} from 'firebase/messaging';

import { environment } from '../../../environments/environment';
import { PushNotificationsService } from '../../features/push-notifications/services/push-notifications.service';
import { HttpCacheService } from './http-cache.service';
import { ToastService } from './toast.service';

/**
 * Thin wrapper around the Firebase JS SDK for FCM push notifications.
 *
 * Kept free of any `AuthService` dependency (only depends on
 * `PushNotificationsService`/`HttpCacheService`/`ToastService`) so
 * `AuthService` can call it without a circular-DI hazard.
 */
@Injectable({ providedIn: 'root' })
export class FirebaseMessagingService {
  private readonly zone = inject(NgZone);
  private readonly pushNotifications = inject(PushNotificationsService);
  private readonly cache = inject(HttpCacheService);
  private readonly toast = inject(ToastService);

  private app: FirebaseApp | null = null;
  private messaging: Messaging | null = null;
  private foregroundListenerAttached = false;

  private isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      'serviceWorker' in navigator
    );
  }

  private ensureInitialized(): Messaging | null {
    if (!this.isSupported()) return null;
    if (!this.app) this.app = initializeApp(environment.firebase);
    if (!this.messaging) this.messaging = getMessaging(this.app);
    return this.messaging;
  }

  /**
   * Requests browser notification permission and, if granted, registers
   * the FCM device token with the backend. Best-effort — never throws,
   * so callers (login/bootstrap) can fire-and-forget this.
   */
  async requestPermissionAndRegister(): Promise<void> {
    const messaging = this.ensureInitialized();
    if (!messaging) return;

    try {
      const registration = await navigator.serviceWorker.register(
        '/firebase-messaging-sw.js',
      );

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      const token = await getToken(messaging, {
        vapidKey: environment.firebaseVapidKey,
        serviceWorkerRegistration: registration,
      });
      if (!token) return;

      this.pushNotifications.registerDevice(token).subscribe({ error: () => {} });
    } catch {
      // Best-effort — never block login/bootstrap on notification setup.
    }
  }

  /** Wires the foreground (tab-open) message handler. Safe to call multiple times. */
  onForegroundMessage(): void {
    if (this.foregroundListenerAttached) return;
    const messaging = this.ensureInitialized();
    if (!messaging) return;

    this.foregroundListenerAttached = true;
    onMessage(messaging, (payload) => {
      this.zone.run(() => {
        this.toast.info(payload.notification?.title ?? 'إشعار جديد');
        this.cache.invalidate('notification');
      });
    });
  }
}
