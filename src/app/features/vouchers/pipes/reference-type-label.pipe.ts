import { Pipe, PipeTransform } from '@angular/core';
import { ReferenceType } from '../enums/voucher.enums';
import { REFERENCE_TYPE_LABELS } from '../constants/voucher-labels';

/** Wire-value → Arabic label for `ReferenceType`. */
@Pipe({ name: 'referenceTypeLabel', standalone: true })
export class ReferenceTypeLabelPipe implements PipeTransform {
  transform(value: ReferenceType | string | null | undefined): string {
    if (!value) return '—';
    return REFERENCE_TYPE_LABELS[value as ReferenceType] ?? value;
  }
}
