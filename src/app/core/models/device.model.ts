export interface DeviceInfo {
  /** Stable per-browser identifier persisted in localStorage. */
  deviceId: string;
  /** Human-readable summary sent in `deviceInfo` (browser, OS, screen). */
  deviceInfo: string;
}
