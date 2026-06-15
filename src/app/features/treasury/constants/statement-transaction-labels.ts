import { BadgeType } from '../../../shared/components/badge/badge.component';
import { StatementTransactionType } from '../models/shareholder-statement.model';

export const STATEMENT_TX_LABELS: Readonly<Record<StatementTransactionType, string>> = {
  CapitalDeposit: 'إيداع رأس مال',
  CapitalWithdrawal: 'سحب رأس مال',
  ProfitCapitalization: 'ترحيل أرباح',
  ProfitDistribution: 'توزيع أرباح',
};

export const STATEMENT_TX_BADGE: Readonly<Record<StatementTransactionType, BadgeType>> = {
  CapitalDeposit: 'ok',
  CapitalWithdrawal: 'bad',
  ProfitCapitalization: 'purple',
  ProfitDistribution: 'teal',
};

/** Returns true when the transaction adds to or pays out from the shareholder's stake. */
export function isStatementInflow(type: StatementTransactionType): boolean {
  return type !== 'CapitalWithdrawal';
}
