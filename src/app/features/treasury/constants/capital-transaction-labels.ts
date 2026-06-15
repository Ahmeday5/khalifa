import { BadgeType } from '../../../shared/components/badge/badge.component';
import {
  CapitalTransactionDirection,
  CapitalTransactionType,
} from '../models/capital-transaction.model';

/* ────────────────────────────────────────────────────────────────
   Request type — Receipt (إيداع) / Payment (سحب)
   ──────────────────────────────────────────────────────────────── */

export const CAPITAL_TX_TYPE_OPTIONS: ReadonlyArray<{
  value: CapitalTransactionType;
  label: string;
}> = [
  { value: CapitalTransactionType.Receipt, label: 'إيداع رأس مال' },
  { value: CapitalTransactionType.Payment, label: 'سحب من رأس المال' },
];

/* ────────────────────────────────────────────────────────────────
   Server direction — Deposit / Payment / ProfitCapitalization
   ──────────────────────────────────────────────────────────────── */

export const CAPITAL_TX_DIRECTION_LABELS: Readonly<
  Record<CapitalTransactionDirection, string>
> = {
  Deposit: 'إيداع',
  Payment: 'سحب',
  ProfitCapitalization: 'ترحيل أرباح',
};

export const CAPITAL_TX_DIRECTION_BADGE: Readonly<
  Record<CapitalTransactionDirection, BadgeType>
> = {
  Deposit: 'ok',
  Payment: 'bad',
  ProfitCapitalization: 'purple',
};

/** A movement that increases the shareholder's capital (used for sign/colour). */
export function isCapitalInflow(
  direction: CapitalTransactionDirection,
): boolean {
  return direction === 'Deposit' || direction === 'ProfitCapitalization';
}
