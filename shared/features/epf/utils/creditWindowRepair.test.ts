import { describe, expect, it } from "vitest";

import type { EpfContribution } from "@/shared/features/epf/types";
import {
  contributionsMissingCreditWindow,
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
