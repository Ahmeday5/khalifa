import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type BadgeType = 'ok' | 'warn' | 'bad' | 'info' | 'purple' | 'teal' | 'pink';

@Component({
  selector: 'app-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './badge.component.html',
  styleUrl: './badge.component.scss',
})
export class BadgeComponent {
  text = input.required<string>();
  type = input<BadgeType>('info');

  getBadgeClass(): string {
    const map: Record<BadgeType, string> = {
      ok:     'badge bok',
      warn:   'badge bwarn',
      bad:    'badge bbad',
      info:   'badge binfo',
      purple: 'badge bpu',
      teal:   'badge bte',
      pink:   'badge bpi',
    };
    return map[this.type()];
  }
}
