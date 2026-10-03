/**
 * SPENDLY-185 — end-to-end QA for the Financial Calendar (epic SPENDLY-176).
 *
 * Runs one realistic data set through every layer — source adapters, query,
 * month grid, agenda, cash summary and notification plan — and checks the
 * epic's guarantees together:
 *
 *   1. Every event traces to a canonical record, with the record's amount.
 *   2. The calendar never mutates or duplicates a source record.
 *   3. Views agree with each other (grid, agenda, summary, notifications).
 *   4. Month/year ends, leap years and "today" changes are deterministic.
 *   5. Missing amounts and dates degrade honestly.
 *   6. Calendar code never logs private content.
 *   7. Large data stays fast across all layers together.
 *
 * Results are summarised in docs/SPENDLY-185-calendar-qa.md.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { Borrowing } from "../types/borrowing";
import type { CalendarReminder } from "../types/calendarReminder";
import type { CreditCardBill } from "../types/creditCardBill";
import type { FinancialGoal, Income } from "../types/expense";
import type { Investment } from "../types/investment";
import type { Receivable } from "../types/receivable";
import type { Subscription } from "../types/subscription";
import type { EpfContribution } from "../features/epf/types";
import type { SipPlan } from "../features/sip/types";
import { buildAgendaRows } from "./calendarAgenda";
import { buildMonthGrid } from "./calendarMonth";
import { planCalendarNotifications } from "./calendarNotifications";
import { monthGridRange, queryCalendar, type CalendarData } from "./calendarQuery";
import { summarizeCalendarCash, summaryRange } from "./calendarSummary";

const TODAY = "2026-10-15";

function dataset(): CalendarData {
  const bills = [
    { id: "b-open", accountId: "card", statementDate: "2026-09-28", dueDate: "2026-10-18", statementAmount: 8420, minimumDueAmount: 421, amountPaid: 0, remainingAmount: 8420, currency: "INR", status: "UPCOMING" },
    { id: "b-late", accountId: "card", statementDate: "2026-08-28", dueDate: "2026-09-18", statementAmount: 3000, minimumDueAmount: 150, amountPaid: 0, remainingAmount: 3000, currency: "INR", status: "OVERDUE" },
    { id: "b-paid", accountId: "card", statementDate: "2026-09-01", dueDate: "2026-10-05", statementAmount: 2000, minimumDueAmount: 100, amountPaid: 2000, remainingAmount: 0, currency: "INR", status: "PAID" },
  ] as CreditCardBill[];
  const subscriptions: Subscription[] = [
    { id: "rent", name: "Rent", amount: 15000, category: "Home & Household", dayOfMonth: 31, isActive: true, lastProcessed: "2026-09", type: "subscription" },
    { id: "emi", name: "Car EMI", amount: 12000, category: "Finance, Loans & Insurance", dayOfMonth: 5, isActive: true, lastProcessed: "2026-10", type: "emi", endYear: 2027, endMonth: 3 },
    { id: "move", name: "To savings", amount: 5000, category: "Miscellaneous", dayOfMonth: 1, isActive: true, lastProcessed: "2026-10", type: "transfer" },
  ];
  const borrowings = [
    { id: "loan", lenderName: "Ravi", dueDate: "2026-10-25", status: "ACTIVE", totalOutstanding: 50000 },
    { id: "loan-no-amount", lenderName: "Meena", dueDate: "2026-10-28", status: "ACTIVE" },
  ] as Borrowing[];
  const receivables = [
    { id: "owed", personName: "Asha", dueDate: "2026-10-20", status: "ACTIVE", outstandingAmount: 5000 },
    { id: "owed-no-date", personName: "Kiran", dueDate: null, status: "ACTIVE", outstandingAmount: 1000 },
  ] as Receivable[];
  const incomes = [{ id: "sal", amount: 80000, source: "Salary", note: "", date: "2026-10-01", month: "2026-10", createdAt: 1 }] as Income[];
  const goals: FinancialGoal[] = [{ id: "trip", name: "Trip", targetAmount: 100000, currentAmount: 30000, deadline: "2026-10-30" }];
  const investments = [{ id: "fd", name: "SBI FD", kind: "fixed_deposit", principal: 100000, startDate: "2025-10-22", annualInterestRate: 0, maturityDate: "2026-10-22", status: "active" }] as Investment[];
  const sipPlans = [{ id: "sip", assetName: "Nifty 50", investmentAmount: 5000, currency: "INR", frequency: "monthly", executionDay: 10, status: "active", nextExecutionDate: "2026-11-10", skipNextExecution: false }] as SipPlan[];
  const epfContributions = [{ id: "epf", establishmentId: "e1", month: "2026-09", epfCredit: 3600, status: "expected", expectedCreditTo: "2026-10-15" }] as EpfContribution[];
  const reminders: CalendarReminder[] = [
    { id: "ins", title: "Renew insurance", startDate: "2026-10-27", category: "insurance", recurrence: "yearly", remindDaysBefore: 3, completedDates: [], createdAtMs: 1, updatedAtMs: 1, estimatedAmount: 12000 },
  ];
  return {
    bills,
    cardNames: new Map([["card", "HDFC Regalia"]]),
    subscriptions,
    borrowings,
    receivables,
    incomes,
    goals,
    investments,
    sipPlans,
    epfContributions,
    epfEmployerNames: new Map([["e1", "Acme"]]),
    reminders,
  };
}

const october = () => queryCalendar({ range: monthGridRange("2026-10", "monday"), today: TODAY, currency: "INR", data: dataset() });

describe("1. every event traces to its record", () => {
  it("keeps the source id and the record's amount", () => {
    const data = dataset();
    const r = october();
    const ids: Record<string, string[]> = {
      card_bill: data.bills.map((b) => b.id),
      subscription: data.subscriptions.map((s) => s.id!),
      emi: data.subscriptions.map((s) => s.id!),
      borrowing: data.borrowings.map((b) => b.id!),
      receivable: data.receivables.map((x) => x.id!),
      income: data.incomes.map((i) => i.id!),
      goal: data.goals.map((g) => g.id),
      investment: data.investments.map((i) => i.id),
      sip: data.sipPlans.map((p) => p.id),
      epf: data.epfContributions.map((c) => c.id),
      reminder: data.reminders!.map((x) => x.id),
    };
    for (const e of r.events) {
      expect(ids[e.source], `${e.id}`).toContain(e.refId);
      expect(e.href.startsWith("/"), e.id).toBe(true);
    }
    const byRef = (ref: string) => r.events.find((e) => e.refId === ref)!;
    expect(byRef("b-open").amount).toBe(8420);
    expect(byRef("loan").amount).toBe(50000);
    expect(byRef("owed").amount).toBe(5000);
    expect(byRef("sal").amount).toBe(80000);
  });

  it("shows nothing it can't source: transfers, undated receivables", () => {
    const refs = october().events.map((e) => e.refId);
    expect(refs).not.toContain("move");
    expect(refs).not.toContain("owed-no-date");
  });
});

describe("2. no mutation, no duplicates", () => {
  it("leaves every source record untouched", () => {
    const data = dataset();
    const before = JSON.stringify({ ...data, cardNames: [...data.cardNames], epfEmployerNames: [...data.epfEmployerNames] });
    queryCalendar({ range: monthGridRange("2026-10", "monday"), today: TODAY, currency: "INR", data });
    expect(JSON.stringify({ ...data, cardNames: [...data.cardNames], epfEmployerNames: [...data.epfEmployerNames] })).toBe(before);
  });

  it("gives the same id to the same event in overlapping month grids", () => {
    const oct = october();
    const nov = queryCalendar({ range: monthGridRange("2026-11", "monday"), today: TODAY, currency: "INR", data: dataset() });
    const overlap = oct.events.filter((e) => e.date >= nov.range.from);
    for (const e of overlap) expect(nov.events.find((n) => n.id === e.id), e.id).toBeTruthy();
    expect(oct.duplicatesDropped).toBe(0);
  });
});

describe("3. views agree", () => {
  const r = october();

  it("grid, agenda and summary are built from the same events", () => {
    const gridTotal = buildMonthGrid("2026-10", "monday", r.byDate, TODAY, TODAY)
      .weeks.flat()
      .reduce((t, c) => t + c.total, 0);
    expect(gridTotal).toBe(r.events.length);
    const agenda = buildAgendaRows({ events: r.events, earlierOverdue: r.earlierOverdue, today: TODAY });
    const agendaIds = agenda.rows.filter((x) => x.type === "event").map((x) => (x.type === "event" ? x.event.id : ""));
    for (const e of r.events) expect(agendaIds).toContain(e.id);
    expect(agendaIds).toContain("card_bill:b-late:2026-09-18");
  });

  it("the cash summary only adds open, dated, same-currency money", () => {
    const range = summaryRange("restOfMonth", TODAY);
    const q = queryCalendar({ range, today: TODAY, currency: "INR", data: dataset() });
    const s = summarizeCalendarCash({ range, counted: 40000, events: q.events, earlierOverdue: q.earlierOverdue, currency: "INR" });
    expect(s.commitments.events.map((e) => e.refId).sort()).toEqual(["b-open", "loan", "rent"]);
    expect(s.expectedIn.events.map((e) => e.refId).sort()).toEqual(["fd", "owed"]);
    expect(s.overdue.events.map((e) => e.refId)).toEqual(["b-late"]);
    expect(s.withoutAmount.map((e) => e.refId)).toEqual(["loan-no-amount"]);
    // Recorded salary, EPF, goal and the reminder never count as money.
    const counted = [...s.commitments.events, ...s.expectedIn.events, ...s.overdue.events].map((e) => e.refId);
    for (const ref of ["sal", "epf", "trip", "ins"]) expect(counted).not.toContain(ref);
    expect(s.projectedRemaining).toBe(40000 + 5000 + 100000 - (8420 + 50000 + 15000) - 3000);
  });

  it("notifications only cover open items and never card bills", () => {
    const plan = planCalendarNotifications({
      events: r.events,
      reminders: dataset().reminders!,
      today: TODAY,
      prefs: { remindersEnabled: true, duesEnabled: true, duesDaysBefore: 1 },
      format: String,
    });
    const sources = new Set(plan.map((n) => n.eventId.split(":")[0]));
    expect(sources.has("card_bill")).toBe(false);
    expect(sources.has("income")).toBe(false);
    expect(plan.every((n) => n.fireDate >= TODAY)).toBe(true);
    expect(plan.some((n) => n.eventId === "reminder:ins:2026-10-27" && n.kind === "before" && n.fireDate === "2026-10-24")).toBe(true);
  });
});

describe("4. boundaries and time", () => {
  it("rolls a day-31 rent through year end and a leap February", () => {
    const data = { ...dataset(), subscriptions: [dataset().subscriptions[0]] };
    const q = queryCalendar({ range: { from: "2027-12-01", to: "2028-03-31" }, today: "2027-12-01", currency: "INR", data });
    expect(q.events.filter((e) => e.refId === "rent").map((e) => e.date)).toEqual(["2027-12-31", "2028-01-31", "2028-02-29", "2028-03-31"]);
  });

  it("depends only on the local 'today' key, so the same day always gives the same answer", () => {
    const a = october();
    const b = october();
    expect(a.events).toEqual(b.events);
    const nextDay = queryCalendar({ range: monthGridRange("2026-10", "monday"), today: "2026-10-19", currency: "INR", data: dataset() });
    expect(nextDay.events.find((e) => e.refId === "b-open")!.state).toBe("overdue");
    expect(a.events.find((e) => e.refId === "b-open")!.state).toBe("scheduled");
  });
});

describe("5. missing data", () => {
  it("shows an amountless event without inventing a figure", () => {
    expect(october().events.find((e) => e.refId === "loan-no-amount")!.amount).toBeNull();
    expect(october().events.find((e) => e.refId === "trip")!.amount).toBeNull();
  });
});

describe("6. privacy in logs", () => {
  it("calendar code only logs a scope and the error", () => {
    const dirs = ["app/(app)/calendar", "components/calendar", "services/calendar"];
    const files = dirs.flatMap((d) => readdirSync(d).filter((f) => /\.tsx?$/.test(f)).map((f) => join(d, f)));
    const calls = files.flatMap((f) => [...readFileSync(f, "utf8").matchAll(/log(?:Error|Warning)\(([^)]*)\)/g)].map((m) => ({ f, args: m[1] })));
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c.args.split(",").length, `${c.f}: ${c.args}`).toBe(2);
  });
});

describe("7. large data", () => {
  it("runs every layer over 20,000 records quickly", () => {
    const base = dataset();
    const incomes = Array.from({ length: 20000 }, (_, i) => ({ ...base.incomes[0], id: `i${i}`, date: `2026-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}` }));
    const subscriptions = Array.from({ length: 300 }, (_, i) => ({ ...base.subscriptions[0], id: `s${i}`, dayOfMonth: (i % 28) + 1 }));
    const reminders = Array.from({ length: 300 }, (_, i) => ({ ...base.reminders![0], id: `m${i}`, recurrence: "monthly" as const, startDate: `2026-${String((i % 9) + 1).padStart(2, "0")}-10` }));
    const data = { ...base, incomes, subscriptions, reminders };
    const t0 = performance.now();
    const r = queryCalendar({ range: monthGridRange("2026-10", "monday"), today: TODAY, currency: "INR", data });
    buildMonthGrid("2026-10", "monday", r.byDate, TODAY, TODAY);
    buildAgendaRows({ events: r.events, earlierOverdue: r.earlierOverdue, today: TODAY });
    summarizeCalendarCash({ range: r.range, counted: 0, events: r.events, earlierOverdue: r.earlierOverdue, currency: "INR" });
    planCalendarNotifications({ events: r.events, reminders, today: TODAY, prefs: { remindersEnabled: true, duesEnabled: true, duesDaysBefore: 1 }, format: String });
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(r.events.length).toBeGreaterThan(1000);
  });
});
