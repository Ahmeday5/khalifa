import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { animate, query, stagger, style, transition, trigger } from '@angular/animations';
import { Toast, ToastService } from '../../../core/services/toast.service';

/**
 * Toast container — owns the visual presentation; the lifecycle (timers,
 * pausing, dismissal) lives in `ToastService` so the timer state is correct
 * even when the component is recreated.
 */
@Component({
  selector: 'app-toast',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './toast.component.html',
  styleUrl: './toast.component.scss',
  animations: [
    trigger('toastList', [
      transition('* => *', [
        query(
          ':enter',
          [
            style({ opacity: 0, transform: 'translateX(-110%)' }),
            stagger(40, [
              animate(
                '220ms cubic-bezier(0.22, 1, 0.36, 1)',
                style({ opacity: 1, transform: 'translateX(0)' }),
              ),
            ]),
          ],
          { optional: true },
        ),
        query(
          ':leave',
          [
            animate(
              '180ms ease-in',
              style({ opacity: 0, transform: 'translateX(-110%) scale(0.96)' }),
            ),
          ],
          { optional: true },
        ),
      ]),
    ]),
  ],
})
export class ToastComponent {
  private readonly service = inject(ToastService);

  protected readonly toasts = this.service.toasts;
  protected readonly position = this.service.position;

  protected readonly positionClass = computed(() => `tc-${this.position()}`);

  protected dismiss(id: string): void {
    this.service.dismiss(id);
  }

  protected onMouseEnter(id: string): void {
    this.service.pause(id);
  }

  protected onMouseLeave(id: string): void {
    this.service.resume(id);
  }

  protected onAction(toast: Toast): void {
    if (!toast.action) return;
    toast.action.handler();
    this.dismiss(toast.id);
  }

  /**
   * Linear progress bar percentage. Reads `pausedAt` so when the timer is
   * paused the bar visually freezes (we don't recompute every frame — CSS
   * animation handles the smooth motion via `--toast-duration`).
   */
  protected isPaused(toast: Toast): boolean {
    return toast.pausedAt !== null;
  }
}
