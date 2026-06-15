import { Injectable } from '@angular/core';

/**
 * Thin wrapper around `localStorage` that:
 *   - never throws (handles SSR / disabled storage / quota errors)
 *   - serializes JSON via typed helpers
 *
 * All app code must go through this service so we have a single seam to swap
 * implementations (e.g. cookies, IndexedDB) later if needed.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private get store(): Storage | null {
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
      return null;
    }
  }

  get(key: string): string | null {
    try {
      return this.store?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  
  set(key: string, value: string): void {
    try {
      this.store?.setItem(key, value);
    } catch {
      /* quota / disabled — ignore */
    }
  }

  remove(key: string): void {
    try {
      this.store?.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  getJson<T>(key: string): T | null {
    const raw = this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  setJson<T>(key: string, value: T): void {
    try {
      this.set(key, JSON.stringify(value));
    } catch {
      /* circular / non-serializable — ignore */
    }
  }
}
