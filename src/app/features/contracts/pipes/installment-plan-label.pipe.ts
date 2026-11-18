import { Pipe, PipeTransform } from '@angular/core';

import { environment } from '../../../../environments/environment';
import { InstallmentTier } from '../models/installment-tier.model';
import { formatTiersLabel } from '../utils/installment-tiers.util';

/** Money formatter shared by every plan label — same digits/currency as `currencyAr`, but keeps up to 2 decimals. */
export function formatPlanAmount(amount: number): string {
  return `${amount.toLocaleString('ar-SA', { maximumFractionDigits: 2 })} ${environment.currency}`;
}

/**
 * Renders a tiered plan as **"١٬٠٠٠ ج.م × 5 شهور، ثم ٥٠٠ ج.م × 5 شهور"**.
 *
 * Usage: `{{ tiers | installmentPlanLabel }}`
 */
@Pipe({ name: 'installmentPlanLabel', standalone: true })
export class InstallmentPlanLabelPipe implements PipeTransform {
  transform(tiers: readonly InstallmentTier[] | null | undefined): string {
    if (!tiers?.length) return '—';
    return formatTiersLabel(tiers, formatPlanAmount);
  }
}
