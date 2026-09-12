import { describe, expect, it } from "vitest";

import type {
  EpfContribution,
  EpfEstablishment,
  EpfInterestEntry,
  EpfReconciliation,
  EpfTransfer,
} from "@/shared/features/epf/types";
import { epfPortfolioSummary } from "@/shared/features/epf/utils/portfolio";
import { establishmentBalance } from "@/shared/features/epf/utils/transfers";

function establishment(id: string, overrides: Partial<EpfEstablishment> = {}): EpfEstablishment {
  return {
    id,
    profileId: "main",
    employerName: `Employer ${id}`,
    establishmentNumber: "MHBAN0012345000",
    memberId: "MHBAN00123450000012345",
    dateJoined: "2020-01-01",
    employmentStatus: "current",
    ...overrides,
  };
}

/** epfCredit 4750 = employee 3000 + employerEpf 1750; eps 1250 is pension. */
function contribution(
  establishmentId: string,
  month: string,
  overrides: Partial<EpfContribution> = {}
): EpfContribution {
  return {
    id: `${establishmentId}_${month}`,
    establishmentId,
    month,
    wage: 25000,
    employeeShare: 3000,
    employerShare: 3000,
    epsShare: 1250,
    employerEpfShare: 1750,
    totalContribution: 6000,
    epfCredit: 4750,
    status: "credited",
    source: "simulated",
    epsEligible: true,
    ...overrides,
  };
}

function interestEntry(establishmentId: string, interest: number): EpfInterestEntry {
  return {
    id: `${establishmentId}_2023-24`,
    establishmentId,
    financialYear: "2023-24",
    rate: 0.0825,
    basis: "monthlyRunningBalance",
    openingBalance: 0,
    interest,
    closingBalance: interest,
  };
}

function reconciliation(
  establishmentId: string,
  overrides: Partial<EpfReconciliation> = {}
): EpfReconciliation {
  return {
    id: "r1",
    establishmentId,
    date: "2026-09-12",
    actualBalance: 0,
    calculatedBalance: 0,
    adjustmentAmount: 0,
    ...overrides,
  };
}

