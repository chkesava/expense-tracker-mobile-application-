import { describe, expect, it } from "vitest";

import type { EpfContribution } from "@/shared/features/epf/types";
import {
  contributionsMissingCreditWindow,
  contributionsNeedingLifecycleRepair,
  contributionsWithFabricatedCredit,
  creditWindowRepairFor,
} from "@/shared/features/epf/utils/creditWindowRepair";
import { expectedCreditWindow } from "@/shared/features/epf/utils/schedule";

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
    ...overrides,
  };
}

describe("contributionsMissingCreditWindow", () => {
  it("selects expected rows with no credit window", () => {
    const rows = [contribution()];
    expect(contributionsMissingCreditWindow(rows)).toHaveLength(1);
  });

  it("ignores expected rows that already have one", () => {
    const rows = [contribution({ expectedCreditTo: "2026-09-25" })];
    expect(contributionsMissingCreditWindow(rows)).toEqual([]);
  });

  it("never selects a status other than expected", () => {
    // A confirmed historical month acquiring a window would put user-asserted
    // history one status change away from the auto-credit queue.
    for (const status of [
      "draft",
      "confirmed",
      "credited",
      "partial",
      "missed",
      "reversed",
    ] as const) {
      expect(contributionsMissingCreditWindow([contribution({ status })])).toEqual([]);
    }
  });

  it("selects a half-written row that has only expectedCreditFrom", () => {
    // isCreditWindowPassed reads `To`, so `From` alone is still broken.
    const rows = [contribution({ expectedCreditFrom: "2026-09-15" })];
    expect(contributionsMissingCreditWindow(rows)).toHaveLength(1);
  });

  it("is idempotent — repaired rows are not selected again", () => {
    const rows = [contribution(), contribution({ month: "2026-07" })];
    const repaired = contributionsMissingCreditWindow(rows).map((row) => ({
      ...row,
      ...creditWindowRepairFor(row),
    }));

    expect(contributionsMissingCreditWindow(repaired)).toEqual([]);
  });
});

describe("creditWindowRepairFor", () => {
  it("reproduces expectedCreditWindow exactly", () => {
    const window = expectedCreditWindow("2026-08");
    expect(creditWindowRepairFor(contribution())).toEqual({
      expectedCreditFrom: window.from,
      expectedCreditTo: window.to,
    });
  });

  it("lands the window in the month after the wage month", () => {
    const repair = creditWindowRepairFor(contribution({ month: "2026-08" }));
    expect(repair.expectedCreditFrom.startsWith("2026-09")).toBe(true);
    expect(repair.expectedCreditTo.startsWith("2026-09")).toBe(true);
  });

  it("clamps into a short month rather than producing an impossible date", () => {
    // January wages credit in February; a dayTo of 25 is safe, but the clamp
    // must not be able to emit the 30th or 31st.
    const repair = creditWindowRepairFor(contribution({ month: "2026-01" }));
    const day = Number(repair.expectedCreditTo.slice(8, 10));
    expect(day).toBeLessThanOrEqual(28);
  });

  it("rolls the year over in December", () => {
    const repair = creditWindowRepairFor(contribution({ month: "2026-12" }));
    expect(repair.expectedCreditFrom.startsWith("2027-01")).toBe(true);
  });
});

