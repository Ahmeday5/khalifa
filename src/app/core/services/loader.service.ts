import { Injectable, signal, computed } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoaderService {
  private readonly requestCount = signal(0);

  // true عندما يكون هناك طلب HTTP واحد على الأقل
  readonly isLoading = computed(() => this.requestCount() > 0);

  show(): void {
    this.requestCount.update((c) => c + 1);
  }

  hide(): void {
    this.requestCount.update((c) => Math.max(0, c - 1));
  }
}
