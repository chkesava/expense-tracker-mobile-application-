/**
 * SPENDLY-794 (epic SPENDLY-793): low-balance alerts before auto-debits.
 *
 * The settings and per-item fields that decide when an alert window opens.
 * Firestore rules enforce the same range (`leadDaysWellFormed`). Pure.
 */

import type { Account, AutopayAmountMode } from "../types/expense";
import type { Subscription } from "../types/subscription";

export const LOW_BALANCE_LEAD_DAYS_MIN = 0;
export const LOW_BALANCE_LEAD_DAYS_MAX = 15;
export const DEFAULT_LOW_BALANCE_LEAD_DAYS = 3;
/** The choices the UI offers; any integer in range is valid in storage. */
export const LOW_BALANCE_LEAD_DAY_OPTIONS = [1, 3, 5, 7] as const;

export function isValidLeadDays(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= LOW_BALANCE_LEAD_DAYS_MIN &&
    value <= LOW_BALANCE_LEAD_DAYS_MAX
  );
}

/** The item's override when valid, else the user's default, else 3. */
export function resolveLeadDays(override: unknown, defaultLeadDays: unknown): number {
  if (isValidLeadDays(override)) return override;
  if (isValidLeadDays(defaultLeadDays)) return defaultLeadDays;
  return DEFAULT_LOW_BALANCE_LEAD_DAYS;
}

export function subscriptionLeadDays(
  sub: Pick<Subscription, "lowBalanceLeadDays">,
  defaultLeadDays: number
): number {
  return resolveLeadDays(sub.lowBalanceLeadDays, defaultLeadDays);
}

export function isAutopayAmountMode(value: unknown): value is AutopayAmountMode {
  return value === "total" || value === "minimum";
}

export type CardAutopay = {
  fromAccountId: string;
  amountMode: AutopayAmountMode;
  leadDays: number;
};

/**
 * The card's autopay link, or null when none is set or it points at the card
 * itself. A missing mode means "total": the safer figure to warn on.
 */
export function cardAutopay(
  card: Pick<Account, "id" | "autopayFromAccountId" | "autopayAmountMode" | "autopayLeadDays">,
  defaultLeadDays: number
): CardAutopay | null {
  const from = card.autopayFromAccountId;
  if (typeof from !== "string" || from === "" || from === card.id) return null;
  return {
    fromAccountId: from,
    amountMode: isAutopayAmountMode(card.autopayAmountMode) ? card.autopayAmountMode : "total",
    leadDays: resolveLeadDays(card.autopayLeadDays, defaultLeadDays),
  };
}
