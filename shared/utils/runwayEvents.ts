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

import type { CalendarEvent } from "../types/calendar";
import type { RunwayCertainty } from "../types/runway";
import type { RunwayEvent } from "./runwayEngine";

export function calendarToRunwayEvents(events: readonly CalendarEvent[], today: string, displayCurrency: string): RunwayEvent[] {
  const out: RunwayEvent[] = [];
  for (const ce of events) {
    if (ce.direction === "neutral") continue;
    if (ce.state === "completed" || ce.state === "cancelled") continue;
    // Missing/unknown amounts are skipped for math but flagged later.
    if (ce.amount === null || ce.amount <= 0) continue;
    // Ignore events in un-convertible currencies for runway projection.
    if (ce.currency.toUpperCase() !== displayCurrency.toUpperCase()) continue;

    let certainty: RunwayCertainty = "expected";
    if (ce.state === "actual") certainty = "actual";
    // For bills that have been generated but not paid, certainty can be 'actual'.
    if (ce.source === "card_bill") certainty = "actual";

    // Overdue items that are before today hit the runway today, because they are unpaid cash obligations.
    const date = ce.date < today ? today : ce.date;

    out.push({
      id: ce.recurrenceId ?? ce.id,
      label: ce.title,
      source: ce.source,
      direction: ce.direction,
      amount: ce.amount,
      burnClass: ce.burnClass,
      certainty,
      schedule: { kind: "once", date },
    });
  }
  return out;
}
