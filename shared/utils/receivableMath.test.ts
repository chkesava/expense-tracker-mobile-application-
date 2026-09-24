import { describe, expect, it } from "vitest";

import type { Receivable, ReceivableRepayment } from "../types/receivable";
import {
  receivablesInSpace,
  summarizeReceivable,
  summarizeReceivables,
  validateReceivableRepayment,
} from "./receivableMath";

function makeReceivable(overrides: Partial<Receivable> = {}): Receivable {
  return {
    id: "r1",
    userId: "u1",
    personType: "FRIEND",
    personName: "Rahul",
    originalAmount: 20000,
    lentDate: "2026-01-10",
    sourceAccountId: "acc-hdfc",
    status: "ACTIVE",
    ...overrides,
  };
}

function makeRepayment(
  overrides: Partial<ReceivableRepayment> = {}
): ReceivableRepayment {
  return {
    id: "p1",
    receivableId: "r1",
    amount: 5000,
    receivedAccountId: "acc-hdfc",
    date: "2026-02-10",
    ...overrides,
  };
}

describe("summarizeReceivable", () => {
  it("starts fully outstanding with no repayments", () => {
    const summary = summarizeReceivable(makeReceivable(), [], "2026-03-01");
    expect(summary.totalReceived).toBe(0);
    expect(summary.outstandingAmount).toBe(20000);
    expect(summary.status).toBe("ACTIVE");
    expect(summary.settledDate).toBeNull();
  });

  it("tracks partial repayments", () => {
    const summary = summarizeReceivable(
      makeReceivable(),
      [makeRepayment({ amount: 8000 }), makeRepayment({ id: "p2", amount: 2000, date: "2026-02-20" })],
      "2026-03-01"
    );
    expect(summary.totalReceived).toBe(10000);
    expect(summary.outstandingAmount).toBe(10000);
    expect(summary.status).toBe("PARTIALLY_SETTLED");
    expect(summary.repaymentCount).toBe(2);
  });

  it("settles fully and records the last repayment date", () => {
    const summary = summarizeReceivable(
      makeReceivable(),
      [
        makeRepayment({ amount: 12000, date: "2026-02-10" }),
        makeRepayment({ id: "p2", amount: 8000, date: "2026-03-10" }),
      ],
      "2026-03-15"
    );
    expect(summary.outstandingAmount).toBe(0);
    expect(summary.status).toBe("FULLY_SETTLED");
    expect(summary.settledDate).toBe("2026-03-10");
  });

  it("marks overdue when past due with outstanding balance", () => {
    const summary = summarizeReceivable(
      makeReceivable({ dueDate: "2026-02-01" }),
      [makeRepayment({ amount: 1000 })],
      "2026-03-01"
    );
    expect(summary.status).toBe("OVERDUE");
    expect(summary.isOverdue).toBe(true);
  });

  it("keeps CANCELLED even when money is still outstanding", () => {
    const summary = summarizeReceivable(
      makeReceivable({ status: "CANCELLED", dueDate: "2026-01-01" }),
      [],
      "2026-03-01"
    );
    expect(summary.status).toBe("CANCELLED");
  });

  it("ignores repayments after the as-of date", () => {
    const summary = summarizeReceivable(
      makeReceivable(),
      [makeRepayment({ amount: 5000, date: "2026-04-01" })],
      "2026-03-01"
    );
    expect(summary.totalReceived).toBe(0);
    expect(summary.outstandingAmount).toBe(20000);
  });
});

