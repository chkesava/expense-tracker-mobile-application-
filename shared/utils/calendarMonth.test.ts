import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "../types/calendar";
import { buildMonthGrid, dayAccessibilityLabel, dayTotals, eventAccessibilityLabel, longDateLabel, monthTitle, nextMonth, previousMonth } from "./calendarMonth";

const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: over.id ?? "x",
  source: "card_bill",
  refId: "r",
  date: "2026-10-18",
  title: "HDFC bill",
  amount: 9000,
  currency: "INR",
  direction: "out",
  state: "scheduled",
  priority: 1,
  actionable: true,
  href: "/x",
  ...over,
});

describe("month navigation", () => {
  it("titles and steps across year ends", () => {
    expect(monthTitle("2026-10")).toBe("October 2026");
    expect(nextMonth("2026-12")).toBe("2027-01");
    expect(previousMonth("2027-01")).toBe("2026-12");
  });

  it("labels dates in full", () => {
    expect(longDateLabel("2028-02-29")).toBe("Tuesday, 29 February 2028");
  });
});

describe("grid", () => {
  const byDate = new Map([
    ["2026-10-18", [ev({ id: "a" }), ev({ id: "b", direction: "in", source: "income" }), ev({ id: "c", direction: "neutral", source: "goal", amount: null })]],
    ["2026-10-05", [ev({ id: "d", date: "2026-10-05", state: "overdue" })]],
  ]);

  it("lays out whole weeks with the user's first day", () => {
    const g = buildMonthGrid("2026-10", "monday", byDate, "2026-10-15", "2026-10-18");
    expect(g.weekdays).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(g.weeks).toHaveLength(5);
    expect(g.weeks.every((w) => w.length === 7)).toBe(true);
    expect(g.weeks[0][0]).toMatchObject({ date: "2026-09-28", inMonth: false });
    const sunday = buildMonthGrid("2026-10", "sunday", byDate, "2026-10-15", "2026-10-18");
    expect(sunday.weekdays[0]).toBe("Sun");
  });

  it("marks today, the selection, counts by direction and overdue", () => {
    const cells = buildMonthGrid("2026-10", "monday", byDate, "2026-10-15", "2026-10-18").weeks.flat();
    expect(cells.find((c) => c.date === "2026-10-15")!.isToday).toBe(true);
    expect(cells.find((c) => c.date === "2026-10-18")).toMatchObject({ isSelected: true, outCount: 1, inCount: 1, otherCount: 1, total: 3, overdue: false });
    expect(cells.find((c) => c.date === "2026-10-05")!.overdue).toBe(true);
  });

  it("handles a leap February and six-week months", () => {
    const feb = buildMonthGrid("2028-02", "monday", new Map(), "2028-02-01", "2028-02-01").weeks.flat();
    expect(feb.filter((c) => c.inMonth)).toHaveLength(29);
    expect(buildMonthGrid("2026-08", "monday", new Map(), "2026-08-01", "2026-08-01").weeks).toHaveLength(6);
  });
});

describe("accessibility text", () => {
  it("describes a day without relying on colour", () => {
    expect(dayAccessibilityLabel("2026-10-18", [ev({}), ev({ id: "o", state: "overdue" })], false, true)).toBe(
      "Sunday, 18 October 2026, selected, 2 payments, 1 overdue"
    );
    expect(dayAccessibilityLabel("2026-10-19", [], true, false)).toBe("Monday, 19 October 2026, today, no financial events");
  });

  it("describes an event with source, state and direction", () => {
    expect(eventAccessibilityLabel(ev({}), (n) => `₹${n}`)).toBe("HDFC bill, Card bill, Scheduled, money out ₹9000");
    expect(eventAccessibilityLabel(ev({ amount: null, direction: "neutral", source: "goal", title: "Trip deadline" }), String)).toBe("Trip deadline, Goal, Scheduled");
  });
});

describe("day totals", () => {
  it("sums money in and out, skipping cancelled and amountless events", () => {
    expect(
      dayTotals([ev({ amount: 100 }), ev({ amount: 50, direction: "in" }), ev({ amount: null }), ev({ amount: 999, state: "cancelled" }), ev({ amount: 10, state: "overdue" })])
    ).toEqual({ out: 110, in: 50, overdue: 1 });
  });
});
