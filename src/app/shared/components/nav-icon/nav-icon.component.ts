import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export type NavIconName =
  | 'home'
  | 'users'
  | 'box'
  | 'user-tie'
  | 'truck'
  | 'file-invoice'
  | 'warehouse'
  | 'products'
  | 'warning'
  | 'wallet'
  | 'hand-coin'
  | 'whatsapp'
  | 'user-cog'
  | 'clipboard'
  | 'chart'
  | 'file-pdf'
  | 'tag'
  | 'receipt';

@Component({
  selector: 'app-nav-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size"
      [attr.height]="size"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      @switch (name) {
        @case ('home') {
          <path d="M3 11l9-7 9 7v9a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2v-9z" />
        }
        @case ('users') {
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
          <circle cx="17" cy="9" r="2.6" />
          <path d="M15.5 14.5c2.3.5 4.5 2.4 4.5 5.5" />
        }
        @case ('box') {
          <path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5v-9z" />
          <path d="M3.5 7.5L12 12l8.5-4.5" />
          <path d="M12 12v9" />
        }
        @case ('user-tie') {
          <circle cx="12" cy="7" r="3.2" />
          <path d="M12 10.5l-1.4 2 1.4 8 1.4-8-1.4-2z" />
          <path d="M5 21c0-3.5 3.1-6.5 7-6.5s7 3 7 6.5" />
        }
        @case ('truck') {
          <path d="M2 7h11v9H2z" />
          <path d="M13 10h5l3 3v3h-8z" />
          <circle cx="6.5" cy="17.5" r="1.8" />
          <circle cx="17.5" cy="17.5" r="1.8" />
        }
        @case ('file-invoice') {
          <path d="M6 3h8l4 4v14H6z" />
          <path d="M14 3v4h4" />
          <path d="M9 11h6M9 14h6M9 17h4" />
        }
        @case ('warehouse') {
          <path d="M3 10l9-5 9 5v11H3z" />
          <path d="M7 21v-7h10v7" />
          <path d="M7 17h10" />
        }
        @case ('products') {
          <path d="M20.5 7.5L13 3.5a2 2 0 0 0-2 0L3.5 7.5a1 1 0 0 0-.5.9v7.2a1 1 0 0 0 .5.9L11 20.5a2 2 0 0 0 2 0l7.5-4a1 1 0 0 0 .5-.9V8.4a1 1 0 0 0-.5-.9z" />
          <path d="M3.3 8L12 12.5 20.7 8" />
          <path d="M12 12.5V21" />
          <path d="M7.5 5.7l9 4.8" />
        }
        @case ('warning') {
          <path d="M12 3l10 17H2L12 3z" />
          <path d="M12 10v5" />
          <circle cx="12" cy="17.5" r=".7" fill="currentColor" />
        }
        @case ('wallet') {
          <path d="M3 7a2 2 0 0 1 2-2h12v3" />
          <path d="M3 7v11a2 2 0 0 0 2 2h15V8H5a2 2 0 0 1-2-1z" />
          <circle cx="17" cy="14" r="1.3" fill="currentColor" />
        }
        @case ('hand-coin') {
          <circle cx="15" cy="7" r="3.5" />
          <path d="M3 14l3-1 4 1 5-2 4 2v4l-7 3-9-3v-4z" />
        }
        @case ('whatsapp') {
          <path d="M4 20l1.4-4.2A8 8 0 1 1 9.4 19L4 20z" />
          <path d="M9 10c.5 2 2 3.5 4 4l1.5-1.2 2.5.9-.6 2.4c-3 .3-7-1.7-8.6-5.6l1.8-1 1 1.5L9 10z" fill="currentColor" stroke="none" />
        }
        @case ('user-cog') {
          <circle cx="10" cy="8" r="3.2" />
          <path d="M3 20c0-3.6 3.1-6.5 7-6.5 1 0 2 .2 2.8.5" />
          <circle cx="18" cy="17" r="2.4" />
          <path d="M18 13.5v1.4M18 19.1v1.4M21.5 17h-1.4M15.9 17h-1.4" />
        }
        @case ('clipboard') {
          <rect x="6" y="4" width="12" height="17" rx="2" />
          <rect x="9" y="2.5" width="6" height="3" rx="1" fill="currentColor" stroke="none" />
          <path d="M9 11h6M9 14h6M9 17h4" />
        }
        @case ('chart') {
          <path d="M3 21h18" />
          <rect x="5" y="12" width="3" height="7" />
          <rect x="10.5" y="8" width="3" height="11" />
          <rect x="16" y="4" width="3" height="15" />
        }
        @case ('file-pdf') {
          <path d="M6 3h8l4 4v14H6z" />
          <path d="M14 3v4h4" />
          <path d="M8.5 17v-4h1.2a1.4 1.4 0 1 1 0 2.8H8.5" />
          <path d="M13 17v-4h1.6a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2H13z" />
          <path d="M18 13h2M18 15h2" />
        }
        @case ('tag') {
          <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
          <circle cx="7.2" cy="7.2" r="1.2" fill="currentColor" stroke="none" />
        }
        @case ('receipt') {
          <path d="M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5V3z" />
          <path d="M9 8h6M9 12h6M9 16h4" />
        }
      }
    </svg>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        line-height: 0;
      }
      svg {
        display: block;
      }
    `,
  ],
})
export class NavIconComponent {
  @Input({ required: true }) name!: NavIconName;
  @Input() size = 16;
}
