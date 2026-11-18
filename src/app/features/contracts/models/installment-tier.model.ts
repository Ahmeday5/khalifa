// ─────────────────────────────────────────────────────────────────
//  Tiered installments ("تقسيط على أكثر من مبلغ")
// ─────────────────────────────────────────────────────────────────

/**
 * One tier of a tiered installment plan — `count` consecutive installments
 * of `amount` each. Tiers are applied **in order**: the first tier covers the
 * first installments, the second tier the ones after it, and so on.
 *
 * Wire shape of each entry in `installmentTiers` on the contract
 * create/update endpoints (stored + direct).
 *
 * Example — 7,500 over 10 months, front-loaded:
 *   `[{ count: 5, amount: 1000 }, { count: 5, amount: 500 }]`
 */
export interface InstallmentTier {
  /** Number of installments in this tier — integer > 0. */
  count: number;
  /** Amount of each installment in this tier — > 0, at most 2 decimals. */
  amount: number;
}

/**
 * A tier as it comes out of a form — fields may still be blank (`null`)
 * or missing while the operator is typing. Normalize before sending.
 */
export interface InstallmentTierDraft {
  count?: number | null;
  amount?: number | null;
}

/** One row of the client-side installment schedule preview. */
export interface InstallmentPreviewRow {
  /** 1-based installment number. */
  sequence: number;
  /** `yyyy-MM-dd`. */
  dueDate: string;
  amount: number;
}

/** Live totals for a tiered plan, shown under the tiers editor. */
export interface InstallmentTiersSummary {
  /** Σ count — becomes `installmentsCount`. */
  installmentsCount: number;
  /** Σ (count × amount). */
  installmentsTotal: number;
  /** downPayment + installmentsTotal — mirrors the server's formula. */
  contractTotal: number;
  /**
   * `contractTotal − expectedTotal` when the operator entered an expected
   * total to reconcile against; `null` when there's nothing to compare.
   * A non-zero value is a warning only — it never blocks saving.
   */
  differenceFromExpected: number | null;
}
