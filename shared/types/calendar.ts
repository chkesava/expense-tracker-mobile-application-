/**
 * Financial Calendar event contract (SPENDLY-177, epic SPENDLY-176).
 *
 * A calendar event is a dated, read-only view of a canonical Spendly record —
 * never a second ledger. Every event keeps its source record id and a deep
 * link back to it. Documented in docs/SPENDLY-177-calendar-event-model.md.
 */

import type { BurnClass } from "./runway";

export const CALENDAR_SOURCES = [
  "card_bill",
  "subscription",
  "emi",
  "borrowing",
  "receivable",
  "income",
  "goal",
  "investment",
  "sip",
  "epf",
  "fee",
  "reminder",
] as const;
export type CalendarSource = (typeof CALENDAR_SOURCES)[number];

/**
 * - actual: already happened and recorded (income received, EPF credited).
 * - scheduled: a commitment with a known date (bill due, renewal, SIP run).
 * - expected: a date the user or source gave, but not certain (money owed to you, FD maturity, EPF window).
 * - projected: derived by Spendly (reserved for forecasts; not used by source adapters).
 * - overdue: a scheduled or expected item whose date has passed while still open.
 * - completed: settled or paid.
 * - cancelled: cancelled or skipped; hidden by default (178 rules).
 */
export const CALENDAR_STATES = ["actual", "scheduled", "expected", "projected", "overdue", "completed", "cancelled"] as const;
export type CalendarEventState = (typeof CALENDAR_STATES)[number];

export type CalendarDirection = "in" | "out" | "neutral";

/** 3 needs attention now, 2 soon, 1 normal, 0 informational. */
export type CalendarPriority = 0 | 1 | 2 | 3;

export interface CalendarEvent {
  /** Stable across refreshes: `${source}:${refId}:${date}`. */
  id: string;
  source: CalendarSource;
  /** The canonical record id (bill, subscription, borrowing, …). */
  refId: string;
  /** Local date key (YYYY-MM-DD) in the user's timezone. */
  date: string;
  /** Optional local time (HH:mm), e.g. for reminders. */
  time?: string;
  title: string;
  subtitle?: string;
  /** Null when the source has no reliable amount (e.g. a goal milestone). */
  amount: number | null;
  currency: string;
  direction: CalendarDirection;
  burnClass?: BurnClass;
  state: CalendarEventState;
  priority: CalendarPriority;
  /** Whether the user can act on it from the calendar (pay, record, open). */
  actionable: boolean;
  /** In-app route to the source record or its screen. */
  href: string;
  /** Shared by every occurrence of the same recurring item. */
  recurrenceId?: string;
}

export interface CalendarRange {
  /** Inclusive local date keys. */
  from: string;
  to: string;
}