describe("validateReceivableRepayment", () => {
  it("rejects non-positive amounts", () => {
    expect(
      validateReceivableRepayment(0, { outstandingAmount: 1000 }).ok
    ).toBe(false);
  });

  it("rejects overpayment by default", () => {
    const result = validateReceivableRepayment(1001, {
      outstandingAmount: 1000,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/exceeds/);
  });

  it("allows overpayment when opted in", () => {
    expect(
      validateReceivableRepayment(
        1001,
        { outstandingAmount: 1000 },
        { allowOverpayment: true }
      ).ok
    ).toBe(true);
  });

  it("rejects repayments on a settled receivable", () => {
    expect(
      validateReceivableRepayment(100, { outstandingAmount: 0 }).ok
    ).toBe(false);
  });
});

describe("summarizeReceivables", () => {
  it("rolls up portfolio totals", () => {
    const receivables = [
      makeReceivable({ id: "a", originalAmount: 20000 }),
      makeReceivable({
        id: "b",
        personName: "Anjali",
        originalAmount: 5000,
        dueDate: "2026-01-01",
      }),
    ];
    const repayments = [
      makeRepayment({ receivableId: "a", amount: 5000 }),
      makeRepayment({ id: "p2", receivableId: "b", amount: 5000, date: "2026-02-01" }),
    ];
    const portfolio = summarizeReceivables(receivables, repayments, "2026-03-01");
    expect(portfolio.totalLent).toBe(25000);
    expect(portfolio.totalReceived).toBe(10000);
    expect(portfolio.totalOutstanding).toBe(15000);
    expect(portfolio.settledCount).toBe(1);
    expect(portfolio.activeCount).toBe(1);
  });

  it("excludes cancelled outstanding from portfolio outstanding", () => {
    const portfolio = summarizeReceivables(
      [makeReceivable({ status: "CANCELLED", originalAmount: 9000 })],
      [],
      "2026-03-01"
    );
    expect(portfolio.totalOutstanding).toBe(0);
    expect(portfolio.cancelledCount).toBe(1);
  });
});

describe("receivablesInSpace", () => {
  it("filters by spaceId", () => {
    const rows = [
      makeReceivable({ id: "a", spaceId: "space-1" }),
      makeReceivable({ id: "b", spaceId: "space-2" }),
      makeReceivable({ id: "c" }),
    ];
    expect(receivablesInSpace(rows, "space-1").map((r) => r.id)).toEqual(["a"]);
    expect(receivablesInSpace(rows, "")).toEqual([]);
  });
});

describe("summarizeReceivables — overdue and due-this-month amounts", () => {
  const ASOF = "2026-03-15";

  it("is zero for an empty portfolio", () => {
    const totals = summarizeReceivables([], [], ASOF);
    expect(totals.overdueAmount).toBe(0);
    expect(totals.dueThisMonthAmount).toBe(0);
  });

  it("sums outstanding on receivables past their due date", () => {
    const totals = summarizeReceivables(
      [makeReceivable({ id: "r1", dueDate: "2026-03-01", originalAmount: 5000 })],
      [],
      ASOF
    );
    expect(totals.overdueCount).toBe(1);
    expect(totals.overdueAmount).toBe(5000);
  });

  it("counts a due date later this month as due-this-month, not overdue", () => {
    const totals = summarizeReceivables(
      [makeReceivable({ id: "r1", dueDate: "2026-03-28", originalAmount: 8000 })],
      [],
      ASOF
    );
    expect(totals.overdueAmount).toBe(0);
    expect(totals.dueThisMonthAmount).toBe(8000);
  });

  it("never counts the same money in both buckets", () => {
    const totals = summarizeReceivables(
      [
        makeReceivable({ id: "r1", dueDate: "2026-03-01", originalAmount: 5000 }),
        makeReceivable({ id: "r2", dueDate: "2026-03-28", originalAmount: 8000 }),
      ],
      [],
      ASOF
    );
    expect(totals.overdueAmount).toBe(5000);
    expect(totals.dueThisMonthAmount).toBe(8000);
  });

  it("ignores receivables due in another month", () => {
    const totals = summarizeReceivables(
      [makeReceivable({ id: "r1", dueDate: "2026-04-10", originalAmount: 9000 })],
      [],
      ASOF
    );
    expect(totals.overdueAmount).toBe(0);
    expect(totals.dueThisMonthAmount).toBe(0);
  });

  it("ignores receivables with no due date", () => {
    const totals = summarizeReceivables(
      [makeReceivable({ id: "r1", dueDate: null, originalAmount: 7000 })],
      [],
      ASOF
    );
    expect(totals.dueThisMonthAmount).toBe(0);
    expect(totals.overdueAmount).toBe(0);
  });

  it("counts only what is still owed, not the original amount", () => {
    const totals = summarizeReceivables(
      [makeReceivable({ id: "r1", dueDate: "2026-03-28", originalAmount: 10000 })],
      [makeRepayment({ id: "p1", receivableId: "r1", amount: 4000 })],
      ASOF
    );
    expect(totals.dueThisMonthAmount).toBe(6000);
  });

  it("drops a receivable out of both buckets once it is settled", () => {
    const totals = summarizeReceivables(
      [makeReceivable({ id: "r1", dueDate: "2026-03-01", originalAmount: 10000 })],
      [makeRepayment({ id: "p1", receivableId: "r1", amount: 10000 })],
      ASOF
    );
    expect(totals.overdueAmount).toBe(0);
    expect(totals.dueThisMonthAmount).toBe(0);
  });

  it("excludes cancelled receivables from due-this-month", () => {
    const totals = summarizeReceivables(
      [
        makeReceivable({
          id: "r1",
          dueDate: "2026-03-28",
          originalAmount: 10000,
          status: "CANCELLED",
        }),
      ],
      [],
      ASOF
    );
    expect(totals.dueThisMonthAmount).toBe(0);
  });
});
