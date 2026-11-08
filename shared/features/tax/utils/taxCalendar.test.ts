import { describe, expect, it } from "vitest";

import { queryCalendar, type CalendarData } from "@/shared/utils/calendarQuery";
import { planCalendarNotifications } from "@/shared/utils/calendarNotifications";
import type { CalendarContext } from "@/shared/utils/calendarSources";
import { isValidDateKey } from "@/shared/utils/dates";
import { TAX_DEADLINE_SETS, taxDeadlinesFor } from "../data/taxDeadlines";
import type { TaxDocument, TaxEntry } from "../types";
import { buildTaxEntry } from "./builders";
import { actionableTaxEvents, taxCalendarFacts, taxEvents } from "./taxCalendar";
import { financialYearDateBounds } from "./taxYear";
import type { TaxEntryDraft } from "./validation";

let n = 0;
function entry(fy: string, draft: Omit<TaxEntryDraft, "fy">): TaxEntry {
  const r = buildTaxEntry({ id: `c${(n += 1)}`, draft: { fy, ...draft } as TaxEntryDraft, nowMs: n });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}
const advance = (fy: string, date: string) => entry(fy, { kind: "tax_payment", fields: { paymentType: "advance_tax", date, amount: 10_000 } });
const ctx = (today: string, from: string, to: string): CalendarContext => ({ range: { from, to }, today, currency: "INR" });
const FY25 = { from: "2025-04-01", to: "2027-03-31" };
const byRef = (events: ReturnType<typeof taxEvents>, ref: string) => events.find((e) => e.refId === ref);

describe("tax deadline data", () => {
  it("is versioned, sourced and valid", () => {
    const ids = new Set<string>();
    for (const set of TAX_DEADLINE_SETS) {
      expect(set.version).toBeTruthy();
      expect(set.sources.length).toBeGreaterThan(0);
      const bounds = financialYearDateBounds(set.fy)!;
      for (const d of set.deadlines) {
        expect(isValidDateKey(d.date), `${set.fy} ${d.id}`).toBe(true);
        expect(ids.has(`${set.fy}-${d.id}`)).toBe(false);
        ids.add(`${set.fy}-${d.id}`);
        // Advance tax and the year end fall inside the year; filing dates after it.
        if (d.kind === "advance_tax" || d.kind === "year_end") expect(d.date >= bounds.startDate && d.date <= bounds.endDate).toBe(true);
        else expect(d.date > bounds.endDate).toBe(true);
      }
    }
  });

  it("FY 2025-26 matches the dates checked on the official pages", () => {
    const set = taxDeadlinesFor("2025-26")!;
    const date = (id: string) => set.deadlines.find((d) => d.id === id)?.date;
    expect([date("advance-1"), date("advance-2"), date("advance-3"), date("advance-4")]).toEqual(["2025-06-15", "2025-09-15", "2025-12-15", "2026-03-15"]);
    expect([date("form16"), date("itr-due"), date("belated"), date("revised")]).toEqual(["2026-06-15", "2026-07-31", "2026-12-31", "2027-03-31"]);
    // Filing dates for 2026-27 aren't verified yet, so there are none.
    expect(taxDeadlinesFor("2026-27")!.deadlines.some((d) => d.kind === "itr_due")).toBe(false);
  });
});

