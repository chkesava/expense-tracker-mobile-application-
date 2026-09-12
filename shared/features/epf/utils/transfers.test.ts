import { describe, expect, it } from "vitest";

import type { EpfContribution, EpfTransfer } from "@/shared/features/epf/types";
import {
  buildReversal,
  establishmentBalanceBreakdown,
  canCompleteTransfer,
  canFailTransfer,
  canReverseTransfer,
  establishmentBalance,
  isTransferReconciled,
  normalizeTransfer,
  summariseTransfers,
  transferDisplayState,
  transferHasErrors,
  transferStatusMeta,
  transferableBalance,
  transfersForEstablishment,
  validateTransfer,
} from "@/shared/features/epf/utils/transfers";

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
    status: "credited",
    source: "simulated",
    epsEligible: true,
    ...overrides,
  };
}

function transfer(overrides: Partial<EpfTransfer> = {}): EpfTransfer {
  return {
    id: "t1",
    sourceEstablishmentId: "est-a",
    destinationEstablishmentId: "est-b",
    amount: 10000,
    date: "2026-09-01",
    status: "completed",
    ...overrides,
  };
}

describe("establishmentBalance", () => {
  it("sums credited contributions when there are no transfers", () => {
    const balance = establishmentBalance({
      contributions: [contribution(), contribution({ id: "x", month: "2026-09" })],
      transfers: [],
      establishmentId: "est-a",
    interestEntries: [],
    adjustments: [],
    });
    expect(balance).toBe(9500);
  });

  it("prefers the actual credited amount over the projection", () => {
    const balance = establishmentBalance({
      contributions: [contribution({ creditedAmount: 1000, reconciledAt: "x" })],
      transfers: [],
      establishmentId: "est-a",
    interestEntries: [],
    adjustments: [],
    });
    expect(balance).toBe(1000);
  });

  it("ignores months that never added money", () => {
    const balance = establishmentBalance({
      contributions: [
        contribution({ status: "expected" }),
        contribution({ id: "b", month: "2026-09", status: "missed" }),
        contribution({ id: "c", month: "2026-10", status: "reversed" }),
        contribution({ id: "d", month: "2026-11", status: "draft" }),
      ],
      transfers: [],
      establishmentId: "est-a",
    interestEntries: [],
    adjustments: [],
    });
    expect(balance).toBe(0);
  });

  it("ignores another establishment's contributions", () => {
    const balance = establishmentBalance({
      contributions: [contribution({ establishmentId: "est-b" })],
      transfers: [],
      establishmentId: "est-a",
    interestEntries: [],
    adjustments: [],
    });
    expect(balance).toBe(0);
  });

  it("subtracts a completed transfer out and adds one in", () => {
    const contributions = [contribution()];
    const transfers = [transfer()];

    expect(
      establishmentBalance({ contributions, transfers, establishmentId: "est-a", interestEntries: [], adjustments: [] })
    ).toBe(-5250); // 4750 earned, 10000 moved out
    expect(
      establishmentBalance({ contributions, transfers, establishmentId: "est-b", interestEntries: [], adjustments: [] })
    ).toBe(10000);
  });

  it("counts only completed transfers", () => {
    const contributions = [contribution()];
    for (const status of ["initiated", "failed"] as const) {
      expect(
        establishmentBalance({
          contributions,
          transfers: [transfer({ status })],
          establishmentId: "est-a",
        interestEntries: [],
        adjustments: [],
        })
      ).toBe(4750);
    }
  });

  it("nets a reversed pair back to zero movement", () => {
    // The original keeps `completed` and the compensating row counts the other
    // way — that is what makes reversal need no special-casing here.
    const original = transfer({ id: "t1", reversedBy: "t2" });
    const compensating = transfer({
      id: "t2",
      sourceEstablishmentId: "est-b",
      destinationEstablishmentId: "est-a",
      reversalOf: "t1",
    });
    const contributions = [contribution()];

    expect(
      establishmentBalance({
        contributions,
        transfers: [original, compensating],
        establishmentId: "est-a",
      interestEntries: [],
      adjustments: [],
      })
    ).toBe(4750);
    expect(
      establishmentBalance({
        contributions,
        transfers: [original, compensating],
        establishmentId: "est-b",
      interestEntries: [],
      adjustments: [],
      })
    ).toBe(0);
  });

  it("returns zero for an establishment with nothing at all", () => {
    expect(
      establishmentBalance({
        contributions: [],
        transfers: [],
        establishmentId: "est-z",
        interestEntries: [],
        adjustments: [],
      })
    ).toBe(0);
  });
});