describe("contributionsWithFabricatedCredit", () => {
  /** What the pre-SPENDLY-72 scheduler wrote: credited, but nobody looked. */
  const autoCredited = () =>
    contribution({ status: "credited", source: "simulated", expectedCreditTo: "2026-09-25" });

  it("selects a scheduler-invented credit", () => {
    expect(contributionsWithFabricatedCredit([autoCredited()])).toHaveLength(1);
  });

  it("never touches a credit the user recorded", () => {
    // `applyActualCredit` always stamps both, so this is the whole guarantee
    // that the withdrawal cannot eat someone's own figures.
    const rows = [
      contribution({ status: "credited", reconciledAt: "2026-09-26T00:00:00.000Z" }),
      contribution({ status: "credited", creditedAmount: 4750, source: "manualCurrent" }),
    ];
    expect(contributionsWithFabricatedCredit(rows)).toEqual([]);
  });

  it("never touches a backfilled or hand-entered month", () => {
    const rows = [
      contribution({ status: "confirmed", source: "manualHistorical" }),
      contribution({ status: "credited", source: "manualHistorical" }),
      contribution({ status: "credited", source: "imported" }),
    ];
    expect(contributionsWithFabricatedCredit(rows)).toEqual([]);
  });

  it("leaves partial, missed and reversed alone", () => {
    const rows = [
      contribution({ status: "partial", source: "simulated" }),
      contribution({ status: "missed", source: "simulated", creditedAmount: 0 }),
      contribution({ status: "reversed", source: "simulated" }),
    ];
    expect(contributionsWithFabricatedCredit(rows)).toEqual([]);
  });

  it("never selects a user-reconciled reversed or re-credited month — SPENDLY-77", () => {
    const reversed = contribution({
      status: "reversed",
      source: "simulated",
      reconciledAt: "2026-09-26T00:00:00.000Z",
      creditedAmount: 4750,
      statusReason: "Reversed by EPFO",
    });
    const reccredited = contribution({
      status: "credited",
      source: "simulated",
      reconciledAt: "2026-10-02T00:00:00.000Z",
      creditedAmount: 4750,
      creditDate: "2026-10-01",
    });
    expect(contributionsWithFabricatedCredit([reversed, reccredited])).toEqual([]);
    expect(contributionsNeedingLifecycleRepair([reversed, reccredited], "2026-09")).toEqual([]);
  });

  it("is idempotent — a withdrawn row is not selected again", () => {
    const first = contributionsWithFabricatedCredit([autoCredited()]);
    expect(first).toHaveLength(1);
    const withdrawn = first.map((row) => ({ ...row, status: "expected" as const }));
    expect(contributionsWithFabricatedCredit(withdrawn)).toEqual([]);
  });
});

describe("contributionsNeedingLifecycleRepair", () => {
  it("frees a draft stranded in the in-progress month", () => {
    // `ALLOWED.draft` is empty, so Current could neither credit nor age these.
    const rows = [contribution({ month: "2026-09", status: "draft" })];
    expect(contributionsNeedingLifecycleRepair(rows, "2026-09")).toHaveLength(1);
  });

  it("frees a draft in a future month too", () => {
    const rows = [contribution({ month: "2026-12", status: "draft" })];
    expect(contributionsNeedingLifecycleRepair(rows, "2026-09")).toHaveLength(1);
  });

  it("leaves a past-month draft alone — that is real backfill in progress", () => {
    const rows = [contribution({ month: "2026-08", status: "draft" })];
    expect(contributionsNeedingLifecycleRepair(rows, "2026-09")).toEqual([]);
  });

  it("leaves a confirmed current month alone — the user typed that", () => {
    // It is already balance-bearing, and `confirmed -> credited` now gives it
    // a way to take the real credit instead.
    const rows = [contribution({ month: "2026-09", status: "confirmed" })];
    expect(contributionsNeedingLifecycleRepair(rows, "2026-09")).toEqual([]);
  });

  it("leaves rows the scheduler already owns alone", () => {
    const rows = [
      contribution({ month: "2026-09", status: "expected" }),
      contribution({ month: "2026-09", status: "credited" }),
    ];
    expect(contributionsNeedingLifecycleRepair(rows, "2026-09")).toEqual([]);
  });

  it("is idempotent — a freed row is not selected again", () => {
    const rows = [contribution({ month: "2026-09", status: "draft" })];
    const freed = contributionsNeedingLifecycleRepair(rows, "2026-09").map((row) => ({
      ...row,
      status: "expected" as const,
      ...creditWindowRepairFor(row),
    }));
    expect(contributionsNeedingLifecycleRepair(freed, "2026-09")).toEqual([]);
    // And the window it was given is the one the scheduler would have written.
    expect(freed[0].expectedCreditTo).toBe(expectedCreditWindow("2026-09").to);
  });
});
