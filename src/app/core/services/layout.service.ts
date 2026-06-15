import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LayoutService {
  readonly collapsed  = signal(false);
  readonly mobileOpen = signal(false);

  toggleCollapsed(): void { this.collapsed.update((v) => !v); }
  openMobile(): void      { this.mobileOpen.set(true); }
  closeMobile(): void     { this.mobileOpen.set(false); }
  toggleMobile(): void    { this.mobileOpen.update((v) => !v); }
}
