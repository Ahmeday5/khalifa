import {
  addMonthsIso,
  expandTiersToSchedule,
  formatTiersLabel,
  groupConsecutiveAmounts,
  hasAtMostTwoDecimals,
  isUniformByTotals,
  isValidTier,
  normalizeTiers,
  summarizeTiers,
  tiersFromSchedule,
} from './installment-tiers.util';
import { applyInstallmentTiers } from '../models/contract.model';

describe('installment-tiers.util', () => {
  const plan = [
    { count: 5, amount: 1000 },
    { count: 5, amount: 500 },
  ];

  describe('validation', () => {
    it('accepts integer counts > 0 and amounts > 0 with ≤ 2 decimals', () => {
      expect(isValidTier({ count: 5, amount: 1000 })).toBeTrue();
      expect(isValidTier({ count: 1, amount: 333.33 })).toBeTrue();
    });

    it('rejects zero/negative/fractional counts and invalid amounts', () => {
      expect(isValidTier({ count: 0, amount: 100 })).toBeFalse();
      expect(isValidTier({ count: 2.5, amount: 100 })).toBeFalse();
      expect(isValidTier({ count: 2, amount: 0 })).toBeFalse();
      expect(isValidTier({ count: 2, amount: 10.555 })).toBeFalse();
      expect(isValidTier({ count: null, amount: 100 })).toBeFalse();
    });

    it('detects more than two decimals without float noise', () => {
      expect(hasAtMostTwoDecimals(0.1 + 0.2)).toBeTrue(); // 0.30000000000000004 is 0.30
      expect(hasAtMostTwoDecimals(10.555)).toBeFalse();
      expect(hasAtMostTwoDecimals(1.1)).toBeTrue();
      expect(hasAtMostTwoDecimals(19.99)).toBeTrue();
    });

    it('normalizeTiers drops blank rows', () => {
      expect(normalizeTiers([{ count: 5, amount: 1000 }, { count: null, amount: null }])).toEqual([
        { count: 5, amount: 1000 },
      ]);
    });
  });

  describe('summarizeTiers', () => {
    it('computes count, installments total and contract total (spec example: 7,500)', () => {
      const s = summarizeTiers(plan, 0, 7500);
      expect(s.installmentsCount).toBe(10);
      expect(s.installmentsTotal).toBe(7500);
      expect(s.contractTotal).toBe(7500);
      expect(s.differenceFromExpected).toBe(0);
    });

    it('adds the down payment and reports the difference vs. expected', () => {
      const s = summarizeTiers(plan, 1000, 8000);
      expect(s.contractTotal).toBe(8500);
      expect(s.differenceFromExpected).toBe(500);
    });

    it('has no difference when no expected total was entered', () => {
      expect(summarizeTiers(plan, 0, 0).differenceFromExpected).toBeNull();
    });
  });

  describe('schedule', () => {
    it('expands tiers in order with monthly due dates', () => {
      const rows = expandTiersToSchedule(plan, '2026-01-15');
      expect(rows.length).toBe(10);
      expect(rows[0]).toEqual({ sequence: 1, dueDate: '2026-01-15', amount: 1000 });
      expect(rows[4].amount).toBe(1000);
      expect(rows[5]).toEqual({ sequence: 6, dueDate: '2026-06-15', amount: 500 });
      expect(rows[9].dueDate).toBe('2026-10-15');
    });

    it('clamps month-end dates like .NET AddMonths', () => {
      expect(addMonthsIso('2026-01-31', 1)).toBe('2026-02-28');
      expect(addMonthsIso('2028-01-31', 1)).toBe('2028-02-29');
      expect(addMonthsIso('2026-11-30', 3)).toBe('2027-02-28');
      expect(addMonthsIso('2026-03-10T00:00:00Z', 12)).toBe('2027-03-10');
    });
  });

  describe('grouping (edit prefill)', () => {
    it('groups consecutive equal amounts', () => {
      expect(groupConsecutiveAmounts([1000, 1000, 1000, 1000, 1000, 500, 500, 500, 500, 500])).toEqual(plan);
    });

    it('keeps a legacy adjusted last installment as its own tier', () => {
      expect(groupConsecutiveAmounts([...Array(9).fill(1000), 700])).toEqual([
        { count: 9, amount: 1000 },
        { count: 1, amount: 700 },
      ]);
    });

    it('does not merge non-consecutive equal amounts', () => {
      expect(groupConsecutiveAmounts([500, 800, 500]).length).toBe(3);
    });

    it('sorts by sequence before grouping', () => {
      const rows = [
        { sequence: 3, dueAmount: 500 },
        { sequence: 1, dueAmount: 1000 },
        { sequence: 2, dueAmount: 1000 },
      ];
      expect(tiersFromSchedule(rows, (r) => r.dueAmount)).toEqual([
        { count: 2, amount: 1000 },
        { count: 1, amount: 500 },
      ]);
    });

    it('round-trips: expand(group(x)) reproduces x', () => {
      const amounts = [1200, 1200, 800, 800, 800, 650.5];
      const expanded = expandTiersToSchedule(groupConsecutiveAmounts(amounts), '2026-01-01').map((r) => r.amount);
      expect(expanded).toEqual(amounts);
    });
  });

  describe('display', () => {
    it('formats the plan label', () => {
      expect(formatTiersLabel(plan, (a) => `${a} ج`)).toBe('1000 ج × 5 شهور، ثم 500 ج × 5 شهور');
    });

    it('detects non-uniform contracts from list totals', () => {
      expect(isUniformByTotals({ downPayment: 0, installmentsCount: 10, installmentAmount: 750, totalContractAmount: 7500 })).toBeTrue();
      // Tiered: installmentAmount is the first tier only.
      expect(isUniformByTotals({ downPayment: 0, installmentsCount: 10, installmentAmount: 1000, totalContractAmount: 7500 })).toBeFalse();
    });
  });

  describe('applyInstallmentTiers (payload)', () => {
    const base = {
      installmentsCount: 12,
      installmentAmount: 625,
      adjustLastInstallmentForRemainder: true,
      totalContractAmount: 9999,
    };

    it('enforces the backend rules when tiers are sent', () => {
      const payload = applyInstallmentTiers(base, plan);
      expect(payload.installmentTiers).toEqual(plan);
      expect(payload.installmentsCount).toBe(10);
      expect(payload.installmentAmount).toBe(1000);
      expect(payload.adjustLastInstallmentForRemainder).toBeFalse();
      expect('totalContractAmount' in payload).toBeFalse();
    });

    it('leaves the payload untouched (no installmentTiers key) when there are no tiers', () => {
      for (const tiers of [null, undefined, []]) {
        const payload = applyInstallmentTiers(base, tiers);
        expect('installmentTiers' in payload).toBeFalse();
        expect(payload.installmentsCount).toBe(12);
        expect(payload.adjustLastInstallmentForRemainder).toBeTrue();
        expect(payload.totalContractAmount).toBe(9999);
      }
    });
  });
});
