import { Pipe, PipeTransform } from '@angular/core';
import { VoucherType } from '../enums/voucher.enums';
import { VOUCHER_TYPE_LABELS } from '../constants/voucher-labels';

/**
 * Resolves a `VoucherType` wire value (e.g. `"Receipt"`) to its Arabic label.
 * Falls back to the raw value when the type is unknown, so unexpected
 * enum values from the backend remain visible rather than being silently
 * blanked out.
 */
@Pipe({ name: 'voucherTypeLabel', standalone: true })
export class VoucherTypeLabelPipe implements PipeTransform {
  transform(value: VoucherType | string | null | undefined): string {
    if (!value) return '—';
    return VOUCHER_TYPE_LABELS[value as VoucherType] ?? value;
  }
}