describe("transferableBalance", () => {
  it("floors a negative balance at zero", () => {
    expect(
      transferableBalance({
        contributions: [contribution()],
        transfers: [transfer({ amount: 99999 })],
        establishmentId: "est-a",
      interestEntries: [],
      adjustments: [],
      })
    ).toBe(0);
  });

  it("matches the balance when positive", () => {
    expect(
      transferableBalance({
        contributions: [contribution()],
        transfers: [],
        establishmentId: "est-a",
      interestEntries: [],
      adjustments: [],
      })
    ).toBe(4750);
  });
});

describe("validateTransfer", () => {
  const ctx = {
    knownEstablishmentIds: ["est-a", "est-b"],
    availableBalance: 10000,
    todayKey: "2026-09-12",
  };
  const base = {
    sourceEstablishmentId: "est-a",
    destinationEstablishmentId: "est-b",
    amount: 5000,
    date: "2026-09-01",
  };

  it("accepts a well-formed transfer", () => {
    expect(validateTransfer(base, ctx)).toEqual([]);
  });

  it("rejects a transfer to the same employer", () => {
    const issues = validateTransfer({ ...base, destinationEstablishmentId: "est-a" }, ctx);
    expect(issues.some((issue) => issue.code === "self_transfer")).toBe(true);
  });

  it("rejects an establishment that is not the user's", () => {
    const issues = validateTransfer(
      { ...base, destinationEstablishmentId: "somebody-else" },
      ctx
    );
    expect(issues.some((issue) => issue.code === "missing_establishment")).toBe(true);
  });

  it("rejects zero and negative amounts", () => {
    for (const amount of [0, -1]) {
      const issues = validateTransfer({ ...base, amount }, ctx);
      expect(issues.some((issue) => issue.code === "non_positive_amount")).toBe(true);
    }
  });

  it("rejects more than the employer holds", () => {
    const issues = validateTransfer({ ...base, amount: 50000 }, ctx);
    expect(issues.some((issue) => issue.code === "exceeds_balance")).toBe(true);
  });

  it("allows an over-balance amount when recorded as an adjustment", () => {
    const issues = validateTransfer(
      { ...base, amount: 50000, adjustmentReason: "EPFO statement disagrees" },
      ctx
    );
    expect(issues).toEqual([]);
  });

  it("rejects a future date but allows today", () => {
    expect(
      validateTransfer({ ...base, date: "2026-09-13" }, ctx).some(
        (issue) => issue.code === "future_date"
      )
    ).toBe(true);
    expect(validateTransfer({ ...base, date: "2026-09-12" }, ctx)).toEqual([]);
  });

  it("rejects a malformed date", () => {
    const issues = validateTransfer({ ...base, date: "01-09-2026" }, ctx);
    expect(issues.some((issue) => issue.code === "invalid_date")).toBe(true);
  });

  it("reports every problem at once rather than stopping at the first", () => {
    const issues = validateTransfer(
      { sourceEstablishmentId: "est-a", destinationEstablishmentId: "est-a", amount: -5, date: "nope" },
      ctx
    );
    expect(issues.length).toBeGreaterThanOrEqual(3);
    expect(transferHasErrors(issues)).toBe(true);
  });
});

