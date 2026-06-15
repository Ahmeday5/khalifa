import { Pipe, PipeTransform } from '@angular/core';
import { RelatedPartyType } from '../enums/voucher.enums';
import { RELATED_PARTY_TYPE_LABELS } from '../constants/voucher-labels';

/** Wire-value → Arabic label for `RelatedPartyType`. */
@Pipe({ name: 'relatedPartyTypeLabel', standalone: true })
export class RelatedPartyTypeLabelPipe implements PipeTransform {
  transform(value: RelatedPartyType | string | null | undefined): string {
    if (!value) return '—';
    return RELATED_PARTY_TYPE_LABELS[value as RelatedPartyType] ?? value;
  }
}