describe("taxEvents", () => {
  it("advance tax: done when a payment falls in the instalment's window", () => {
    const facts = taxCalendarFacts({ entries: [advance("2025-26", "2025-09-10")], documents: [] });
    const events = taxEvents(facts, ctx("2026-01-10", FY25.from, FY25.to));
    expect(byRef(events, "2025-26-advance-1")?.state).toBe("overdue"); // pays advance tax, nothing by 15 June
    expect(byRef(events, "2025-26-advance-2")?.state).toBe("completed");
    expect(byRef(events, "2025-26-advance-3")?.state).toBe("overdue");
    expect(byRef(events, "2025-26-advance-4")?.state).toBe("scheduled");
  });

  it("advance tax: never overdue for someone who pays none", () => {
    const events = taxEvents(taxCalendarFacts({ entries: [], documents: [] }), ctx("2026-01-10", FY25.from, FY25.to));
    expect(byRef(events, "2025-26-advance-1")?.state).toBe("expected");
    expect(actionableTaxEvents(events, "2026-01-10").map((e) => e.refId)).toEqual(expect.not.arrayContaining(["2025-26-advance-1"]));
  });

  it("Form 16: only with salary; overdue while missing; done once added or uploaded", () => {
    const today = "2026-07-01";
    const none = taxEvents(taxCalendarFacts({ entries: [], documents: [] }), ctx(today, FY25.from, FY25.to));
    expect(byRef(none, "2025-26-form16")).toBeUndefined();
    const salary = taxCalendarFacts({ entries: [], documents: [], incomes: [{ source: "Salary", date: "2025-05-01", month: "2025-05" }] });
    expect(byRef(taxEvents(salary, ctx(today, FY25.from, FY25.to)), "2025-26-form16")?.state).toBe("overdue");
    const doc = { fy: "2025-26", category: "form16" } as TaxDocument;
    const uploaded = taxCalendarFacts({ entries: [], documents: [doc], incomes: [{ source: "Salary", date: "2025-05-01", month: "2025-05" }] });
    expect(byRef(taxEvents(uploaded, ctx(today, FY25.from, FY25.to)), "2025-26-form16")?.state).toBe("completed");
  });

  it("filing dates are informational: a past one never reads overdue", () => {
    const events = taxEvents(taxCalendarFacts({ entries: [], documents: [] }), ctx("2026-11-08", FY25.from, FY25.to));
    expect(byRef(events, "2025-26-itr-due")?.state).toBe("expected");
    expect(byRef(events, "2025-26-belated")?.state).toBe("scheduled");
    expect(events.every((e) => e.amount === null && e.direction === "neutral")).toBe(true);
  });

  it("covers both years across a year switch, with stable ids and no duplicates", () => {
    const facts = taxCalendarFacts({ entries: [], documents: [] });
    const range = ctx("2026-11-08", "2026-03-01", "2027-03-31");
    const once = taxEvents(facts, range);
    expect(once.map((e) => e.id)).toEqual(taxEvents(facts, range).map((e) => e.id));
    expect(new Set(once.map((e) => e.id)).size).toBe(once.length);
    expect(once.map((e) => e.refId)).toEqual(expect.arrayContaining(["2025-26-advance-4", "2026-27-advance-3", "2026-27-year-end"]));
    expect(once.find((e) => e.refId === "2026-27-advance-3")?.id).toBe("tax:2026-27-advance-3:2026-12-15");
  });

  it("appears in the calendar query once, and only when tax facts are given", () => {
    const data: CalendarData = {
      bills: [], cardNames: new Map(), subscriptions: [], borrowings: [], receivables: [], incomes: [], goals: [], investments: [], sipPlans: [], epfContributions: [], epfEmployerNames: new Map(),
    };
    const range = { from: "2026-12-01", to: "2026-12-31" };
    expect(queryCalendar({ range, today: "2026-11-08", currency: "INR", data }).events.filter((e) => e.source === "tax")).toEqual([]);
    const withTax = queryCalendar({ range, today: "2026-11-08", currency: "INR", data: { ...data, taxFacts: taxCalendarFacts({ entries: [], documents: [] }) } });
    expect(withTax.events.filter((e) => e.source === "tax").map((e) => e.refId)).toEqual(["2026-27-advance-3", "2025-26-belated"]);
    expect(withTax.duplicatesDropped).toBe(0);
  });
});

describe("tax notifications", () => {
  const facts = taxCalendarFacts({ entries: [advance("2026-27", "2026-09-10")], documents: [] });
  const events = taxEvents(facts, ctx("2026-12-01", "2026-11-30", "2027-01-30"));
  const prefs = { remindersEnabled: false, duesEnabled: false, duesDaysBefore: 1 as const };

  it("nothing is planned with the switch off", () => {
    expect(planCalendarNotifications({ events, reminders: [], today: "2026-12-01", prefs, format: String })).toEqual([]);
  });

  it("before and on the day, with the chosen lead and no amounts", () => {
    const plan = planCalendarNotifications({ events, reminders: [], today: "2026-12-01", prefs: { ...prefs, taxEnabled: true, taxDaysBefore: 7 }, format: String });
    const advance3 = plan.filter((p) => p.eventId === "tax:2026-27-advance-3:2026-12-15");
    expect(advance3.map((p) => [p.kind, p.fireDate])).toEqual([
      ["before", "2026-12-08"],
      ["due", "2026-12-15"],
    ]);
    expect(advance3.map((p) => p.body)).toEqual(["In 7 days", "Today"]);
    expect(plan.every((p) => !/₹|\d{3,}/.test(p.body))).toBe(true);
  });

  it("an informational past date never notifies", () => {
    const past = taxEvents(taxCalendarFacts({ entries: [], documents: [] }), ctx("2026-08-01", "2026-07-30", "2026-08-30"));
    expect(past.find((e) => e.refId === "2025-26-itr-due")?.state).toBe("expected");
    expect(planCalendarNotifications({ events: past, reminders: [], today: "2026-08-01", prefs: { ...prefs, taxEnabled: true }, format: String })).toEqual([]);
  });
});
