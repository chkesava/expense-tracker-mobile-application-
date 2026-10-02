/**
 * Financial Calendar aggregation and query layer (SPENDLY-178).
 *
 * Runs every source adapter (177) for a date range, removes duplicates by the
 * stable event id, applies the visibility rules and sorts deterministically.
 * Pure: the data comes from records already loaded by the app's providers,
 * so querying a month never reads the whole financial history again.
 *
 * Visibility rules:
 * - Cancelled events are hidden unless `includeCancelled`.
 * - Completed events stay visible on their date (history stays understandable).
 * - Overdue events stay discoverable: open overdue items from the 12 months
 *   before the range are returned separately in `earlierOverdue`.
 */

import type { Borrowing } from "../types/borrowing";
import type { CalendarEvent, CalendarRange, CalendarSource } from "../types/calendar";
import type { CreditCardBill } from "../types/creditCardBill";
import type { FinancialGoal, Income } from "../types/expense";
import type { Investment } from "../types/investment";
import type { Receivable } from "../types/receivable";
import type { Subscription } from "../types/subscription";
import type { EpfContribution } from "../features/epf/types";
import type { SipPlan } from "../features/sip/types";
import {
  borrowingEvents,
  cardBillEvents,
  epfEvents,
  goalEvents,
  incomeEvents,
  investmentEvents,
  receivableEvents,
  sipEvents,
  subscriptionEvents,
  type CalendarContext,
} from "./calendarSources";
import { daysBetweenDateKeys, daysInMonth, endOfWeekDateKey, isValidDateKey, shiftDateKey, startOfWeekDateKey, type FirstDayOfWeek } from "./dates";

/** Longest range one query may cover; longer requests are cut to this. */
export const CALENDAR_MAX_RANGE_DAYS = 400;
/** How far back open overdue items are surfaced. */
export const CALENDAR_OVERDUE_LOOKBACK_DAYS = 365;

export type CalendarSourceStatus = "ready" | "loading" | "error";
export type CalendarLoadState = "loading" | "ready" | "partial" | "error";

export interface CalendarData {
  bills: readonly CreditCardBill[];
  cardNames: ReadonlyMap<string, string>;
  subscriptions: readonly Subscription[];
  borrowings: readonly Borrowing[];
  receivables: readonly Receivable[];
  incomes: readonly Income[];
  goals: readonly FinancialGoal[];
  investments: readonly Investment[];
  sipPlans: readonly SipPlan[];
  epfContributions: readonly EpfContribution[];
  epfEmployerNames: ReadonlyMap<string, string>;
  /** Events from other features (user reminders in 183, later fee/decision/runway sources). */
  extraEvents?: readonly CalendarEvent[];
}

export interface CalendarQueryInput {
  range: CalendarRange;
  today: string;
  currency: string;
  data: CalendarData;
  /** Load state per source; anything missing counts as ready. */
  status?: Partial<Record<CalendarSource, CalendarSourceStatus>>;
  includeCancelled?: boolean;
}

export interface CalendarQueryResult {
  range: CalendarRange;
  events: CalendarEvent[];
  /** Events grouped by date, each group in display order. */
  byDate: Map<string, CalendarEvent[]>;
  /** Open overdue events dated before the range. */
  earlierOverdue: CalendarEvent[];
  loadState: CalendarLoadState;
  failedSources: CalendarSource[];
  loadingSources: CalendarSource[];
  /** Duplicate ids dropped — should be 0; reported for QA. */
  duplicatesDropped: number;
}

const SOURCE_ORDER: Record<CalendarSource, number> = {
  card_bill: 0,
  emi: 1,
  borrowing: 2,
  subscription: 3,
  sip: 4,
  receivable: 5,
  income: 6,
  investment: 7,
  epf: 8,
  goal: 9,
  reminder: 10,
};
const DIRECTION_ORDER = { out: 0, in: 1, neutral: 2 } as const;

/** Date, then time (untimed first), then priority, direction, source, title and id. */
export function compareCalendarEvents(a: CalendarEvent, b: CalendarEvent): number {
  return (
    a.date.localeCompare(b.date) ||
    (a.time ?? "").localeCompare(b.time ?? "") ||
    b.priority - a.priority ||
    DIRECTION_ORDER[a.direction] - DIRECTION_ORDER[b.direction] ||
    SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source] ||
    a.title.localeCompare(b.title) ||
    a.id.localeCompare(b.id)
  );
}

