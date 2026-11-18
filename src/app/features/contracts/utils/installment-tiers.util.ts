import {
  InstallmentPreviewRow,
  InstallmentTier,
  InstallmentTierDraft,
  InstallmentTiersSummary,
} from '../models/installment-tier.model';

/**
 * Pure helpers for tiered installment plans ("تقسيط على أكثر من مبلغ").
 *
 * Framework-free on purpose: the same functions drive the editor's live
 * summary, the outgoing payload, edit-mode prefill, contract displays and
 * the printed slips — so every screen agrees on the same math.
 */

/** Two amounts closer than this are treated as equal (half a piastre). */
const MONEY_EPSILON = 0.005;

// ───────────────────────── money ─────────────────────────

/** Rounds to 2 decimals without the classic `1.005 → 1.00` float drift. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function moneyEquals(a: number, b: number): boolean {
  return Math.abs(a - b) < MONEY_EPSILON;
}

/** True when `value` has no more than two decimal places. */
export function hasAtMostTwoDecimals(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

// ───────────────────────── validation ─────────────────────────

/** A tier the backend will accept: integer count > 0, amount > 0 with ≤ 2 decimals. */
export function isValidTier(tier: InstallmentTierDraft | null | undefined): tier is InstallmentTier {
  if (!tier) return false;
  const count = Number(tier.count);
  const amount = Number(tier.amount);
  return (
    Number.isInteger(count) &&
    count > 0 &&
    Number.isFinite(amount) &&
    amount > 0 &&
    hasAtMostTwoDecimals(amount)
  );
}

/** At least one tier, and every tier valid. */
export function areValidTiers(tiers: readonly InstallmentTierDraft[] | null | undefined): boolean {
  return !!tiers && tiers.length > 0 && tiers.every(isValidTier);
}

/**
 * Coerces loosely-typed form values into clean wire tiers. Rows that are
 * not valid are dropped — callers must validate first when partial input
 * should block an action rather than be ignored.
 */
export function normalizeTiers(
  tiers: readonly InstallmentTierDraft[] | null | undefined,
): InstallmentTier[] {
  return (tiers ?? [])
    .map((t) => ({ count: Number(t?.count), amount: roundMoney(Number(t?.amount)) }))
    .filter(isValidTier);
}

// ───────────────────────── totals ─────────────────────────

/** Σ count — the contract's `installmentsCount` in tiered mode. */
export function sumTierCounts(tiers: readonly InstallmentTierDraft[]): number {
  return tiers.reduce((sum, t) => sum + (Number(t?.count) || 0), 0);
}

/** Σ (count × amount) — the total of all installments (excludes the down payment). */
export function sumTierAmounts(tiers: readonly InstallmentTierDraft[]): number {
  return roundMoney(
    tiers.reduce((sum, t) => sum + (Number(t?.count) || 0) * (Number(t?.amount) || 0), 0),
  );
}

/**
 * Live summary for the editor. Mirrors the server's formula:
 * `contractTotal = downPayment + Σ(count × amount)`.
 *
 * @param expectedTotal operator-entered total to reconcile against; pass
 *   `null`/`0` when there's nothing to compare.
 */
export function summarizeTiers(
  tiers: readonly InstallmentTierDraft[],
  downPayment: number,
  expectedTotal: number | null | undefined,
): InstallmentTiersSummary {
  const installmentsTotal = sumTierAmounts(tiers);
  const contractTotal = roundMoney((Number(downPayment) || 0) + installmentsTotal);
  const expected = Number(expectedTotal) || 0;
  return {
    installmentsCount: sumTierCounts(tiers),
    installmentsTotal,
    contractTotal,
    differenceFromExpected: expected > 0 ? roundMoney(contractTotal - expected) : null,
  };
}

// ───────────────────────── schedule ─────────────────────────

/**
 * Expands tiers into the per-installment schedule, in order. Due dates are
 * `firstInstallmentDate + (i − 1) × stepMonths`, clamped to the last day of
 * shorter months (Jan 31 → Feb 28), matching .NET's `DateTime.AddMonths`.
 *
 * @param firstInstallmentDate `yyyy-MM-dd` (a full ISO datetime is accepted too).
 */
export function expandTiersToSchedule(
  tiers: readonly InstallmentTierDraft[],
  firstInstallmentDate: string,
  stepMonths = 1,
): InstallmentPreviewRow[] {
  const rows: InstallmentPreviewRow[] = [];
  let sequence = 0;
  for (const tier of normalizeTiers(tiers)) {
    for (let i = 0; i < tier.count; i++) {
      rows.push({
        sequence: sequence + 1,
        dueDate: addMonthsIso(firstInstallmentDate, sequence * stepMonths),
        amount: tier.amount,
      });
      sequence++;
    }
  }
  return rows;
}

/**
 * Collapses a flat list of amounts into tiers by grouping **consecutive**
 * equal amounts. Order is preserved, so expanding the result reproduces
 * the input exactly:
 *
 *   [1000×5, 500×5]  → [{5,1000},{5,500}]
 *   [1000×9, 700]    → [{9,1000},{1,700}]   (legacy "adjusted last installment")
 *   [500, 800, 500]  → [{1,500},{1,800},{1,500}]
 */
export function groupConsecutiveAmounts(amounts: readonly number[]): InstallmentTier[] {
  const tiers: InstallmentTier[] = [];
  for (const raw of amounts) {
    const amount = roundMoney(Number(raw) || 0);
    const last = tiers[tiers.length - 1];
    if (last && moneyEquals(last.amount, amount)) last.count++;
    else tiers.push({ count: 1, amount });
  }
  return tiers;
}

/** Tiers from a server schedule — sorted by `sequence` first so input order never matters. */
export function tiersFromSchedule<T extends { sequence: number }>(
  installments: readonly T[] | null | undefined,
  amountOf: (row: T) => number,
): InstallmentTier[] {
  const sorted = [...(installments ?? [])].sort((a, b) => a.sequence - b.sequence);
  return groupConsecutiveAmounts(sorted.map(amountOf));
}

/** True when the plan has more than one distinct consecutive amount. */
export function isTieredPlan(tiers: readonly InstallmentTier[]): boolean {
  return tiers.length > 1;
}

/**
 * Whether a contract's installments are all equal, judged only from list
 * aggregates (no schedule needed): a uniform plan satisfies
 * `downPayment + count × amount === totalContractAmount`.
 *
 * Note `installmentAmount` on tiered contracts is the **first tier only**,
 * so this is the only safe way to tell from a list row.
 */
export function isUniformByTotals(row: {
  downPayment: number;
  installmentsCount: number;
  installmentAmount: number;
  totalContractAmount: number;
}): boolean {
  const expected = (Number(row.downPayment) || 0) + (Number(row.installmentsCount) || 0) * (Number(row.installmentAmount) || 0);
  // Allow up to 1 unit of drift — legacy even-division contracts round each
  // installment to 2 decimals, which can leave a few piastres of noise.
  return Math.abs(expected - (Number(row.totalContractAmount) || 0)) < 1;
}

// ───────────────────────── display ─────────────────────────

/** "شهر" / "شهور" agreement for a count, colloquial style used across the app. */
function monthsWord(count: number): string {
  return count >= 3 && count <= 10 ? 'شهور' : 'شهر';
}

/**
 * Human-readable plan, e.g. **"1,000 ج.م × 5 شهور، ثم 500 ج.م × 5 شهور"**.
 *
 * @param formatAmount money formatter — defaults to a plain grouped number
 *   so this util stays free of app/environment imports.
 */
export function formatTiersLabel(
  tiers: readonly InstallmentTier[],
  formatAmount: (amount: number) => string = (a) => a.toLocaleString('en-US', { maximumFractionDigits: 2 }),
): string {
  return tiers
    .map((t) => `${formatAmount(t.amount)} × ${t.count} ${monthsWord(t.count)}`)
    .join('، ثم ');
}

// ───────────────────────── dates ─────────────────────────

/**
 * Adds calendar months to a `yyyy-MM-dd` date using pure calendar math
 * (no timezone conversions), clamping the day to the target month's length.
 */
export function addMonthsIso(isoDate: string, months: number): string {
  const [datePart] = (isoDate ?? '').split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  if (!y || !m || !d) return datePart;

  const totalMonths = y * 12 + (m - 1) + months;
  const year = Math.floor(totalMonths / 12);
  const monthIndex = totalMonths - year * 12;
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const day = Math.min(d, daysInMonth);

  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
