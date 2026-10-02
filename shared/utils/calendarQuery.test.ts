import { describe, expect, it } from "vitest";

import type { Borrowing } from "../types/borrowing";
import type { CalendarEvent } from "../types/calendar";
import type { CreditCardBill } from "../types/creditCardBill";
import type { Income } from "../types/expense";
import type { Subscription } from "../types/subscription";
import { CALENDAR_MAX_RANGE_DAYS, compareCalendarEvents, monthGridRange, normalizeCalendarRange, queryCalendar, type CalendarData } from "./calendarQuery";

const empty = (): CalendarData => ({
  bills: [],
  cardNames: new Map(),
  subscriptions: [],
  borrowings: [],
  receivables: [],
  incomes: [],
  goals: [],
  investments: [],
  sipPlans: [],
  epfContributions: [],
  epfEmployerNames: new Map(),
});
const bill = (over: Partial<CreditCardBill>) =>
  ({ id: "b1", accountId: "c", statementDate: "2026-09-28", dueDate: "2026-10-18", statementAmount: 9000, minimumDueAmount: 450, amountPaid: 0, remainingAmount: 9000, currency: "INR", status: "UPCOMING", ...over }) as CreditCardBill;
const sub = (over: Partial<Subscription>): Subscription => ({ id: "s1", name: "Rent", amount: 15000, category: "Home & Household", dayOfMonth: 18, isActive: true, lastProcessed: "2026-09", type: "subscription", ...over });
const inc = (over: Partial<Income>) => ({ id: "i1", amount: 80000, source: "Salary", note: "", date: "2026-10-18", month: "2026-10", createdAt: 1, ...over }) as Income;
const OCT = { from: "2026-10-01", to: "2026-10-31" };
const q = (data: Partial<CalendarData>, extra: Partial<Parameters<typeof queryCalendar>[0]> = {}) =>
  queryCalendar({ range: OCT, today: "2026-10-15", currency: "INR", data: { ...empty(), ...data }, ...extra });

describe("aggregation", () => {
  it("lets events from different sources share a date, in a stable order", () => {
    const r = q({ bills: [bill({})], subscriptions: [sub({})], incomes: [inc({})], borrowings: [{ id: "l1", lenderName: "Ravi", dueDate: "2026-10-18", status: "ACTIVE", totalOutstanding: 5000 } as Borrowing] });
    expect(r.byDate.get("2026-10-18")!.map((e) => e.source)).toEqual(["card_bill", "borrowing", "subscription", "income"]);
    expect(r.events).toEqual([...r.events].sort(compareCalendarEvents));
  });

  it("drops duplicate source records", () => {
    const r = q({ bills: [bill({}), bill({})] });
    expect(r.events).toHaveLength(1);
    expect(r.duplicatesDropped).toBe(1);
  });

  it("includes events from other features and keeps them in range", () => {
    const extra: CalendarEvent = { id: "reminder:x:2026-10-20", source: "reminder", refId: "x", date: "2026-10-20", title: "Renew insurance", amount: null, currency: "INR", direction: "neutral", state: "scheduled", priority: 1, actionable: true, href: "/calendar" };
    const r = q({ extraEvents: [extra, { ...extra, id: "reminder:y:2026-12-01", date: "2026-12-01" }] });
    expect(r.events.map((e) => e.id)).toEqual(["reminder:x:2026-10-20"]);
  });
});

describe("visibility rules", () => {
  it("hides cancelled events unless asked, keeps completed ones", () => {
    const data = { bills: [bill({ id: "x", status: "CANCELLED" }), bill({ id: "p", status: "PAID", remainingAmount: 0 })] };
    expect(q(data).events.map((e) => e.refId)).toEqual(["p"]);
    expect(q(data, { includeCancelled: true }).events.map((e) => e.refId).sort()).toEqual(["p", "x"]);
  });

  it("keeps overdue items from before the range discoverable", () => {
    const r = q({ bills: [bill({ id: "old", dueDate: "2026-08-20", status: "OVERDUE" }), bill({ id: "paid-old", dueDate: "2026-08-10", status: "PAID", remainingAmount: 0 })] });
    expect(r.events).toHaveLength(0);
    expect(r.earlierOverdue.map((e) => e.refId)).toEqual(["old"]);
  });

  it("does not fabricate future events without source data", () => {
    expect(q({}).events).toEqual([]);
    expect(q({ incomes: [inc({ date: "2026-09-01", month: "2026-09" })] }, { range: { from: "2026-11-01", to: "2026-11-30" } }).events).toEqual([]);
  });
});

describe("load states", () => {
  it("reports ready, loading, partial and error", () => {
    expect(q({}, { status: { card_bill: "ready", income: "ready" } }).loadState).toBe("ready");
    expect(q({}, { status: { card_bill: "loading", income: "loading" } }).loadState).toBe("loading");
    expect(q({ bills: [bill({})] }, { status: { card_bill: "ready", income: "loading" } }).loadState).toBe("partial");
    const failed = q({ bills: [bill({})] }, { status: { card_bill: "ready", income: "error" } });
    expect(failed).toMatchObject({ loadState: "partial", failedSources: ["income"] });
    expect(q({}, { status: { income: "error" } }).loadState).toBe("error");
  });
});

describe("ranges and month boundaries", () => {
  it("normalises reversed, invalid and overlong ranges", () => {
    expect(normalizeCalendarRange({ from: "2026-10-31", to: "2026-10-01" }, "2026-10-15")).toEqual(OCT);
    expect(normalizeCalendarRange({ from: "bad", to: "bad" }, "2026-10-15")).toEqual({ from: "2026-10-15", to: "2026-10-15" });
    const long = normalizeCalendarRange({ from: "2026-01-01", to: "2030-01-01" }, "2026-10-15");
    expect(long.to).toBe("2027-02-04");
    expect(CALENDAR_MAX_RANGE_DAYS).toBe(400);
  });

  it("builds whole-week month grids for either week start, across leap February and year end", () => {
    expect(monthGridRange("2026-10", "monday")).toEqual({ from: "2026-09-28", to: "2026-11-01" });
    expect(monthGridRange("2026-10", "sunday")).toEqual({ from: "2026-09-27", to: "2026-10-31" });
    expect(monthGridRange("2028-02", "monday")).toEqual({ from: "2028-01-31", to: "2028-03-05" });
    expect(monthGridRange("2026-12", "monday")).toEqual({ from: "2026-11-30", to: "2027-01-03" });
  });

  it("puts month-end events in the right month", () => {
    const r = q({ bills: [bill({ dueDate: "2026-10-31" }), bill({ id: "b2", dueDate: "2026-11-01" })] });
    expect(r.events.map((e) => e.date)).toEqual(["2026-10-31"]);
  });
});

describe("performance", () => {
  it("queries a month over a large history quickly", () => {
    const incomes: Income[] = Array.from({ length: 20000 }, (_, i) => inc({ id: `i${i}`, date: `20${20 + (i % 7)}-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}` }));
    const bills = Array.from({ length: 2000 }, (_, i) => bill({ id: `b${i}`, dueDate: `2026-${String((i % 12) + 1).padStart(2, "0")}-15`, status: i % 3 ? "PAID" : "UPCOMING" }));
    const subscriptions = Array.from({ length: 200 }, (_, i) => sub({ id: `s${i}`, dayOfMonth: (i % 28) + 1 }));
    const t0 = performance.now();
    const r = q({ incomes, bills, subscriptions });
    expect(performance.now() - t0).toBeLessThan(800);
    expect(r.events.length).toBeGreaterThan(0);
  });
});
