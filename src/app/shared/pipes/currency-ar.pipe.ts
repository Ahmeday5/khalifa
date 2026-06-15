import { Pipe, PipeTransform } from '@angular/core';
import { environment } from '../../../environments/environment';

@Pipe({ name: 'currencyAr', standalone: true })
export class CurrencyArPipe implements PipeTransform {
  transform(value: number | null | undefined, showZero = false): string {
    if (value === null || value === undefined) return '—';
    if (value <= 0 && !showZero) return '—';
    return `${Math.round(value).toLocaleString('ar-SA')} ${environment.currency}`;
  }
}
