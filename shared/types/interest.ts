/**
 * Interest vocabulary shared by every instrument that accrues.
 *
 * These lived in `borrowing.ts` until SPENDLY-160 gave receivables interest
 * too. They are a persisted vocabulary — the strings are written to Firestore —
 * so two copies would let one collection end up with `ANNUAL` and another with
 * a later `YEARLY`, with the label maps drifting behind them and no test that
 * would catch it.
 */

/**
 * How often the configured rate applies.
 * `ONE_TIME` charges the rate once on the principal, no matter how long the
 * borrowing stays open. `NONE` means interest-free.
 */
export const INTEREST_FREQUENCIES = [
  "MONTHLY",
  "ANNUAL",
  "ONE_TIME",
  "NONE",
] as const;

export type InterestFrequency = (typeof INTEREST_FREQUENCIES)[number];

export const INTEREST_FREQUENCY_LABELS: Record<InterestFrequency, string> = {
  MONTHLY: "Monthly",
  ANNUAL: "Annual",
  ONE_TIME: "One-time",
  NONE: "No interest",
};

/** Simple interest is the only supported method today; stored so it can grow. */
export const INTEREST_TYPES = ["NONE", "SIMPLE"] as const;

export type InterestType = (typeof INTEREST_TYPES)[number];

/**
 * Whether each period charges interest on the amount originally borrowed or on
 * what is still owed. Stored explicitly so nothing about interest is assumed.
 */
export const INTEREST_BASES = [
  "ORIGINAL_PRINCIPAL",
  "OUTSTANDING_PRINCIPAL",
] as const;

export type InterestBasis = (typeof INTEREST_BASES)[number];

export const INTEREST_BASIS_LABELS: Record<InterestBasis, string> = {
  ORIGINAL_PRINCIPAL: "On original principal",
  OUTSTANDING_PRINCIPAL: "On outstanding principal",
};
