import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'dateAr', standalone: true })
export class DateArPipe implements PipeTransform {
  private readonly months = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ];

  transform(value: string | Date | null | undefined, format: 'short' | 'long' = 'long'): string {
    if (!value) return '—';
    const date = typeof value === 'string' ? new Date(value) : value;
    if (isNaN(date.getTime())) return '—';

    const d = date.getDate();
    const m = this.months[date.getMonth()];
    const y = date.getFullYear();

    return format === 'short' ? `${d}/${date.getMonth() + 1}/${y}` : `${d} ${m} ${y}`;
  }
}
