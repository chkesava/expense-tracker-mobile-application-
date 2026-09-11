/**
 * Expected credit window for an EPF contribution — KAN-67.
 *
 * A contribution month and its credit date are different things: August wages
 * are remitted during September. The ticket forbids hard-coding a single date,
 * so this is an effective-dated window in the *following* month, resolved the
 * same way as the contribution rate table in `epfRules.ts`.
 *
 * Real remittance timing varies by employer; the statutory deadline is the 15th
 * of the following month, and most employers land shortly after. The default
 * window spans that.
 */

export interface EpfCreditWindowRule {
  /** Stable id, for auditability alongside `rulesVersion`. */
  id: string;
  /** YYYY-MM-DD, inclusive. */
  effectiveFrom: string;
  /** YYYY-MM-DD, exclusive. Absent means still in force. */
  effectiveTo?: string;
  /** Day of the following month the credit is expected from. */
  dayFrom: number;
  /** Day of the following month the credit is expected by. */
  dayTo: number;
}

/** Newest first. */
export const EPF_CREDIT_WINDOW_RULES: readonly EpfCreditWindowRule[] = [
  {
    id: "default",
    effectiveFrom: "1997-06-01",
    dayFrom: 15,
    dayTo: 25,
  },
] as const;

const OLDEST_RULE = EPF_CREDIT_WINDOW_RULES[EPF_CREDIT_WINDOW_RULES.length - 1];

/** The window rule in force for a contribution month. Never throws. */
export function findEpfCreditWindowRule(monthKey: string): EpfCreditWindowRule {
  const firstDay = `${monthKey}-01`;
  const match = EPF_CREDIT_WINDOW_RULES.find(
    (rule) =>
      firstDay >= rule.effectiveFrom && (!rule.effectiveTo || firstDay < rule.effectiveTo)
  );
  return match ?? OLDEST_RULE;
}
