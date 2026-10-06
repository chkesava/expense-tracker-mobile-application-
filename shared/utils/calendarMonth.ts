/**
 * Month-view model for the Financial Calendar (SPENDLY-179). Pure: the grid,
 * day indicators and screen-reader sentences, so meaning never depends on
 * colour alone. Tested in calendarMonth.test.ts.
 */

import type { CalendarEvent } from "../types/calendar";
import { orderedWeekdays, shiftDateKey, shiftMonthKey, type FirstDayOfWeek } from "./dates";
import { monthGridRange } from "./calendarQuery";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function monthTitle(month: string): string {
  return `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

export function longDateLabel(date: string): string {
  const d = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  return `${WEEKDAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

export const nextMonth = (month: string) => shiftMonthKey(month, 1);
export const previousMonth = (month: string) => shiftMonthKey(month, -1);

export interface CalendarDayCell {
  date: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  inCount: number;
  outCount: number;
  otherCount: number;
  overdue: boolean;
  total: number;
  accessibilityLabel: string;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function dayAccessibilityLabel(date: string, events: readonly CalendarEvent[], isToday: boolean, isSelected: boolean): string {
  const parts = [longDateLabel(date)];
  if (isToday) parts.push("today");
  if (isSelected) parts.push("selected");
  if (!events.length) parts.push("no financial events");
  else {
    const out = events.filter((e) => e.direction === "out").length;
    const inn = events.filter((e) => e.direction === "in").length;
    const other = events.length - out - inn;
    const bits = [out && plural(out, "payment"), inn && `${inn} money in`, other && plural(other, "other event")].filter(Boolean);
    parts.push(bits.join(", "));
    const overdue = events.filter((e) => e.state === "overdue").length;
    if (overdue) parts.push(`${overdue} overdue`);
  }
  return parts.join(", ");
}

/** Whole weeks covering the month, starting on the user's first day of week. */
export function buildMonthGrid(
  month: string,
  firstDay: FirstDayOfWeek,
  byDate: ReadonlyMap<string, readonly CalendarEvent[]>,
  today: string,
  selected: string
): { weekdays: string[]; weeks: CalendarDayCell[][] } {
  const { from, to } = monthGridRange(month, firstDay);
  const cells: CalendarDayCell[] = [];
  for (let date = from; date <= to; date = shiftDateKey(date, 1)) {
    const events = byDate.get(date) ?? [];
    const inCount = events.filter((e) => e.direction === "in").length;
    const outCount = events.filter((e) => e.direction === "out").length;
    const isToday = date === today;
    const isSelected = date === selected;
    cells.push({
      date,
      day: Number(date.slice(8, 10)),
      inMonth: date.slice(0, 7) === month,
      isToday,
      isSelected,
      inCount,
      outCount,
      otherCount: events.length - inCount - outCount,
      overdue: events.some((e) => e.state === "overdue"),
      total: events.length,
      accessibilityLabel: dayAccessibilityLabel(date, events, isToday, isSelected),
    });
  }
  const weeks: CalendarDayCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return { weekdays: orderedWeekdays(firstDay).map((w) => w.label), weeks };
}

/** Day totals for the selected-day header: money out, money in, overdue count. */
export function dayTotals(events: readonly CalendarEvent[]): { out: number; in: number; overdue: number } {
  let out = 0;
  let inn = 0;
  let overdue = 0;
  for (const e of events) {
    if (e.state === "cancelled") continue;
    if (e.state === "overdue") overdue++;
    if (e.amount === null) continue;
    if (e.direction === "out") out += e.amount;
    else if (e.direction === "in") inn += e.amount;
  }
  return { out: Math.round(out * 100) / 100, in: Math.round(inn * 100) / 100, overdue };
}

/** Short state words shown on every event row (never colour alone). */
export const CALENDAR_STATE_LABELS: Record<CalendarEvent["state"], string> = {
  actual: "Recorded",
  scheduled: "Scheduled",
  expected: "Expected",
  projected: "Projected",
  overdue: "Overdue",
  completed: "Done",
  cancelled: "Cancelled",
};

export const CALENDAR_SOURCE_LABELS: Record<CalendarEvent["source"], string> = {
  card_bill: "Card bill",
  subscription: "Subscription",
  emi: "EMI",
  borrowing: "Loan",
  receivable: "Owed to you",
  income: "Income",
  goal: "Goal",
  investment: "Investment",
  sip: "SIP",
  epf: "EPF",
  fee: "Fee",
  reminder: "Reminder",
};

export function eventAccessibilityLabel(e: CalendarEvent, format: (n: number) => string): string {
  const money = e.amount === null ? "" : `, ${e.direction === "in" ? "money in" : e.direction === "out" ? "money out" : "amount"} ${format(e.amount)}`;
  return `${e.title}, ${CALENDAR_SOURCE_LABELS[e.source]}, ${CALENDAR_STATE_LABELS[e.state]}${money}`;
}