describe("status guards", () => {
  it("only an initiated transfer can complete or fail", () => {
    expect(canCompleteTransfer({ status: "initiated" })).toBe(true);
    expect(canFailTransfer({ status: "initiated" })).toBe(true);
    expect(canCompleteTransfer({ status: "completed" })).toBe(false);
    expect(canCompleteTransfer({ status: "failed" })).toBe(false);
  });

  it("refuses to complete an already-completed transfer — the idempotency guard", () => {
    expect(canCompleteTransfer(transfer({ status: "completed" }))).toBe(false);
  });

  it("only a settled, unreversed, non-compensating transfer can be reversed", () => {
    expect(canReverseTransfer(transfer())).toBe(true);
    expect(canReverseTransfer(transfer({ status: "initiated" }))).toBe(false);
    expect(canReverseTransfer(transfer({ reversedBy: "t2" }))).toBe(false);
    expect(canReverseTransfer(transfer({ reversalOf: "t1" }))).toBe(false);
  });
});

describe("buildReversal", () => {
  it("flips the direction and links back to the original", () => {
    const reversal = buildReversal(transfer(), "2026-09-15", "Claim rejected");
    expect(reversal.sourceEstablishmentId).toBe("est-b");
    expect(reversal.destinationEstablishmentId).toBe("est-a");
    expect(reversal.amount).toBe(10000);
    expect(reversal.status).toBe("completed");
    expect(reversal.reversalOf).toBe("t1");
    expect(reversal.statusReason).toBe("Claim rejected");
  });
});

describe("transferDisplayState and status meta", () => {
  it("derives reversed from the pointer rather than a stored status", () => {
    expect(transferDisplayState(transfer({ reversedBy: "t2" }))).toBe("reversed");
    expect(transferDisplayState(transfer())).toBe("completed");
  });

  it("marks an unconfirmed completed transfer as simulated", () => {
    const meta = transferStatusMeta(transfer());
    expect(meta.label).toBe("Completed · simulated");
    expect(meta.simulated).toBe(true);
  });

  it("drops the simulated marker once reconciled", () => {
    const meta = transferStatusMeta(transfer({ reconciledAt: "2026-09-20" }));
    expect(meta.label).toBe("Completed");
    expect(meta.simulated).toBe(false);
  });

  it("shows reversed even when the original was reconciled", () => {
    expect(
      transferStatusMeta(transfer({ reconciledAt: "x", reversedBy: "t2" })).label
    ).toBe("Reversed");
  });

  it("reports reconciliation", () => {
    expect(isTransferReconciled(transfer())).toBe(false);
    expect(isTransferReconciled(transfer({ reconciledAt: "x" }))).toBe(true);
  });
});

describe("summariseTransfers", () => {
  it("splits in, out and net for one establishment", () => {
    const transfers = [
      transfer({ id: "t1", amount: 10000 }),
      transfer({
        id: "t2",
        sourceEstablishmentId: "est-b",
        destinationEstablishmentId: "est-a",
        amount: 4000,
      }),
    ];
    const summary = summariseTransfers(transfers, "est-a");
    expect(summary.transferredOut).toBe(10000);
    expect(summary.transferredIn).toBe(4000);
    expect(summary.net).toBe(-6000);
  });

  it("counts unsettled transfers separately from money moved", () => {
    const summary = summariseTransfers([transfer({ status: "initiated" })], "est-a");
    expect(summary.pending).toBe(1);
    expect(summary.transferredOut).toBe(0);
  });

  it("ignores transfers between other employers", () => {
    const summary = summariseTransfers(
      [transfer({ sourceEstablishmentId: "est-x", destinationEstablishmentId: "est-y" })],
      "est-a"
    );
    expect(summary.net).toBe(0);
  });
});

describe("transfersForEstablishment", () => {
  it("returns both directions, newest first", () => {
    const transfers = [
      transfer({ id: "old", date: "2026-01-01" }),
      transfer({
        id: "new",
        date: "2026-09-01",
        sourceEstablishmentId: "est-b",
        destinationEstablishmentId: "est-a",
      }),
      transfer({ id: "other", sourceEstablishmentId: "est-x", destinationEstablishmentId: "est-y" }),
    ];
    expect(transfersForEstablishment(transfers, "est-a").map((t) => t.id)).toEqual([
      "new",
      "old",
    ]);
  });
});

