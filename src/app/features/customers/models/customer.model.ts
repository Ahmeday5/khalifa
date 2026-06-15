export type CreditScore       = 'A' | 'B' | 'C' | 'D';
export type PaymentStatus     = 'current' | 'late' | 'defaulted' | 'new';
export type InstallmentPeriod = 'شهري' | 'أسبوعي' | 'ربع سنوي' | 'نصف سنوي';
export type InstallmentStatus = 'paid' | 'partial' | 'late' | 'upcoming';
export type PaymentMethod     = 'نقدي' | 'تحويل' | 'مدى' | 'STC Pay' | 'Apple Pay';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  nationalId: string;
  creditScore: CreditScore;
  product: string;
  totalInstallments: number;
  paidInstallments: number;
  installmentAmount: number;
  totalAmount: number;
  remainingAmount: number;
  dueAmount: number;
  paymentStatus: PaymentStatus;
  installmentPeriod: InstallmentPeriod;
  startDate: string;
  lastPaymentDate: string | null;
  repId: string | null;
  repName: string | null;
  notes: string;
}

export interface CustomerFormData {
  name: string;
  phone: string;
  nationalId: string;
  cashPrice: number;
  downPayment: number;
  profitRate: number;
  installmentsCount: number;
  installmentPeriod: InstallmentPeriod;
  costPrice: number;
  repId: string | null;
  notes: string;
  // Extended optional — used by full contract tab
  address?: string;
  product?: string;
  purchaseDate?: string;
  dueDay?: number;
  firstInstallmentDate?: string;
}

export interface InstallmentRow {
  num: number;
  period: string;
  due: number;
  paid: number;
  remaining: number;
  paymentDate: string | null;
  method: string | null;
  status: InstallmentStatus;
}

export interface PaymentRecord {
  id: string;
  customerName: string;
  amount: number;
  date: string;
  method: PaymentMethod;
  status: 'complete' | 'partial' | 'remainder';
}

export interface PaymentContractOption {
  id: string;
  label: string;
  due: number;
  prevPaid: number;
  totalDue: number;
}

export interface RescheduleRequest {
  id: string;
  customerName: string;
  type: string;
  date: string;
  status: 'accepted' | 'pending' | 'rejected';
}

export interface CreditRatingItem {
  customerId: string;
  customerName: string;
  activeContracts: number;
  commitmentRate: number;
  avgDelayDays: number;
  rescheduleCount: number;
  historyDesc: string;
  score: CreditScore;
  numericScore: number;
  recommendation: string;
}
