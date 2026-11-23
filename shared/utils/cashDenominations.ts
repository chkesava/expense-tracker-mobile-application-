import type { Account } from "../types/expense";

export const CASH_DENOMINATIONS = [500, 200, 100, 50, 20, 10] as const;
export type CashDenomination = (typeof CASH_DENOMINATIONS)[number];

/**
 * Sum of note count * denomination. Informational only — never feeds
 * balance math. Invalid/negative/non-finite counts are treated as 0 since
 * this is user-typed input, not a computed figure.
 */
export function cashDenominationTotal(
  counts: Account["cashDenominations"] | undefined
): number {
  if (!counts) return 0;
  return CASH_DENOMINATIONS.reduce((total, denomination) => {
    const count = counts[String(denomination) as `${CashDenomination}`];
    if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) {
      return total;
    }
    return total + Math.floor(count) * denomination;
  }, 0);
}
