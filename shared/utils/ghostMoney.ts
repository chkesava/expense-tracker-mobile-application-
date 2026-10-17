import { formatAmount } from "./formatCurrency";

/** What `Amount` and `FinancialAmount` render in place of a hidden amount. */
export const GHOST_AMOUNT = "••••••";

/**
 * Formats `value` for plain-text slots (captions, sentences, accessibility
 * labels) the way `Amount ghostable` does. When `ghost` is on, the amount is
 * masked but a negative keeps its sign, so "money out" stays readable.
 */
export function ghostMoney(
  value: number,
  currency: string,
  ghost: boolean | undefined
): string {
  if (!ghost) return formatAmount(value, currency);
  return value < 0 ? `-${GHOST_AMOUNT}` : GHOST_AMOUNT;
}
