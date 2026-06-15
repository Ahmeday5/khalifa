/**
 * Wire-format enums returned by the vouchers API. Values match the JSON
 * payload (string names — not the underlying numeric codes), so they can be
 * compared directly with API responses without translation at the boundary.
 */

export enum VoucherType {
  Receipt = 'Receipt',
  Payment = 'Payment',
}

export enum ReferenceType {
  Installment = 'Installment',
  SupplierPayment = 'SupplierPayment',
  Expense = 'Expense',
  ContractDownPayment = 'ContractDownPayment',
  TransferIn = 'TransferIn',
  TransferOut = 'TransferOut',
  Other = 'Other',
  Contract = 'Contract',
  SupplierPurchase = 'SupplierPurchase',
  ClientOrder = 'ClientOrder',
  ShareholderCapital = 'ShareholderCapital',
  ProfitAccrual = 'ProfitAccrual',
  ProfitDistribution = 'ProfitDistribution',
}

export enum RelatedPartyType {
  Customer = 'Customer',
  Supplier = 'Supplier',
  Other = 'Other',
  Shareholder = 'Shareholder',
}