describe("normalizeTransfer", () => {
  it("defaults an unknown status to initiated rather than trusting it", () => {
    expect(normalizeTransfer("t", { status: "nonsense" }).status).toBe("initiated");
  });

  it("clamps a negative stored amount", () => {
    expect(normalizeTransfer("t", { amount: -500 }).amount).toBe(0);
  });

  it("survives an empty document", () => {
    const row = normalizeTransfer("t", {});
    expect(row.amount).toBe(0);
    expect(row.status).toBe("initiated");
    expect(row.sourceEstablishmentId).toBe("");
  });
});

describe("balance with interest and adjustments — KAN-70", () => {
  const contributions = [contribution()]; // 4750 credited

  it("adds credited interest", () => {
    const balance = establishmentBalance({
      contributions,
      transfers: [],
      establishmentId: "est-a",
      interestEntries: [
        {
          id: "est-a_2023-24",
          establishmentId: "est-a",
          financialYear: "2023-24",
          rate: 0.0825,
          basis: "monthlyRunningBalance",
          openingBalance: 0,
          interest: 825,
          closingBalance: 5575,
        },
      ],
      adjustments: [],
    });
    expect(balance).toBe(5575);
  });

  it("applies a reconciliation adjustment in both directions", () => {
    const adjustment = (amount: number) => [
      {
        id: "r1",
        establishmentId: "est-a",
        date: "2026-09-12",
        actualBalance: 0,
        calculatedBalance: 0,
        adjustmentAmount: amount,
      },
    ];

    expect(
      establishmentBalance({
        contributions,
        transfers: [],
        establishmentId: "est-a",
        interestEntries: [],
        adjustments: adjustment(1000),
      })
    ).toBe(5750);

    expect(
      establishmentBalance({
        contributions,
        transfers: [],
        establishmentId: "est-a",
        interestEntries: [],
        adjustments: adjustment(-1000),
      })
    ).toBe(3750);
  });

  it("ignores another establishment's interest and adjustments", () => {
    const balance = establishmentBalance({
      contributions,
      transfers: [],
      establishmentId: "est-a",
      interestEntries: [
        {
          id: "est-b_2023-24",
          establishmentId: "est-b",
          financialYear: "2023-24",
          rate: 0.0825,
          basis: "monthlyRunningBalance",
          openingBalance: 0,
          interest: 9999,
          closingBalance: 9999,
        },
      ],
      adjustments: [
        {
          id: "r1",
          establishmentId: "est-b",
          date: "2026-09-12",
          actualBalance: 0,
          calculatedBalance: 0,
          adjustmentAmount: 9999,
        },
      ],
    });
    expect(balance).toBe(4750);
  });

  it("breaks the balance into parts that add up to the total", () => {
    const breakdown = establishmentBalanceBreakdown({
      contributions,
      transfers: [transfer({ amount: 1000 })], // out of est-a
      establishmentId: "est-a",
      interestEntries: [
        {
          id: "est-a_2023-24",
          establishmentId: "est-a",
          financialYear: "2023-24",
          rate: 0.0825,
          basis: "monthlyRunningBalance",
          openingBalance: 0,
          interest: 500,
          closingBalance: 0,
        },
      ],
      adjustments: [
        {
          id: "r1",
          establishmentId: "est-a",
          date: "2026-09-12",
          actualBalance: 0,
          calculatedBalance: 0,
          adjustmentAmount: 250,
        },
      ],
    });

    expect(breakdown.contributions).toBe(4750);
    expect(breakdown.interest).toBe(500);
    expect(breakdown.transfersOut).toBe(1000);
    expect(breakdown.adjustments).toBe(250);
    expect(
      breakdown.contributions +
        breakdown.interest +
        breakdown.transfersIn -
        breakdown.transfersOut +
        breakdown.adjustments
    ).toBe(breakdown.total);
  });

  it("still excludes a reversed month rather than subtracting it", () => {
    const balance = establishmentBalance({
      contributions: [contribution({ status: "reversed" })],
      transfers: [],
      establishmentId: "est-a",
      interestEntries: [],
      adjustments: [],
    });
    expect(balance).toBe(0);
  });
});
