import { Injectable, signal } from '@angular/core';
import { generateUUID } from '../../shared/utils/uuid.util';

export type ToastType = 'success' | 'error' | 'warning' | 'info';
export type ToastPosition = 'top-right' | 'top-left' | 'top-center' | 'bottom-right' | 'bottom-left' | 'bottom-center';

export interface ToastAction {
  label: string;
  handler: () => void;
}

export interface Toast {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  /** Total auto-dismiss duration in ms. `0` = sticky (no auto-dismiss). */
  duration: number;
  /** Whether the user can close it before auto-dismiss. */
  closable: boolean;
  /** Optional inline action (e.g. "تراجع", "عرض"). */
  action?: ToastAction;
  /** Internal — when the toast was first shown (for progress bar math). */
  createdAt: number;
  /** Internal — paused timestamp; null when running. */
  pausedAt: number | null;
  /** Internal — accumulated paused milliseconds. */
  pausedFor: number;
  /** Internal — pending setTimeout handle for auto-dismiss. */
  timerId: ReturnType<typeof setTimeout> | null;
}

export interface ToastOptions {
  title?: string;
  duration?: number;
  closable?: boolean;
  action?: ToastAction;
}

const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 3500,
  info: 3500,
  warning: 5000,
  error: 6000,
};

const MAX_VISIBLE = 5;

/**
 * Toast notifications.
 *
 *   toast.success('تم الحفظ');
 *   toast.error('فشل الاتصال', { title: 'خطأ', action: { label: 'إعادة', handler: retry } });
 *   toast.info('جاري الإرسال', { duration: 0 }); // sticky
 *
 * Component-side concerns (hover-pause, progress) call `pause()` / `resume()`
 * back into the service so the in-flight timer is paused on the source of
 * truth, not just visually.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly toastsSignal = signal<Toast[]>([]);
  readonly toasts = this.toastsSignal.asReadonly();

  readonly position = signal<ToastPosition>('top-left');

  // ─────────── public API ───────────

  success(message: string, options?: ToastOptions): string {
    return this.show('success', message, options);
  }

  error(message: string, options?: ToastOptions): string {
    return this.show('error', message, options);
  }

  warning(message: string, options?: ToastOptions): string {
    return this.show('warning', message, options);
  }

  info(message: string, options?: ToastOptions): string {
    return this.show('info', message, options);
  }

  /** Dismiss a single toast by id. */
  dismiss(id: string): void {
    const list = this.toastsSignal();
    const target = list.find((t) => t.id === id);
    if (target?.timerId) clearTimeout(target.timerId);
    this.toastsSignal.set(list.filter((t) => t.id !== id));
  }

  /** Dismiss every visible toast (e.g. on logout / route change). */
  clear(): void {
    for (const t of this.toastsSignal()) {
      if (t.timerId) clearTimeout(t.timerId);
    }
    this.toastsSignal.set([]);
  }

  /** Pause auto-dismiss (called when the user hovers over a toast). */
  pause(id: string): void {
    this.toastsSignal.update((list) =>
      list.map((t) => {
        if (t.id !== id || t.pausedAt !== null || t.duration === 0) return t;
        if (t.timerId) clearTimeout(t.timerId);
        return { ...t, timerId: null, pausedAt: Date.now() };
      }),
    );
  }

  /** Resume auto-dismiss with the remaining time. */
  resume(id: string): void {
    this.toastsSignal.update((list) =>
      list.map((t) => {
        if (t.id !== id || t.pausedAt === null) return t;
        const pauseDuration = Date.now() - t.pausedAt;
        const elapsed = t.pausedAt - t.createdAt - t.pausedFor;
        const remaining = Math.max(200, t.duration - elapsed);
        const timerId = setTimeout(() => this.dismiss(id), remaining);
        return {
          ...t,
          timerId,
          pausedAt: null,
          pausedFor: t.pausedFor + pauseDuration,
        };
      }),
    );
  }

  // ─────────── internals ───────────

  private show(type: ToastType, message: string, options?: ToastOptions): string {
    // Deduplicate: if an identical toast is already visible, extend its timer
    // rather than stacking a clone. This prevents flooding when multiple
    // concurrent requests fail with the same message (e.g. startup 401 storm).
    const dup = this.toastsSignal().find(
      (t) => t.type === type && t.message === message,
    );
    if (dup) return dup.id;

    const id = generateUUID();
    const duration = options?.duration ?? DEFAULT_DURATION[type];
    const toast: Toast = {
      id,
      type,
      title: options?.title,
      message,
      duration,
      closable: options?.closable ?? true,
      action: options?.action,
      createdAt: Date.now(),
      pausedAt: null,
      pausedFor: 0,
      timerId:
        duration > 0 ? setTimeout(() => this.dismiss(id), duration) : null,
    };

    this.toastsSignal.update((list) => {
      const next = [...list, toast];
      // Cap visible toasts — drop the oldest beyond the cap (preserves the
      // newest user-visible information).
      if (next.length > MAX_VISIBLE) {
        const dropped = next.shift();
        if (dropped?.timerId) clearTimeout(dropped.timerId);
      }
      return next;
    });

    return id;
  }
}
