/**
 * Upcoming commitments and projected cash summary (SPENDLY-182).
 *
 * Adds up calendar events for a planning window — it is not a second runway
 * engine; the full projection lives in Financial Runway. Pure and traceable:
 * every figure keeps the events behind it.
 *
 *   projected remaining = counted money today (actual)
 *                       + expected money in
 *                       − upcoming commitments
 *                       − overdue items still open
 *
 * Eligibility:
 * - Money in: open `expected` inflows dated in the window (money owed to you
 *   with a due date, FD maturity). Recorded income is already in the counted
 *   balance, so it is never added again.
 * - Commitments: open `scheduled` outflows dated in the window (card bills,
 *   recurring items, EMIs, loan due dates, SIP runs).
 * - Overdue: open overdue outflows in the window or from earlier — still owed.
 * - Excluded: completed, cancelled, actual and neutral events (EPF credits,
 *   goal milestones), and events without an amount (counted separately).
 */

import type { CalendarEvent, CalendarRange } from "../types/calendar";
import { daysInMonth, shiftDateKey } from "./dates";
import { roundMoney } from "./money";

export type SummaryWindow = "next7" | "next30" | "restOfMonth";

export const SUMMARY_WINDOW_LABELS: Record<SummaryWindow, string> = {
  next7: "Next 7 days",
  next30: "Next 30 days",
  restOfMonth: "Rest of this month",
};

export function summaryRange(window: SummaryWindow, today: string): CalendarRange {
  if (window === "next7") return { from: today, to: shiftDateKey(today, 6) };
  if (window === "next30") return { from: today, to: shiftDateKey(today, 29) };
  const last = daysInMonth(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1);
  return { from: today, to: `${today.slice(0, 7)}-${String(last).padStart(2, "0")}` };
}

export interface SummaryBucket {
  total: number;
  events: CalendarEvent[];
}

export interface CalendarCashSummary {
  range: CalendarRange;
  /** Counted money today (Runway sources). Actual, not a forecast. */
  counted: number;
  expectedIn: SummaryBucket;
  commitments: SummaryBucket;
  overdue: SummaryBucket;
  /** Forecast only — never a confirmed balance. */
  projectedRemaining: number;
  /** Open events that have no amount and so can't be added up. */
  withoutAmount: CalendarEvent[];
}

const bucket = (events: CalendarEvent[]): SummaryBucket => ({
  total: roundMoney(events.reduce((t, e) => t + (e.amount ?? 0), 0)),
  events,
});

export function summarizeCalendarCash(input: {
  range: CalendarRange;
  counted: number;
  /** Calendar events for the range (178 output). */
  events: readonly CalendarEvent[];
  /** Open overdue events from before the range. */
  earlierOverdue: readonly CalendarEvent[];
  currency: string;
}): CalendarCashSummary {
  const sameCurrency = (e: CalendarEvent) => e.currency.toUpperCase() === input.currency.toUpperCase();
  const inWindow = input.events.filter((e) => e.date >= input.range.from && e.date <= input.range.to && sameCurrency(e));
  const seen = new Set<string>();
  const overdueAll = [...input.earlierOverdue.filter(sameCurrency), ...inWindow.filter((e) => e.state === "overdue")].filter(
    (e) => e.direction === "out" && !seen.has(e.id) && Boolean(seen.add(e.id))
  );

  const expectedIn = inWindow.filter((e) => e.direction === "in" && e.state === "expected");
  const commitments = inWindow.filter((e) => e.direction === "out" && e.state === "scheduled");
  const open = [...expectedIn, ...commitments, ...overdueAll];
  const withoutAmount = open.filter((e) => e.amount === null);
  const counted = (list: CalendarEvent[]) => bucket(list.filter((e) => e.amount !== null));

  const inB = counted(expectedIn);
  const outB = counted(commitments);
  const overdueB = counted(overdueAll);
  return {
    range: input.range,
    counted: roundMoney(input.counted),
    expectedIn: inB,
    commitments: outB,
    overdue: overdueB,
    projectedRemaining: roundMoney(input.counted + inB.total - outB.total - overdueB.total),
    withoutAmount,
  };
}