/** A valid, ordered range of at most CALENDAR_MAX_RANGE_DAYS. */
export function normalizeCalendarRange(range: CalendarRange, today: string): CalendarRange {
  let from = isValidDateKey(range.from) ? range.from : today;
  let to = isValidDateKey(range.to) ? range.to : from;
  if (to < from) [from, to] = [to, from];
  if (daysBetweenDateKeys(from, to) >= CALENDAR_MAX_RANGE_DAYS) to = shiftDateKey(from, CALENDAR_MAX_RANGE_DAYS - 1);
  return { from, to };
}

function collect(ctx: CalendarContext, data: CalendarData): CalendarEvent[] {
  return [
    ...cardBillEvents(data.bills, data.cardNames, ctx),
    ...subscriptionEvents(data.subscriptions, ctx),
    ...borrowingEvents(data.borrowings, ctx),
    ...receivableEvents(data.receivables, ctx),
    ...incomeEvents(data.incomes, ctx),
    ...goalEvents(data.goals, ctx),
    ...investmentEvents(data.investments, ctx),
    ...sipEvents(data.sipPlans, ctx),
    ...epfEvents(data.epfContributions, data.epfEmployerNames, ctx),
    ...(data.extraEvents ?? []).filter((e) => e.date >= ctx.range.from && e.date <= ctx.range.to),
  ];
}

export function queryCalendar(input: CalendarQueryInput): CalendarQueryResult {
  const range = normalizeCalendarRange(input.range, input.today);
  const ctx: CalendarContext = { range, today: input.today, currency: input.currency };

  const seen = new Set<string>();
  let duplicatesDropped = 0;
  const events: CalendarEvent[] = [];
  for (const e of collect(ctx, input.data)) {
    if (seen.has(e.id)) {
      duplicatesDropped++;
      continue;
    }
    seen.add(e.id);
    if (e.state === "cancelled" && !input.includeCancelled) continue;
    events.push(e);
  }
  events.sort(compareCalendarEvents);

  const byDate = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const list = byDate.get(e.date);
    if (list) list.push(e);
    else byDate.set(e.date, [e]);
  }

  // Overdue items before the range, so a past unpaid bill is never lost.
  let earlierOverdue: CalendarEvent[] = [];
  const lookFrom = shiftDateKey(input.today, -CALENDAR_OVERDUE_LOOKBACK_DAYS);
  const lookTo = shiftDateKey(range.from, -1);
  if (lookTo >= lookFrom) {
    const earlierIds = new Set<string>();
    earlierOverdue = collect({ ...ctx, range: { from: lookFrom, to: lookTo } }, input.data)
      .filter((e) => e.state === "overdue" && !earlierIds.has(e.id) && earlierIds.add(e.id))
      .sort(compareCalendarEvents);
  }

  const statuses = Object.entries(input.status ?? {}) as Array<[CalendarSource, CalendarSourceStatus]>;
  const failedSources = statuses.filter(([, s]) => s === "error").map(([k]) => k);
  const loadingSources = statuses.filter(([, s]) => s === "loading").map(([k]) => k);
  const total = statuses.length;
  let loadState: CalendarLoadState = "ready";
  if (failedSources.length && failedSources.length === total) loadState = "error";
  else if (failedSources.length) loadState = "partial";
  else if (loadingSources.length) loadState = loadingSources.length === total || events.length === 0 ? "loading" : "partial";

  return { range, events, byDate, earlierOverdue, loadState, failedSources, loadingSources, duplicatesDropped };
}

/** The range a month grid shows: whole weeks covering the month (reuses the app's week helpers). */
export function monthGridRange(month: string, firstDay: FirstDayOfWeek): CalendarRange {
  const first = `${month}-01`;
  const last = `${month}-${String(daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1)).padStart(2, "0")}`;
  return { from: startOfWeekDateKey(first, firstDay), to: endOfWeekDateKey(last, firstDay) };
}
