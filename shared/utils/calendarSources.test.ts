import { describe, expect, it } from "vitest";

import type { Borrowing } from "../types/borrowing";
import { CALENDAR_SOURCES, CALENDAR_STATES } from "../types/calendar";
import type { CreditCardBill } from "../types/creditCardBill";
import type { FinancialGoal, Income } from "../types/expense";
import type { Investment } from "../types/investment";
import type { Receivable } from "../types/receivable";
import type { Subscription } from "../types/subscription";
import type { EpfContribution } from "../features/epf/types";
import type { SipPlan } from "../features/sip/types";
import {
  borrowingEvents,
  calendarEventId,
  calendarPriority,
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

const ctx = (from = "2026-10-01", to = "2026-10-31", today = "2026-10-15"): CalendarContext => ({ range: { from, to }, today, currency: "INR" });

const bill = (over: Partial<CreditCardBill>): CreditCardBill =>
  ({ id: "b1", accountId: "card", statementDate: "2026-09-28", dueDate: "2026-10-18", statementAmount: 9000, minimumDueAmount: 450, amountPaid: 0, remainingAmount: 9000, currency: "INR", status: "UPCOMING", ...over }) as CreditCardBill;

describe("contract", () => {
  it("builds stable ids from source, record and date", () => {
    expect(calendarEventId("card_bill", "b1", "2026-10-18")).toBe("card_bill:b1:2026-10-18");
    const a = cardBillEvents([bill({})], new Map(), ctx());
    const b = cardBillEvents([bill({})], new Map(), ctx());
    expect(a[0].id).toBe(b[0].id);
  });

  it("documents every source and state", () => {
    expect(CALENDAR_SOURCES).toHaveLength(11);
    expect(CALENDAR_STATES).toContain("projected");
  });

  it("prioritises overdue, then due within three days", () => {
    expect(calendarPriority("overdue", "2026-10-01", "2026-10-15")).toBe(3);
    expect(calendarPriority("scheduled", "2026-10-17", "2026-10-15")).toBe(2);
    expect(calendarPriority("scheduled", "2026-10-30", "2026-10-15")).toBe(1);
    expect(calendarPriority("actual", "2026-10-01", "2026-10-15")).toBe(0);
  });
});

describe("card bills", () => {
  const names = new Map([["card", "HDFC Regalia"]]);
  it("maps open, overdue, paid and cancelled bills", () => {
    const events = cardBillEvents(
      [
        bill({}),
        bill({ id: "late", dueDate: "2026-10-05", status: "OVERDUE" }),
        bill({ id: "paid", dueDate: "2026-10-02", status: "PAID", remainingAmount: 0, amountPaid: 9000 }),
        bill({ id: "x", dueDate: "2026-10-03", status: "CANCELLED" }),
        bill({ id: "out", dueDate: "2026-11-18" }),
      ],
      names,
      ctx()
    );
    expect(events.map((e) => [e.refId, e.state, e.amount, e.actionable])).toEqual([
      ["b1", "scheduled", 9000, true],
      ["late", "overdue", 9000, true],
      ["paid", "completed", 9000, false],
      ["x", "cancelled", 9000, false],
    ]);
    expect(events[0]).toMatchObject({ title: "HDFC Regalia bill", direction: "out", href: "/credit-card-bills/b1", source: "card_bill" });
  });
});

describe("recurring items", () => {
  const sub = (over: Partial<Subscription>): Subscription => ({
    id: "s1",
    name: "Netflix",
    amount: 649,
    category: "Entertainment & Hobbies",
    dayOfMonth: 20,
    isActive: true,
    lastProcessed: "2026-09",
    type: "subscription",
    ...over,
  });

  it("shows future renewals only, never re-showing posted ones", () => {
    const events = subscriptionEvents([sub({}), sub({ id: "early", dayOfMonth: 3 })], ctx("2026-10-01", "2026-11-30"));
    expect(events.map((e) => `${e.refId}@${e.date}`)).toEqual(["s1@2026-10-20", "s1@2026-11-20", "early@2026-11-03"]);
    expect(events[0]).toMatchObject({ state: "scheduled", recurrenceId: "subscription:s1", href: "/ledger?tab=subscriptions" });
  });

  it("labels EMIs, stops them at their end month, and skips paused items and transfers", () => {
    const events = subscriptionEvents(
      [
        sub({ id: "emi", type: "emi", name: "Car loan", endYear: 2026, endMonth: 11 }),
        sub({ id: "paused", isActive: false }),
        sub({ id: "move", type: "transfer" }),
      ],
      ctx("2026-10-01", "2027-03-31")
    );
    expect(events.map((e) => [e.source, e.date])).toEqual([
      ["emi", "2026-10-20"],
      ["emi", "2026-11-20"],
    ]);
  });

  it("returns nothing for a range entirely in the past", () => {
    expect(subscriptionEvents([sub({})], ctx("2026-08-01", "2026-08-31"))).toEqual([]);
  });
});

describe("borrowings and receivables", () => {
  it("maps loan due dates with outstanding amounts", () => {
    const b = (over: Partial<Borrowing>) => ({ id: "l1", lenderName: "Ravi", dueDate: "2026-10-25", status: "ACTIVE", totalOutstanding: 50000, ...over }) as Borrowing;
    const events = borrowingEvents([b({}), b({ id: "l2", dueDate: "2026-10-01" }), b({ id: "l3", status: "FULLY_SETTLED" }), b({ id: "nodate", dueDate: null })], ctx());
    expect(events.map((e) => [e.refId, e.state, e.amount])).toEqual([
      ["l1", "scheduled", 50000],
      ["l2", "overdue", 50000],
      ["l3", "completed", null],
    ]);
    expect(events[0].href).toBe("/ledger?tab=borrowings&id=l1");
  });

  it("maps money owed to the user as expected inflows", () => {
    const r = (over: Partial<Receivable>) => ({ id: "r1", personName: "Asha", dueDate: "2026-10-20", status: "ACTIVE", outstandingAmount: 3000, ...over }) as Receivable;
    const events = receivableEvents([r({}), r({ id: "r2", status: "CANCELLED" }), r({ id: "r3", dueDate: "2026-10-02" })], ctx());
    expect(events.map((e) => [e.refId, e.state, e.direction, e.amount])).toEqual([
      ["r1", "expected", "in", 3000],
      ["r2", "cancelled", "in", null],
      ["r3", "overdue", "in", 3000],
    ]);
  });
});

describe("no invented money", () => {
  it("shows income only as recorded", () => {
    const inc = (over: Partial<Income>) => ({ id: "i1", amount: 80000, source: "Salary", note: "", date: "2026-10-01", month: "2026-10", createdAt: 1, ...over }) as Income;
    const events = incomeEvents([inc({}), inc({ id: "gone", deletedAt: "2026-10-02" })], ctx());
    expect(events).toEqual([expect.objectContaining({ state: "actual", direction: "in", amount: 80000, href: "/transactions/i1?kind=income" })]);
  });

  it("shows goals only with a deadline, as a neutral milestone with no amount", () => {
    const goals: FinancialGoal[] = [
      { id: "g1", name: "Trip", targetAmount: 100000, currentAmount: 40000, deadline: "2026-10-30" },
      { id: "g2", name: "No date", targetAmount: 1, currentAmount: 0 },
    ];
    const events = goalEvents(goals, ctx());
    expect(events).toEqual([expect.objectContaining({ refId: "g1", amount: null, direction: "neutral", state: "scheduled", subtitle: "60000 to go" })]);
  });

  it("shows EPF only where a date exists, as neutral", () => {
    const c = (over: Partial<EpfContribution>) => ({ id: "c1", establishmentId: "e1", month: "2026-09", epfCredit: 3600, status: "expected", expectedCreditTo: "2026-10-15", ...over }) as EpfContribution;
    const events = epfEvents([c({}), c({ id: "c2", status: "credited", creditDate: "2026-10-12" }), c({ id: "c3", expectedCreditTo: undefined }), c({ id: "c4", status: "draft" })], new Map([["e1", "Acme"]]), ctx());
    expect(events.map((e) => [e.refId, e.state, e.direction])).toEqual([
      ["c1", "expected", "neutral"],
      ["c2", "actual", "neutral"],
    ]);
    expect(events[0].title).toBe("EPF credit · Acme");
  });
});

describe("investments and SIP", () => {
  it("shows FD maturity as an expected inflow, never for closed deposits", () => {
    const fd = (over: Partial<Investment>) =>
      ({ id: "fd1", name: "SBI FD", kind: "fixed_deposit", principal: 100000, startDate: "2025-10-20", annualInterestRate: 0, maturityDate: "2026-10-20", status: "active", ...over }) as Investment;
    const events = investmentEvents([fd({}), fd({ id: "closed", status: "closed" })], ctx());
    expect(events).toEqual([expect.objectContaining({ refId: "fd1", state: "expected", direction: "in", amount: 100000 })]);
  });

  it("expands SIP runs by frequency and marks a skipped next run", () => {
    const plan = (over: Partial<SipPlan>) =>
      ({ id: "p1", assetName: "Nifty 50", investmentAmount: 5000, currency: "INR", frequency: "weekly", executionDay: 1, status: "active", nextExecutionDate: "2026-10-05", skipNextExecution: true, ...over }) as SipPlan;
    const weekly = sipEvents([plan({})], ctx());
    expect(weekly.map((e) => [e.date, e.state])).toEqual([
      ["2026-10-05", "cancelled"],
      ["2026-10-12", "overdue"],
      ["2026-10-19", "scheduled"],
      ["2026-10-26", "scheduled"],
    ]);
    const quarterly = sipEvents([plan({ frequency: "quarterly", executionDay: 31, nextExecutionDate: "2026-10-31", skipNextExecution: false })], ctx("2026-10-01", "2027-06-30"));
    expect(quarterly.map((e) => e.date)).toEqual(["2026-10-31", "2027-01-31", "2027-04-30"]);
    expect(sipEvents([plan({ status: "paused" })], ctx())).toEqual([]);
  });
});

describe("boundaries", () => {
  it("respects inclusive range edges across a leap February", () => {
    const events = cardBillEvents([bill({ dueDate: "2028-02-29" }), bill({ id: "b2", dueDate: "2028-03-01" })], new Map(), ctx("2028-02-01", "2028-02-29", "2028-02-01"));
    expect(events.map((e) => e.date)).toEqual(["2028-02-29"]);
  });
});
