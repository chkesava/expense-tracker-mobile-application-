import { describe, expect, it } from "vitest";

import type { EpfContribution, EpfContributionStatus } from "@/shared/features/epf/types";
import { summarizeContributions } from "@/shared/features/epf/utils/contributions";
import {
  deriveMonthState,
  dueDateFor,
  dueDateLabel,
  isAwaitingCredit,
  isCreditWindowPassed,
  summariseLifecycle,
} from "@/shared/features/epf/utils/monthState";

/** August 2026 wages: due 15 Sep, window closes 25 Sep. */
function contribution(overrides: Partial<EpfContribution> = {}): EpfContribution {
  return {
    id: "est-a_2026-08",
    establishmentId: "est-a",
    month: "2026-08",
    wage: 25000,
    employeeShare: 3000,
    employerShare: 3000,
    epsShare: 1250,
    employerEpfShare: 1750,
    totalContribution: 6000,
    epfCredit: 4750,
    status: "expected",
    source: "simulated",
    epsEligible: true,
    expectedCreditFrom: "2026-09-15",
    expectedCreditTo: "2026-09-25",
    ...overrides,
  };
}

describe("isCreditWindowPassed", () => {
  it("is false the day before the window closes", () => {
    expect(isCreditWindowPassed(contribution(), "2026-09-24")).toBe(false);
  });

  it("is false on the closing day itself — the window is inclusive", () => {
    expect(isCreditWindowPassed(contribution(), "2026-09-25")).toBe(false);
  });

  it("is true the day after", () => {
    expect(isCreditWindowPassed(contribution(), "2026-09-26")).toBe(true);
  });

  it("is false when no window was recorded", () => {
    expect(isCreditWindowPassed({ expectedCreditTo: undefined }, "2030-01-01")).toBe(false);
  });
});

describe("deriveMonthState", () => {
  it("reads a future wage month as projected, however late the clock is", () => {
    const row = contribution({ month: "2026-12", expectedCreditTo: "2027-01-25" });
    expect(deriveMonthState(row, "2026-09-14", "2026-09")).toBe("projected");
  });

  it("reads the in-progress month as awaiting, not credited — the reported bug", () => {
    // 14 Sep 2026, September wages: nothing is owed until 15 October.
    const september = contribution({
      month: "2026-09",
      expectedCreditFrom: "2026-10-15",
      expectedCreditTo: "2026-10-25",
    });
    expect(deriveMonthState(september, "2026-09-14", "2026-09")).toBe("awaiting");
  });

  it("is still awaiting on the statutory due date itself", () => {
    expect(deriveMonthState(contribution(), "2026-09-15", "2026-09")).toBe("awaiting");
  });

  it("is still awaiting the day after the due date — the window runs to the 25th", () => {
    expect(deriveMonthState(contribution(), "2026-09-16", "2026-09")).toBe("awaiting");
  });

  it("is still awaiting on the last day of the window", () => {
    expect(deriveMonthState(contribution(), "2026-09-25", "2026-09")).toBe("awaiting");
  });

  it("becomes overdue the day after the window closes", () => {
    expect(deriveMonthState(contribution(), "2026-09-26", "2026-09")).toBe("overdue");
  });

  it("never reads overdue without a recorded window", () => {
    // Pre-SPENDLY-1 rows have no window. Calling a contribution late on the
    // strength of a missing field would be a confident wrong answer; the
    // repair pass stamps the window and it starts ageing from there.
    const row = contribution({ expectedCreditFrom: undefined, expectedCreditTo: undefined });
    expect(deriveMonthState(row, "2030-01-01", "2030-01")).toBe("awaiting");
  });

  it("passes every other status through untouched", () => {
    const statuses: EpfContributionStatus[] = [
      "draft",
      "confirmed",
      "credited",
      "partial",
      "missed",
      "reversed",
    ];
    for (const status of statuses) {
      expect(deriveMonthState(contribution({ status }), "2030-01-01", "2030-01")).toBe(status);
    }
  });

  it("does not age a month the user already credited", () => {
    const row = contribution({ status: "credited", reconciledAt: "x" });
    expect(deriveMonthState(row, "2030-01-01", "2030-01")).toBe("credited");
  });
});

describe("isAwaitingCredit", () => {
  it("covers exactly the three readings of expected", () => {
    expect(isAwaitingCredit("projected")).toBe(true);
    expect(isAwaitingCredit("awaiting")).toBe(true);
    expect(isAwaitingCredit("overdue")).toBe(true);
    expect(isAwaitingCredit("credited")).toBe(false);
    expect(isAwaitingCredit("confirmed")).toBe(false);
    expect(isAwaitingCredit("draft")).toBe(false);
  });
});

