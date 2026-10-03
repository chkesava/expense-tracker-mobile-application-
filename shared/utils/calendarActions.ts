/**
 * Event detail actions for the Financial Calendar (SPENDLY-181). Every action
 * routes to the source feature, which stays the system of record — the
 * calendar never creates or edits a financial record itself.
 */

import type { CalendarEvent } from "../types/calendar";

export interface CalendarEventAction {
  label: string;
  href: string;
  primary: boolean;
}

/** Actions for an event. Cancelled or missing records get none. */
export function calendarEventActions(event: CalendarEvent | null | undefined): CalendarEventAction[] {
  if (!event || event.state === "cancelled") return [];
  const open = event.state === "scheduled" || event.state === "expected" || event.state === "overdue";
  const one = (label: string, href = event.href): CalendarEventAction[] => [{ label, href, primary: true }];
  switch (event.source) {
    case "card_bill":
      return one(open ? "View and pay bill" : "View bill");
    case "subscription":
    case "emi":
      return one(event.source === "emi" ? "View EMI" : "View recurring item");
    case "borrowing":
      return one(open ? "View loan and record repayment" : "View loan");
    case "receivable":
      return one(open ? "View and record collection" : "View receivable");
    case "income":
      return one("View transaction");
    case "investment":
      return one("View investment");
    case "sip":
      return one("View SIP plans");
    case "epf":
      return one("Open EPF");
    case "goal":
      return one("Open goals");
    case "reminder":
      // Edit/complete actions live in the reminder sheet (SPENDLY-183).
      return [];
  }
}

/** Plain-language explanation of what the event's state means. */
export function calendarStateExplanation(event: CalendarEvent): string {
  switch (event.state) {
    case "actual":
      return "Already recorded in Spendly.";
    case "scheduled":
      return "A commitment with a known date. Nothing has been paid or recorded yet.";
    case "expected":
      return "Expected on this date, but not certain until it happens.";
    case "projected":
      return "A Spendly estimate, not a confirmed amount.";
    case "overdue":
      return "The date has passed and this is still open.";
    case "completed":
      return "Settled or paid.";
    case "cancelled":
      return "Cancelled or skipped — nothing to do.";
  }
}
