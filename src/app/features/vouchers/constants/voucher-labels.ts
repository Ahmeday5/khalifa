import { BadgeType } from '../../../shared/components/badge/badge.component';
import {
  ReferenceType,
  RelatedPartyType,
  VoucherType,
} from '../enums/voucher.enums';

/* ────────────────────────────────────────────────────────────────
   Voucher type — Receipt / Payment
   ──────────────────────────────────────────────────────────────── */

export const VOUCHER_TYPE_LABELS: Readonly<Record<VoucherType, string>> = {
  [VoucherType.Receipt]: 'سند قبض',
  [VoucherType.Payment]: 'سند صرف',
};

export const VOUCHER_TYPE_BADGE: Readonly<Record<VoucherType, BadgeType>> = {
  [VoucherType.Receipt]: 'ok',
  [VoucherType.Payment]: 'bad',
};

export const VOUCHER_TYPE_OPTIONS: ReadonlyArray<{
  value: VoucherType;
  label: string;
}> = [
  { value: VoucherType.Receipt, label: VOUCHER_TYPE_LABELS[VoucherType.Receipt] },
  { value: VoucherType.Payment, label: VOUCHER_TYPE_LABELS[VoucherType.Payment] },
];

/* ────────────────────────────────────────────────────────────────
   Reference type
   ──────────────────────────────────────────────────────────────── */

export const REFERENCE_TYPE_LABELS: Readonly<Record<ReferenceType, string>> = {
  [ReferenceType.Installment]: 'قسط',
  [ReferenceType.SupplierPayment]: 'سداد مورد',
  [ReferenceType.Expense]: 'مصروف',
  [ReferenceType.ContractDownPayment]: 'مقدم عقد',
  [ReferenceType.TransferIn]: 'تحويل وارد',
  [ReferenceType.TransferOut]: 'تحويل صادر',
  [ReferenceType.Other]: 'أخرى',
  [ReferenceType.Contract]: 'عقد',
  [ReferenceType.SupplierPurchase]: 'فاتورة مشتريات',
  [ReferenceType.ClientOrder]: 'طلب عميل',
  [ReferenceType.ShareholderCapital]: 'رأس مال مساهم',
  [ReferenceType.ProfitAccrual]: 'ربح مستحق',
  [ReferenceType.ProfitDistribution]: 'توزيع أرباح',
};

export const REFERENCE_TYPE_BADGE: Readonly<Record<ReferenceType, BadgeType>> = {
  [ReferenceType.Installment]: 'info',
  [ReferenceType.SupplierPayment]: 'warn',
  [ReferenceType.Expense]: 'bad',
  [ReferenceType.ContractDownPayment]: 'teal',
  [ReferenceType.TransferIn]: 'ok',
  [ReferenceType.TransferOut]: 'warn',
  [ReferenceType.Other]: 'info',
  [ReferenceType.Contract]: 'purple',
  [ReferenceType.SupplierPurchase]: 'warn',
  [ReferenceType.ClientOrder]: 'pink',
  [ReferenceType.ShareholderCapital]: 'teal',
  [ReferenceType.ProfitAccrual]: 'ok',
  [ReferenceType.ProfitDistribution]: 'purple',
};

export const REFERENCE_TYPE_OPTIONS: ReadonlyArray<{
  value: ReferenceType;
  label: string;
}> = (Object.keys(REFERENCE_TYPE_LABELS) as ReferenceType[]).map((value) => ({
  value,
  label: REFERENCE_TYPE_LABELS[value],
}));

/* ────────────────────────────────────────────────────────────────
   Related-party type
   ──────────────────────────────────────────────────────────────── */

export const RELATED_PARTY_TYPE_LABELS: Readonly<
  Record<RelatedPartyType, string>
> = {
  [RelatedPartyType.Customer]: 'عميل',
  [RelatedPartyType.Supplier]: 'مورد',
  [RelatedPartyType.Other]: 'أخرى',
  [RelatedPartyType.Shareholder]: 'مساهم',
};

export const RELATED_PARTY_TYPE_BADGE: Readonly<
  Record<RelatedPartyType, BadgeType>
> = {
  [RelatedPartyType.Customer]: 'info',
  [RelatedPartyType.Supplier]: 'purple',
  [RelatedPartyType.Other]: 'warn',
  [RelatedPartyType.Shareholder]: 'teal',
};

export const RELATED_PARTY_TYPE_OPTIONS: ReadonlyArray<{
  value: RelatedPartyType;
  label: string;
}> = (Object.keys(RELATED_PARTY_TYPE_LABELS) as RelatedPartyType[]).map(
  (value) => ({ value, label: RELATED_PARTY_TYPE_LABELS[value] }),
);
