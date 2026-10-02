import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "../types/calendar";
import { agendaRange, agendaTitle, buildAgendaRows, nextFinancialEvent, shiftAgenda } from "./calendarAgenda";
import { compareCalendarEvents } from "./calendarQuery";

const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: over.id ?? `${over.source ?? "card_bill"}:${over.refId ?? "r"}:${over.date ?? "2026-10-18"}`,
  source: "card_bill",
  refId: "r",
  date: "2026-10-18",
  title: "Bill",
  amount: 100,
  currency: "INR",
  direction: "out",
  state: "scheduled",
  priority: 1,
  actionable: true,
  href: "/x",
  ...over,
});

describe("ranges", () => {
  it("covers the locale week or the next 30 days", () => {
    expect(agendaRange("week", "2026-10-15", "monday")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(agendaRange("week", "2026-10-15", "sunday")).toEqual({ from: "2026-10-11", to: "2026-10-17" });
    expect(agendaRange("next30", "2026-10-15", "monday")).toEqual({ from: "2026-10-15", to: "2026-11-13" });
  });

  it("steps by a week or 30 days, across year ends", () => {
    expect(shiftAgenda("week", "2026-12-28", 1)).toBe("2027-01-04");
    expect(shiftAgenda("next30", "2026-10-15", -1)).toBe("2026-09-15");
  });

  it("titles the period", () => {
    expect(agendaTitle({ from: "2026-10-12", to: "2026-10-18" })).toBe("12–18 October 2026");
    expect(agendaTitle({ from: "2026-10-26", to: "2026-11-01" })).toBe("26 October – 1 November 2026");
    expect(agendaTitle({ from: "2026-12-28", to: "2027-01-03" })).toBe("28 December 2026 – 3 January 2027");
  });
});

describe("rows", () => {
  const today = "2026-10-15";
  const events = [
    ev({ refId: "a", date: "2026-10-12", state: "overdue", priority: 3 }),
    ev({ refId: "b", date: "2026-10-14", state: "completed", priority: 0 }),
    ev({ refId: "c", date: "2026-10-16" }),
    ev({ refId: "d", date: "2026-10-16", direction: "in", source: "income", state: "actual", priority: 0 }),
    ev({ refId: "e", date: "2026-10-18" }),
  ].sort(compareCalendarEvents);

  it("puts overdue first, then dates in order, and marks the next event", () => {
    const { rows, next } = buildAgendaRows({ events, earlierOverdue: [ev({ refId: "old", date: "2026-09-01", state: "overdue", priority: 3 })], today });
    expect(rows.map((r) => (r.type === "section" ? `#${r.title}` : r.type === "event" ? r.event.refId + (r.isNext ? "*" : "") : r.type))).toEqual([
      "#Overdue (2)",
      "old",
      "a",
      "#Wednesday, 14 October 2026",
      "b",
      "#Friday, 16 October 2026",
      "c*",
      "d",
      "#Sunday, 18 October 2026",
      "e",
    ]);
    expect(next?.refId).toBe("c");
  });

  it("labels today and shows a useful empty state", () => {
    const withToday = buildAgendaRows({ events: [ev({ date: today })], earlierOverdue: [], today });
    expect(withToday.rows[0]).toMatchObject({ type: "section", title: "Thursday, 15 October 2026 · Today" });
    expect(buildAgendaRows({ events: [], earlierOverdue: [], today }).rows).toEqual([{ type: "empty", key: "empty", text: "No financial events in this period." }]);
  });

  it("keeps same-day order stable", () => {
    const a = buildAgendaRows({ events, earlierOverdue: [], today }).rows;
    const b = buildAgendaRows({ events: [...events].reverse().sort(compareCalendarEvents), earlierOverdue: [], today }).rows;
    expect(a).toEqual(b);
  });

  it("finds the next event beyond the visible range when given candidates", () => {
    expect(nextFinancialEvent([ev({ date: "2026-10-01" }), ev({ refId: "f", date: "2026-11-20" })], today)?.refId).toBe("f");
    expect(nextFinancialEvent([ev({ state: "completed", date: "2026-10-20" })], today)).toBeNull();
  });

  it("stays fast for long lists", () => {
    const many = Array.from({ length: 5000 }, (_, i) => ev({ refId: `x${i}`, date: `2026-10-${String((i % 28) + 1).padStart(2, "0")}` })).sort(compareCalendarEvents);
    const t0 = performance.now();
    expect(buildAgendaRows({ events: many, earlierOverdue: [], today }).rows.length).toBeGreaterThan(5000);
    expect(performance.now() - t0).toBeLessThan(300);
  });
});