describe("dueDateFor and dueDateLabel", () => {
  it("prefers the window the row was written with", () => {
    expect(dueDateFor(contribution())).toBe("2026-09-15");
  });

  it("recomputes from the wage month when the row has no window", () => {
    const row = contribution({ month: "2026-08", expectedCreditFrom: undefined });
    expect(dueDateFor(row)).toBe("2026-09-15");
  });

  it("renders a date unambiguously, day first", () => {
    expect(dueDateLabel("2026-10-15")).toBe("15 Oct 2026");
    expect(dueDateLabel("2027-01-05")).toBe("5 Jan 2027");
  });

  it("returns a malformed key unchanged rather than inventing a day", () => {
    expect(dueDateLabel("not-a-date")).toBe("not-a-date");
  });
});

describe("summariseLifecycle", () => {
  const today = "2026-09-26";
  const month = "2026-09";

  it("splits expected into projected, awaiting and overdue", () => {
    const summary = summariseLifecycle(
      [
        // Window closed yesterday, nothing recorded.
        contribution({ month: "2026-08", expectedCreditTo: "2026-09-25" }),
        // This month, due next month.
        contribution({ month: "2026-09", expectedCreditTo: "2026-10-25" }),
        // Has not happened yet.
        contribution({ month: "2026-10", expectedCreditTo: "2026-11-25" }),
      ],
      today,
      month
    );
    expect(summary.overdue).toBe(1);
    expect(summary.awaiting).toBe(1);
    expect(summary.projected).toBe(1);
  });

  it("counts a backfilled month's money — the ₹0 mismatch in SPENDLY-72", () => {
    // Current used to total `credited | partial` only, so a tab full of
    // backfilled months headlined ₹0 next to rows plainly holding money.
    const summary = summariseLifecycle(
      [contribution({ status: "confirmed", source: "manualHistorical" })],
      today,
      month
    );
    expect(summary.confirmed).toBe(1);
    expect(summary.creditedTotal).toBe(4750);
  });

  it("totals exactly what History and Balance total, over the same rows", () => {
    // The cross-screen reconciliation the ticket asks for, pinned as a test:
    // both sides must agree by construction, not by two lists kept in step.
    const rows = [
      contribution({ month: "2026-01", status: "confirmed", source: "manualHistorical" }),
      contribution({ month: "2026-02", status: "credited", creditedAmount: 4000, reconciledAt: "x" }),
      contribution({ month: "2026-03", status: "partial", creditedAmount: 2000, reconciledAt: "x" }),
      contribution({ month: "2026-04", status: "missed", creditedAmount: 0 }),
      contribution({ month: "2026-05", status: "draft" }),
      contribution({ month: "2026-08", expectedCreditTo: "2026-09-25" }),
    ];
    const summary = summariseLifecycle(rows, today, month);
    const history = summarizeContributions(
      rows.filter((row) =>
        ["credited", "partial", "confirmed"].includes(row.status)
      )
    );
    expect(summary.creditedTotal).toBe(history.epfCredit);
  });

  it("prefers the actual amount over the projection where known", () => {
    const summary = summariseLifecycle(
      [contribution({ status: "credited", creditedAmount: 1000, reconciledAt: "x" })],
      today,
      month
    );
    expect(summary.creditedTotal).toBe(1000);
  });

  it("keeps money still owed out of the credited total", () => {
    const summary = summariseLifecycle(
      [contribution({ month: "2026-08", expectedCreditTo: "2026-09-25" })],
      today,
      month
    );
    expect(summary.creditedTotal).toBe(0);
    expect(summary.awaitedTotal).toBe(4750);
  });

  it("counts unconfirmed credited months so reconciliation has a target", () => {
    const summary = summariseLifecycle(
      [
        contribution({ status: "credited" }),
        contribution({ status: "credited", reconciledAt: "x" }),
        contribution({ month: "2026-08" }),
      ],
      today,
      month
    );
    expect(summary.unreconciled).toBe(1);
  });

  it("excludes missed and reversed months from every total", () => {
    const summary = summariseLifecycle(
      [contribution({ status: "missed" }), contribution({ status: "reversed" })],
      today,
      month
    );
    expect(summary.creditedTotal).toBe(0);
    expect(summary.awaitedTotal).toBe(0);
  });

  it("does not count a draft as money, nor as money owed", () => {
    const summary = summariseLifecycle([contribution({ status: "draft" })], today, month);
    expect(summary.draft).toBe(1);
    expect(summary.creditedTotal).toBe(0);
    expect(summary.awaitedTotal).toBe(0);
  });

  it("returns zeroes for an empty list", () => {
    const summary = summariseLifecycle([], today, month);
    expect(summary.creditedTotal).toBe(0);
    expect(summary.awaitedTotal).toBe(0);
  });
});
