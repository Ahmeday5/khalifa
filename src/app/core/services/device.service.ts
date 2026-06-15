import { Injectable, inject } from '@angular/core';
import { StorageService } from './storage.service';
import { generateUUID } from '../../shared/utils/uuid.util';
import { DeviceInfo } from '../models/device.model';

const DEVICE_ID_KEY = 'taqseet_device_id';

/**
 * Resolves a stable per-browser identifier and a human-readable summary that
 * the backend uses for session/audit binding.
 *
 * `deviceId` is generated once and persisted. Clearing localStorage rotates
 * it — that's intentional (treated as a new device on the server).
 */
@Injectable({ providedIn: 'root' })
export class DeviceService {
  private readonly storage = inject(StorageService);
  private cached: DeviceInfo | null = null;

  getInfo(): DeviceInfo {
    if (this.cached) return this.cached;

    this.cached = {
      deviceId: this.resolveDeviceId(),
      deviceInfo: this.buildDeviceSummary(),
    };
    return this.cached;
  }

  private resolveDeviceId(): string {
    const existing = this.storage.get(DEVICE_ID_KEY);
    if (existing) return existing;

    const fresh = generateUUID();
    this.storage.set(DEVICE_ID_KEY, fresh);
    return fresh;
  }

  private buildDeviceSummary(): string {
    if (typeof navigator === 'undefined') return 'unknown';

    const ua = navigator.userAgent || '';
    const platform = this.detectPlatform(ua);
    const browser = this.detectBrowser(ua);
    const screen =
      typeof window !== 'undefined' && window.screen
        ? `${window.screen.width}x${window.screen.height}`
        : 'unknown';
    const lang = navigator.language || 'unknown';

    return `${browser} on ${platform} | ${screen} | ${lang}`;
  }

  private detectPlatform(ua: string): string {
    if (/Windows NT 10/i.test(ua)) return 'Windows 10/11';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Android/i.test(ua)) return 'Android';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
    if (/Mac OS X/i.test(ua)) return 'macOS';
    if (/Linux/i.test(ua)) return 'Linux';
    return 'Unknown';
  }

  private detectBrowser(ua: string): string {
    if (/Edg\//i.test(ua)) return 'Edge';
    if (/OPR\//i.test(ua)) return 'Opera';
    if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) return 'Chrome';
    if (/Firefox\//i.test(ua)) return 'Firefox';
    if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) return 'Safari';
    return 'Browser';
  }
}
