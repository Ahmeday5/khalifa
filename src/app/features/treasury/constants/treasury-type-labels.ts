import { BadgeType } from '../../../shared/components/badge/badge.component';
import { TreasuryType } from '../enums/treasury-type.enum';

/** Dropdown options + Arabic labels for treasury types. */
export const TREASURY_TYPE_OPTIONS: ReadonlyArray<{
  value: TreasuryType;
  label: string;
}> = [
  { value: TreasuryType.Main, label: 'رئيسية' },
  { value: TreasuryType.SubRepresentative, label: 'مندوب فرعي' },
  { value: TreasuryType.Bank, label: 'بنك' },
];

/** O(1) Arabic label lookup keyed by enum value. */
export const TREASURY_TYPE_LABELS: Readonly<Record<TreasuryType, string>> = {
  [TreasuryType.Main]: 'رئيسية',
  [TreasuryType.SubRepresentative]: 'مندوب فرعي',
  [TreasuryType.Bank]: 'بنك',
  [TreasuryType.Profits]: 'أرباح',
  [TreasuryType.SubRepresentativeProfits]: 'أرباح مندوبين',
  [TreasuryType.CompanyProfits]: 'أرباح الشركة',
};

/** Visual badge tone per type — keeps the UI consistent across screens. */
export const TREASURY_TYPE_BADGE: Readonly<Record<TreasuryType, BadgeType>> = {
  [TreasuryType.Main]: 'teal',
  [TreasuryType.SubRepresentative]: 'info',
  [TreasuryType.Bank]: 'purple',
  [TreasuryType.Profits]: 'ok',
  [TreasuryType.SubRepresentativeProfits]: 'warn',
  [TreasuryType.CompanyProfits]: 'purple',
};
