import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "../types/calendar";
import { summarizeCalendarCash, summaryRange } from "./calendarSummary";

const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: over.id ?? `${over.source ?? "card_bill"}:${over.refId ?? "r"}:${over.date ?? "2026-10-18"}`,
  source: "card_bill",
  refId: "r",
  date: "2026-10-18",
  title: "x",
  amount: 1000,
  currency: "INR",
  direction: "out",
  state: "scheduled",
  priority: 1,
  actionable: true,
  href: "/x",
  ...over,
});

const range = { from: "2026-10-15", to: "2026-11-13" };

describe("windows", () => {
  it("covers 7 days, 30 days or the rest of the month", () => {
    expect(summaryRange("next7", "2026-10-15")).toEqual({ from: "2026-10-15", to: "2026-10-21" });
    expect(summaryRange("next30", "2026-10-15")).toEqual(range);
    expect(summaryRange("restOfMonth", "2028-02-10")).toEqual({ from: "2028-02-10", to: "2028-02-29" });
  });
});

describe("summary", () => {
  const events = [
    ev({ refId: "bill", amount: 8420 }),
    ev({ refId: "rent", source: "subscription", amount: 15000, date: "2026-11-01" }),
    ev({ refId: "lent", source: "receivable", direction: "in", state: "expected", amount: 5000 }),
    ev({ refId: "salary", source: "income", direction: "in", state: "actual", amount: 50000, date: "2026-10-15" }),
    ev({ refId: "paid", state: "completed", amount: 999 }),
    ev({ refId: "epf", source: "epf", direction: "neutral", state: "expected", amount: 3600 }),
    ev({ refId: "late", state: "overdue", amount: 2000, date: "2026-10-15" }),
    ev({ refId: "loan", source: "borrowing", amount: null }),
    ev({ refId: "usd", currency: "USD", amount: 70 }),
    ev({ refId: "later", date: "2026-12-01", amount: 99999 }),
  ];
  const earlier = [ev({ refId: "old", state: "overdue", amount: 3000, date: "2026-09-01" })];
  const s = summarizeCalendarCash({ range, counted: 40000, events, earlierOverdue: earlier, currency: "INR" });

  it("separates counted money, expected in, commitments and overdue", () => {
    expect(s.counted).toBe(40000);
    expect(s.expectedIn.total).toBe(5000);
    expect(s.commitments.total).toBe(23420);
    expect(s.overdue.total).toBe(5000);
    expect(s.projectedRemaining).toBe(40000 + 5000 - 23420 - 5000);
  });

  it("keeps every figure traceable to its events", () => {
    expect(s.expectedIn.events.map((e) => e.refId)).toEqual(["lent"]);
    expect(s.commitments.events.map((e) => e.refId).sort()).toEqual(["bill", "rent"]);
    expect(s.overdue.events.map((e) => e.refId)).toEqual(["old", "late"]);
  });

  it("never re-adds recorded income, completed, neutral, foreign-currency or out-of-window events", () => {
    const all = [...s.expectedIn.events, ...s.commitments.events, ...s.overdue.events].map((e) => e.refId);
    for (const id of ["salary", "paid", "epf", "usd", "later"]) expect(all).not.toContain(id);
  });

  it("lists open events without an amount separately", () => {
    expect(s.withoutAmount.map((e) => e.refId)).toEqual(["loan"]);
  });

  it("counts an overdue item only once", () => {
    const dup = ev({ refId: "late", state: "overdue", amount: 2000, date: "2026-10-15" });
    const t = summarizeCalendarCash({ range, counted: 0, events: [dup], earlierOverdue: [dup], currency: "INR" });
    expect(t.overdue.total).toBe(2000);
  });
});
