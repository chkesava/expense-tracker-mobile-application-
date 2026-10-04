/**
 * Turns existing Spendly commitments into runway events (SPENDLY-206).
 *
 * Reuses the recurring-item schedule (`getNextRenewalDate`) and the open card
 * bills; it does not build a calendar. Financial Calendar events join through
 * SPENDLY-209 once SPENDLY-176 exists. Pure: nothing is written.
 *
 * Not included, on purpose:
 * - Recurring internal transfers: money moves between the user's own accounts.
 * - Loans without an instalment schedule: a borrowing only has one optional due
 *   date, and its EMIs are usually already a recurring item, so adding the due
 *   date too would count the same money twice.
 * - Money owed to the user: not cash until it's received (205 rule).
 */

import type { CreditCardBill } from "../types/creditCardBill";
import { OPEN_BILL_STATUSES } from "../types/creditCardBill";
import { subscriptionFrequency, type Subscription } from "../types/subscription";
import { parseLocalDate } from "./dates";
import { burnClassForExpense } from "./runwayContract";
import type { RunwayEvent } from "./runwayEngine";
import { getNextRenewalDate, isEmiTermCompleted } from "./subscriptionProcessor";

function endMonthKey(sub: Subscription): string | undefined {
  if (!sub.endYear || !sub.endMonth) return undefined;
  return `${sub.endYear}-${String(sub.endMonth).padStart(2, "0")}`;
}

/** Active recurring items (subscriptions, EMIs) as recurring outflow events. */
export function subscriptionsToRunwayEvents(subscriptions: readonly Subscription[], today: string): RunwayEvent[] {
  const events: RunwayEvent[] = [];
  const [y, m] = today.split("-").map(Number);
  for (const sub of subscriptions) {
    if (!sub.id || !sub.isActive || sub.isCompleted || sub.type === "transfer") continue;
    if (!(sub.amount > 0)) continue;
    if (sub.type === "emi" && isEmiTermCompleted(sub, y, m)) continue;
    const first = getNextRenewalDate(sub, parseLocalDate(today)).dateStr;
    const burnClass = sub.type === "emi" ? "debt_service" : burnClassForExpense({ category: sub.category }).burnClass;
    events.push({
      id: `subscription:${sub.id}`,
      label: sub.name,
      source: "subscriptions",
      direction: "out",
      amount: sub.amount,
      burnClass,
      certainty: "expected",
      schedule:
        subscriptionFrequency(sub) === "every_n_days"
          ? { kind: "every_n_days", firstDate: first, intervalDays: Math.max(1, Math.round(sub.intervalDays || 1)) }
          : { kind: "monthly", firstDate: first, dayOfMonth: sub.dayOfMonth || 1, untilMonth: endMonthKey(sub) },
    });
  }
  return events;
}

/**
 * Unpaid card bills as one-time outflows on their due date (overdue bills land
 * on today). Paying a card bill moves cash out of a liquid account, so it is a
 * real outflow even though the card spending itself was recorded earlier.
 */
export function creditCardBillsToRunwayEvents(bills: readonly CreditCardBill[], displayCurrency: string): RunwayEvent[] {
  return bills
    .filter(
      (b) =>
        OPEN_BILL_STATUSES.includes(b.status) &&
        b.remainingAmount > 0 &&
        (!b.currency || b.currency.toUpperCase() === displayCurrency.toUpperCase())
    )
    .map((b) => ({
      id: `creditCardBill:${b.id}`,
      label: "Credit card bill",
      source: "creditCardBills",
      direction: "out" as const,
      amount: b.remainingAmount,
      burnClass: "debt_service" as const,
      certainty: "actual" as const,
      schedule: { kind: "once" as const, date: b.dueDate },
    }));
}
