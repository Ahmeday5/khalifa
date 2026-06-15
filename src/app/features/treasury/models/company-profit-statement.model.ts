export type CompanyProfitVoucherType = 'Receipt' | 'Payment';

export type CompanyProfitReferenceType =
  | 'ShareholderProfitCapitalization'
  | 'ProfitDistribution'
  | string;

export interface CompanyProfitEntry {
  id: number;
  date: string;
  voucherType: CompanyProfitVoucherType;
  amount: number;
  balanceAfter: number;
  referenceType: CompanyProfitReferenceType;
  referenceId: number;
  shareholderId: number | null;
  shareholderName: string | null;
  notes: string | null;
}

export interface CompanyProfitStatement {
  totalReceived: number;
  totalPaid: number;
  currentBalance: number;
  entries: {
    pageIndex: number;
    pageSize: number;
    count: number;
    totalPages: number;
    data: CompanyProfitEntry[];
  };
}

export interface CompanyProfitStatementQuery {
  pageIndex?: number;
  pageSize?: number;
  fromDate?: string;
  toDate?: string;
}
