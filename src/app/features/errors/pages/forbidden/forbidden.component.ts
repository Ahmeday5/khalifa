import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Landing page for screens the current user isn't authorized to open —
 * reached when an access guard rejects a hand-typed / bookmarked URL.
 * Deliberately calm: no error toast, just an explanation and a way home.
 */
@Component({
  selector: 'app-forbidden',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <section class="forbidden" role="alert" aria-live="polite">
      <div class="forbidden__icon" aria-hidden="true">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
          <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.6" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
      </div>
      <h1 class="forbidden__title">غير مصرح لك</h1>
      <p class="forbidden__text">
        ليس لديك صلاحية للوصول إلى هذه الصفحة. إذا كنت تعتقد أن هذا خطأ، تواصل مع مدير النظام.
      </p>
      <a class="btn btn-sm btn-bl" routerLink="/dashboard">العودة إلى الرئيسية</a>
    </section>
  `,
  styles: `
    .forbidden {
      max-width: 440px;
      margin: 64px auto;
      padding: 32px 24px;
      text-align: center;
      background: var(--bg2);
      border: 1px solid var(--brd);
      border-radius: var(--rl);
      box-shadow: var(--shadow);
    }
    .forbidden__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 64px;
      height: 64px;
      margin-bottom: 16px;
      border-radius: 50%;
      color: var(--am);
      background: var(--am-l, var(--bg3));
    }
    .forbidden__title {
      margin: 0 0 8px;
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--txt);
    }
    .forbidden__text {
      margin: 0 0 20px;
      font-size: 0.9rem;
      line-height: 1.7;
      color: var(--txt2);
    }
  `,
})
export class ForbiddenComponent {}