describe("epfPortfolioSummary", () => {
  it("returns zeroes for an empty portfolio rather than NaN", () => {
    const summary = epfPortfolioSummary({
      establishments: [],
      contributions: [],
      transfers: [],
      interestEntries: [],
      adjustments: [],
    });
    expect(summary.total).toBe(0);
    expect(summary.establishmentCount).toBe(0);
    expect(summary.simulated).toBe(false);
    expect(summary.lastReconciledAt).toBeNull();
  });

  it("matches establishmentBalance exactly for a single establishment", () => {
    const args = {
      establishments: [establishment("est-a")],
      contributions: [contribution("est-a", "2023-04")],
      transfers: [] as EpfTransfer[],
      interestEntries: [interestEntry("est-a", 825)],
      adjustments: [] as EpfReconciliation[],
    };

    const summary = epfPortfolioSummary(args);
    const single = establishmentBalance({
      contributions: args.contributions,
      transfers: args.transfers,
      establishmentId: "est-a",
      interestEntries: args.interestEntries,
      adjustments: args.adjustments,
    });

    expect(summary.total).toBe(single);
    expect(summary.total).toBe(5575); // 4750 + 825
  });

  it("sums across several employers", () => {
    const summary = epfPortfolioSummary({
      establishments: [establishment("est-a"), establishment("est-b")],
      contributions: [contribution("est-a", "2023-04"), contribution("est-b", "2024-04")],
      transfers: [],
      interestEntries: [],
      adjustments: [],
    });
    expect(summary.total).toBe(9500);
    expect(summary.establishmentCount).toBe(2);
  });

  it("includes archived employers — archiving hides, it does not delete money", () => {
    const summary = epfPortfolioSummary({
      establishments: [establishment("est-a", { archived: true })],
      contributions: [contribution("est-a", "2023-04")],
      transfers: [],
      interestEntries: [],
      adjustments: [],
    });
    expect(summary.total).toBe(4750);
  });

  it("nets an internal transfer to zero across the portfolio", () => {
    // Money moving between the user's own employers changes nothing overall.
    const transfers: EpfTransfer[] = [
      {
        id: "t1",
        sourceEstablishmentId: "est-a",
        destinationEstablishmentId: "est-b",
        amount: 2000,
        date: "2024-05-01",
        status: "completed",
      },
    ];
    const summary = epfPortfolioSummary({
      establishments: [establishment("est-a"), establishment("est-b")],
      contributions: [contribution("est-a", "2023-04")],
      transfers,
      interestEntries: [],
      adjustments: [],
    });
    expect(summary.total).toBe(4750);
    expect(summary.netTransfers).toBe(0);
  });

  it("reports pension separately and keeps it out of the total", () => {
    const summary = epfPortfolioSummary({
      establishments: [establishment("est-a")],
      contributions: [contribution("est-a", "2023-04")],
      transfers: [],
      interestEntries: [],
      adjustments: [],
    });

    expect(summary.epsShare).toBe(1250);
    expect(summary.total).toBe(4750);
    // The balance parts add to the total without EPS anywhere in them.
    expect(summary.employeeShare + summary.employerEpfShare).toBe(summary.total);
  });

  it("splits contributions into the member's and the employer's shares", () => {
    const summary = epfPortfolioSummary({
      establishments: [establishment("est-a")],
      contributions: [contribution("est-a", "2023-04"), contribution("est-a", "2023-05")],
      transfers: [],
      interestEntries: [],
      adjustments: [],
    });
    expect(summary.employeeShare).toBe(6000);
    expect(summary.employerEpfShare).toBe(3500);
  });

  it("scales the split when a reconciled month differs from the projection", () => {
    // Half the projected amount actually landed, so both shares halve and the
    // parts still sum to what is really there.
    const summary = epfPortfolioSummary({
      establishments: [establishment("est-a")],
      contributions: [
        contribution("est-a", "2023-04", {
          status: "partial",
          creditedAmount: 2375,
          reconciledAt: "2026-09-12",
        }),
      ],
      transfers: [],
      interestEntries: [],
      adjustments: [],
    });
    expect(summary.total).toBe(2375);
    expect(summary.employeeShare).toBe(1500);
    expect(summary.employerEpfShare).toBe(875);
    expect(summary.employeeShare + summary.employerEpfShare).toBe(summary.total);
  });

  it("ignores months that never added money", () => {
    const summary = epfPortfolioSummary({
      establishments: [establishment("est-a")],
      contributions: [
        contribution("est-a", "2023-04", { status: "expected" }),
        contribution("est-a", "2023-05", { status: "missed" }),
        contribution("est-a", "2023-06", { status: "reversed" }),
      ],
      transfers: [],
      interestEntries: [],
      adjustments: [],
    });
    expect(summary.total).toBe(0);
    expect(summary.employeeShare).toBe(0);
  });

  it("counts unconfirmed months and flags the total as simulated", () => {
    const summary = epfPortfolioSummary({
      establishments: [establishment("est-a")],
      contributions: [
        contribution("est-a", "2023-04"),
        contribution("est-a", "2023-05", { reconciledAt: "2026-09-12" }),
      ],
      transfers: [],
      interestEntries: [],
      adjustments: [],
    });
    expect(summary.unreconciledCount).toBe(1);
    expect(summary.simulated).toBe(true);
  });

  it("stops flagging as simulated once every month is confirmed", () => {
    const summary = epfPortfolioSummary({
      establishments: [establishment("est-a")],
      contributions: [contribution("est-a", "2023-04", { reconciledAt: "2026-09-12" })],
      transfers: [],
      interestEntries: [],
      adjustments: [],
    });
    expect(summary.unreconciledCount).toBe(0);
    expect(summary.simulated).toBe(false);
  });

  it("reports the most recent reconciliation date", () => {
    const summary = epfPortfolioSummary({
      establishments: [establishment("est-a")],
      contributions: [],
      transfers: [],
      interestEntries: [],
      adjustments: [
        reconciliation("est-a", { id: "old", date: "2026-03-01" }),
        reconciliation("est-a", { id: "new", date: "2026-09-12" }),
      ],
    });
    expect(summary.lastReconciledAt).toBe("2026-09-12");
  });

  it("carries interest and adjustments into the total", () => {
    const summary = epfPortfolioSummary({
      establishments: [establishment("est-a")],
      contributions: [contribution("est-a", "2023-04")],
      transfers: [],
      interestEntries: [interestEntry("est-a", 825)],
      adjustments: [reconciliation("est-a", { adjustmentAmount: 1000 })],
    });
    expect(summary.interest).toBe(825);
    expect(summary.adjustments).toBe(1000);
    expect(summary.total).toBe(6575); // 4750 + 825 + 1000
  });
});
