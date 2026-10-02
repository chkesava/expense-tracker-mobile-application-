/**
 * Day/week agenda model for the Financial Calendar (SPENDLY-180). Pure:
 * turns query results into flat list rows (for FlashList) — an overdue
 * section first, then date groups in chronological order, with the next
 * upcoming financial event marked. Tested in calendarAgenda.test.ts.
 */

import type { CalendarEvent, CalendarRange } from "../types/calendar";
import { compareCalendarEvents } from "./calendarQuery";
import { longDateLabel } from "./calendarMonth";
import { endOfWeekDateKey, shiftDateKey, startOfWeekDateKey, type FirstDayOfWeek } from "./dates";

export type AgendaSpan = "week" | "next30";

/** The range an agenda shows. `anchor` is any date inside the wanted week/period. */
export function agendaRange(span: AgendaSpan, anchor: string, firstDay: FirstDayOfWeek): CalendarRange {
  if (span === "week") return { from: startOfWeekDateKey(anchor, firstDay), to: endOfWeekDateKey(anchor, firstDay) };
  return { from: anchor, to: shiftDateKey(anchor, 29) };
}

/** Move the agenda one period back or forward. */
export function shiftAgenda(span: AgendaSpan, anchor: string, step: 1 | -1): string {
  return shiftDateKey(anchor, step * (span === "week" ? 7 : 30));
}

export function agendaTitle(range: CalendarRange): string {
  const short = (d: string) => longDateLabel(d).split(", ")[1]; // "18 October 2026"
  const [fromDay, fromMonth, fromYear] = short(range.from).split(" ");
  const [toDay, toMonth, toYear] = short(range.to).split(" ");
  if (fromYear !== toYear) return `${fromDay} ${fromMonth} ${fromYear} – ${toDay} ${toMonth} ${toYear}`;
  if (fromMonth !== toMonth) return `${fromDay} ${fromMonth} – ${toDay} ${toMonth} ${toYear}`;
  return `${fromDay}–${toDay} ${toMonth} ${toYear}`;
}

export type AgendaRow =
  | { type: "section"; key: string; title: string; overdue: boolean }
  | { type: "event"; key: string; event: CalendarEvent; isNext: boolean }
  | { type: "empty"; key: string; text: string };

const OPEN = new Set<CalendarEvent["state"]>(["scheduled", "expected"]);

/** The next open event dated today or later. */
export function nextFinancialEvent(events: readonly CalendarEvent[], today: string): CalendarEvent | null {
  return [...events].filter((e) => e.date >= today && OPEN.has(e.state)).sort(compareCalendarEvents)[0] ?? null;
}

export function buildAgendaRows(input: {
  events: readonly CalendarEvent[];
  earlierOverdue: readonly CalendarEvent[];
  today: string;
  /** All upcoming events, so "next" can be found beyond this range too. */
  nextCandidates?: readonly CalendarEvent[];
}): { rows: AgendaRow[]; next: CalendarEvent | null } {
  const rows: AgendaRow[] = [];
  const overdue = [...input.earlierOverdue, ...input.events.filter((e) => e.state === "overdue")].sort(compareCalendarEvents);
  const rest = input.events.filter((e) => e.state !== "overdue");
  const next = nextFinancialEvent(input.nextCandidates ?? input.events, input.today);

  if (overdue.length) {
    rows.push({ type: "section", key: "s:overdue", title: `Overdue (${overdue.length})`, overdue: true });
    for (const e of overdue) rows.push({ type: "event", key: `o:${e.id}`, event: e, isNext: false });
  }

  let current = "";
  for (const e of rest) {
    if (e.date !== current) {
      current = e.date;
      rows.push({ type: "section", key: `s:${e.date}`, title: `${longDateLabel(e.date)}${e.date === input.today ? " · Today" : ""}`, overdue: false });
    }
    rows.push({ type: "event", key: e.id, event: e, isNext: next?.id === e.id });
  }

  if (!rest.length) {
    rows.push({ type: "empty", key: "empty", text: overdue.length ? "Nothing else scheduled in this period." : "No financial events in this period." });
  }
  return { rows, next };
}
