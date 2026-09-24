import { describe, expect, it } from "vitest";

import type { Receivable, ReceivableRepayment } from "../types/receivable";
import {
  allocateReceivableRepayment,
  buildReceivableUpdatePayload,
  describeInterest,
  receivablesInSpace,
  roundMoney,
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

describe("SPENDLY-160 — interest on money lent", () => {
  /** 20000 lent on 2026-01-10 at 1% monthly on the outstanding principal. */
  function lentWithInterest(overrides: Partial<Receivable> = {}): Receivable {
    return makeReceivable({
      interestRate: 1,
      interestType: "SIMPLE",
      interestFrequency: "MONTHLY",
      interestBasis: "OUTSTANDING_PRINCIPAL",
      ...overrides,
    });
  }

  describe("documents written before interest existed", () => {
    it("reads as interest-free, not as broken", () => {
      const summary = summarizeReceivable(makeReceivable(), [], "2026-06-10");

      expect(summary.interestAccrued).toBe(0);
      expect(summary.outstandingInterest).toBe(0);
      expect(summary.outstandingAmount).toBe(20000);
      expect(summary.outstandingAmount).toBe(summary.outstandingPrincipal);
    });

    it("treats a repayment with no split as pure principal", () => {
      const summary = summarizeReceivable(
        makeReceivable(),
        [makeRepayment({ amount: 5000, date: "2026-02-10" })],
        "2026-06-10"
      );

      expect(summary.principalReceived).toBe(5000);
      expect(summary.interestReceived).toBe(0);
      expect(summary.totalReceived).toBe(5000);
    });
  });

  describe("accrual", () => {
    it("charges the configured rate on what is still owed", () => {
      const summary = summarizeReceivable(lentWithInterest(), [], "2026-03-10");

      // 20000 at 1% for two months.
      expect(summary.interestAccrued).toBe(400);
      expect(summary.outstandingInterest).toBe(400);
      expect(summary.outstandingAmount).toBe(20400);
    });

    it("keeps outstandingAmount the sum of its two parts", () => {
      const summary = summarizeReceivable(
        lentWithInterest(),
        [makeRepayment({ amount: 5000, date: "2026-02-10" })],
        "2026-05-10"
      );

      expect(summary.outstandingAmount).toBe(
        roundMoney(summary.outstandingPrincipal + summary.outstandingInterest)
      );
    });

    it("ignores the rate entirely when the type is NONE", () => {
      const summary = summarizeReceivable(
        lentWithInterest({ interestType: "NONE" }),
        [],
        "2027-01-10"
      );

      expect(summary.interestAccrued).toBe(0);
    });
  });

  describe("repayments that carry interest", () => {
    it("separates principal from interest received", () => {
      const summary = summarizeReceivable(
        lentWithInterest(),
        [
          makeRepayment({
            amount: 5200,
            principalComponent: 5000,
            interestComponent: 200,
            date: "2026-02-10",
          }),
        ],
        "2026-02-10"
      );

      expect(summary.totalReceived).toBe(5200);
      expect(summary.principalReceived).toBe(5000);
      expect(summary.interestReceived).toBe(200);
      expect(summary.outstandingPrincipal).toBe(15000);
      expect(summary.outstandingInterest).toBe(0);
    });

    it("allocates a repayment to interest before principal", () => {
      const summary = summarizeReceivable(lentWithInterest(), [], "2026-03-10");
      const allocation = allocateReceivableRepayment(1000, summary);

      expect(allocation.interestComponent).toBe(400);
      expect(allocation.principalComponent).toBe(600);
      expect(allocation.overpayment).toBe(0);
    });
  });

  describe("settlement", () => {
    it("stays open while only interest is owed", () => {
      const summary = summarizeReceivable(
        lentWithInterest(),
        [makeRepayment({ amount: 20000, date: "2026-02-10" })],
        "2026-03-10"
      );

      expect(summary.outstandingPrincipal).toBe(0);
      expect(summary.outstandingInterest).toBeGreaterThan(0);
      expect(summary.status).not.toBe("FULLY_SETTLED");
    });

    it("stays overdue while only interest is owed", () => {
      const summary = summarizeReceivable(
        lentWithInterest({ dueDate: "2026-02-15" }),
        [makeRepayment({ amount: 20000, date: "2026-02-10" })],
        "2026-03-10"
      );

      expect(summary.isOverdue).toBe(true);
      expect(summary.status).toBe("OVERDUE");
    });

    it("settles once waived interest covers the remainder", () => {
      const repayments = [makeRepayment({ amount: 20000, date: "2026-02-10" })];
      const open = summarizeReceivable(
        lentWithInterest(),
        repayments,
        "2026-03-10"
      );

      const waived = summarizeReceivable(
        lentWithInterest({
          waivedInterest: open.outstandingInterest,
          interestStoppedDate: "2026-03-10",
        }),
        repayments,
        "2026-03-10"
      );

      expect(waived.outstandingInterest).toBe(0);
      expect(waived.status).toBe("FULLY_SETTLED");
    });

    it("does not count waived interest as money received", () => {
      const repayments = [makeRepayment({ amount: 20000, date: "2026-02-10" })];
      const waived = summarizeReceivable(
        lentWithInterest({
          waivedInterest: 200,
          interestStoppedDate: "2026-03-10",
        }),
        repayments,
        "2026-03-10"
      );

      expect(waived.totalReceived).toBe(20000);
      expect(waived.interestReceived).toBe(0);
      expect(waived.interestWaived).toBe(200);
    });

    it("stops accruing once interest is stopped, however long ago", () => {
      const stopped = lentWithInterest({ interestStoppedDate: "2026-03-10" });

      expect(
        summarizeReceivable(stopped, [], "2026-03-10").interestAccrued
      ).toBe(400);
      expect(
        summarizeReceivable(stopped, [], "2028-03-10").interestAccrued
      ).toBe(400);
    });
  });

  describe("cancellation", () => {
    it("freezes interest at the write-off date", () => {
      const cancelled = lentWithInterest({
        status: "CANCELLED",
        interestStoppedDate: "2026-04-10",
      });

      expect(
        summarizeReceivable(cancelled, [], "2027-01-10").interestAccrued
      ).toBe(600);
    });

    it("accrues nothing for a receivable cancelled before interest existed", () => {
      // No terms and no stop date: the legacy shape, and correctly zero.
      const legacy = makeReceivable({ status: "CANCELLED" });

      expect(summarizeReceivable(legacy, [], "2027-01-10").interestAccrued).toBe(
        0
      );
    });
  });

  describe("buildReceivableUpdatePayload", () => {
    it("measures the floor against principal, not total received", () => {
      // 5200 received, but only 5000 of it was principal. An edit to 6000 is
      // legitimate and must not be refused by the interest portion.
      const repayments = [
        makeRepayment({
          amount: 5200,
          principalComponent: 5000,
          interestComponent: 200,
          date: "2026-02-10",
        }),
      ];
      const result = buildReceivableUpdatePayload(
        lentWithInterest(),
        { originalAmount: 6000 },
        repayments,
        "2026-03-10"
      );

      expect(result.ok).toBe(true);
    });

    it("still refuses to drop below principal already received", () => {
      const repayments = [
        makeRepayment({
          amount: 5000,
          principalComponent: 5000,
          date: "2026-02-10",
        }),
      ];
      const result = buildReceivableUpdatePayload(
        lentWithInterest(),
        { originalAmount: 4000 },
        repayments,
        "2026-03-10"
      );

      expect(result.ok).toBe(false);
    });

    it("restamps the cache on a status-only write", () => {
      // The drift this fixes: cancelling used to write status while leaving a
      // stale outstandingAmount behind it.
      const result = buildReceivableUpdatePayload(
        lentWithInterest(),
        { status: "CANCELLED", interestStoppedDate: "2026-03-10" },
        [],
        "2026-03-10"
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.recomputed).toBe(true);
      expect(result.fields.status).toBe("CANCELLED");
      expect(result.fields.accruedInterest).toBe(400);
    });

    it("leaves the cache alone for an edit that cannot change it", () => {
      const result = buildReceivableUpdatePayload(
        lentWithInterest(),
        { note: "reminder sent" },
        [],
        "2026-03-10"
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.recomputed).toBe(false);
      expect(result.fields).toEqual({ note: "reminder sent" });
    });

    it("refreshes accrued interest when the rate changes", () => {
      const result = buildReceivableUpdatePayload(
        lentWithInterest(),
        { interestRate: 2 },
        [],
        "2026-03-10"
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.fields.accruedInterest).toBe(800);
    });
  });

  describe("portfolio totals", () => {
    it("counts outstanding interest as money still owed", () => {
      const portfolio = summarizeReceivables(
        [lentWithInterest()],
        [],
        "2026-03-10"
      );

      expect(portfolio.totalOutstanding).toBe(20400);
    });

    it("counts interest in the overdue bucket", () => {
      const portfolio = summarizeReceivables(
        [lentWithInterest({ dueDate: "2026-02-01" })],
        [],
        "2026-03-10"
      );

      expect(portfolio.overdueAmount).toBe(20400);
    });

    it("keeps cancelled interest out of what is outstanding", () => {
      const portfolio = summarizeReceivables(
        [
          lentWithInterest({
            status: "CANCELLED",
            interestStoppedDate: "2026-03-10",
          }),
        ],
        [],
        "2026-03-10"
      );

      expect(portfolio.totalOutstanding).toBe(0);
      expect(portfolio.totalLent).toBe(20000);
    });
  });

  describe("describeInterest", () => {
    it("labels a configured rate", () => {
      expect(describeInterest(lentWithInterest())).toBe("1% monthly interest");
    });

    it("labels a receivable with no terms at all", () => {
      expect(describeInterest(makeReceivable())).toBe("No interest");
    });
  });
});
