import { describe, expect, it } from "vitest";

import {
  availableInvestmentCash,
  buildInvestmentCashActivities,
  canAfford,
  computeInvestmentCashBalance,
  dedupeEntries,
  filterInvestmentCashActivities,
  findRecentDuplicateAdjustment,
  holdingPurchaseAmount,
  investmentCashEntryDetail,
  investmentCashEntryLabel,
  signedAmount,
} from "./investmentCash";
import type {
  InvestmentCashBaseline,
  InvestmentCashEntry,
} from "@/shared/features/portfolio/types";

function baseline(amount: number): InvestmentCashBaseline {
  return {
    amount,
    capturedAt: "2026-09-01T00:00:00.000Z",
    capturedAtMs: Date.parse("2026-09-01T00:00:00.000Z"),
    reason: "Captured from the legacy cash balance",
  };
}

function entry(partial: Partial<InvestmentCashEntry> & { id: string }): InvestmentCashEntry {
  return {
    type: "TOP_UP",
    amount: 0,
    direction: "credit",
    date: "2026-09-10",
    correlationId: partial.id,
    source: "app",
    createdAtMs: 0,
    ...partial,
  } as InvestmentCashEntry;
}

describe("signedAmount", () => {
  it("credits are positive and debits negative", () => {
    expect(signedAmount(entry({ id: "a", amount: 500, direction: "credit" }))).toBe(500);
    expect(signedAmount(entry({ id: "b", amount: 500, direction: "debit" }))).toBe(-500);
  });

  it("ignores a stray sign on the amount, trusting direction", () => {
    expect(signedAmount(entry({ id: "a", amount: -500, direction: "credit" }))).toBe(500);
  });
});

describe("computeInvestmentCashBalance", () => {
  it("is the baseline when the ledger is empty", () => {
    expect(computeInvestmentCashBalance(baseline(2500), [])).toBe(2500);
  });

  it("is zero with no baseline and no entries", () => {
    expect(computeInvestmentCashBalance(undefined, [])).toBe(0);
  });

  // The worked example from KAN-77.
  it("transfer in 10,000 then buy a holding for 6,000 leaves 4,000", () => {
    const entries = [
      entry({ id: "t1", type: "TOP_UP", amount: 10000, direction: "credit", createdAtMs: 1 }),
      entry({ id: "p1", type: "PURCHASE", amount: 6000, direction: "debit", createdAtMs: 2 }),
    ];
    expect(computeInvestmentCashBalance(baseline(0), entries)).toBe(4000);
  });

  it("counts a replayed entry id once", () => {
    const purchase = entry({
      id: "p1",
      type: "PURCHASE",
      amount: 6000,
      direction: "debit",
    });
    const entries = [
      entry({ id: "t1", type: "TOP_UP", amount: 10000, direction: "credit" }),
      purchase,
      { ...purchase },
    ];
    expect(computeInvestmentCashBalance(baseline(0), entries)).toBe(4000);
  });

  it("does not accumulate float residue over many entries", () => {
    const entries = Array.from({ length: 300 }, (_, index) =>
      entry({ id: `e${index}`, amount: 0.1, direction: "credit", createdAtMs: index })
    );
    expect(computeInvestmentCashBalance(baseline(0), entries)).toBe(30);
  });

  it("folds every entry type with the right sign", () => {
    const entries = [
      entry({ id: "t", type: "TOP_UP", amount: 10000, direction: "credit", createdAtMs: 1 }),
      entry({ id: "p", type: "PURCHASE", amount: 6000, direction: "debit", createdAtMs: 2 }),
      entry({ id: "s", type: "SALE", amount: 2000, direction: "credit", createdAtMs: 3 }),
      entry({ id: "w", type: "WITHDRAWAL", amount: 1000, direction: "debit", createdAtMs: 4 }),
      entry({ id: "a", type: "ADJUSTMENT", amount: 500, direction: "debit", createdAtMs: 5 }),
      entry({ id: "r", type: "REVERSAL", amount: 250, direction: "credit", createdAtMs: 6 }),
    ];
    expect(computeInvestmentCashBalance(baseline(0), entries)).toBe(4750);
  });
});

describe("availableInvestmentCash", () => {
  it("clamps a negative balance to zero so drift is never spendable", () => {
    expect(availableInvestmentCash(-1200)).toBe(0);
  });

  it("passes a positive balance through", () => {
    expect(availableInvestmentCash(4000)).toBe(4000);
  });
});

describe("canAfford", () => {
  it("allows a purchase covered by the balance", () => {
    expect(canAfford(10000, 6000)).toEqual({ ok: true, shortfall: 0 });
  });

  it("allows a purchase that spends the balance exactly", () => {
    expect(canAfford(6000, 6000)).toEqual({ ok: true, shortfall: 0 });
  });

  it("reports the shortfall when the balance is short", () => {
    expect(canAfford(4000, 6000)).toEqual({ ok: false, shortfall: 2000 });
  });

  it("treats a negative balance as nothing available", () => {
    expect(canAfford(-500, 1000)).toEqual({ ok: false, shortfall: 1000 });
  });
});

describe("holdingPurchaseAmount", () => {
  it("multiplies quantity by average buy price", () => {
    expect(holdingPurchaseAmount(12, 500)).toBe(6000);
  });

  it("rounds to the nearest paisa", () => {
    expect(holdingPurchaseAmount(3, 10.005)).toBe(30.02);
  });

  it("is zero for non-positive inputs", () => {
    expect(holdingPurchaseAmount(0, 500)).toBe(0);
    expect(holdingPurchaseAmount(10, 0)).toBe(0);
  });
});

describe("buildInvestmentCashActivities", () => {
  it("returns newest first with running balances that reconcile", () => {
    const entries = [
      entry({ id: "p1", type: "PURCHASE", amount: 6000, direction: "debit", date: "2026-09-10", createdAtMs: 2 }),
      entry({ id: "t1", type: "TOP_UP", amount: 10000, direction: "credit", date: "2026-09-09", createdAtMs: 1 }),
    ];
    const rows = buildInvestmentCashActivities(baseline(0), entries);

    expect(rows.map((row) => row.entry.id)).toEqual(["p1", "t1"]);
    expect(rows[0].runningBalance).toBe(4000);
    expect(rows[1].runningBalance).toBe(10000);
    expect(rows[0].runningBalance).toBe(computeInvestmentCashBalance(baseline(0), entries));
  });

  it("starts the running balance from the baseline", () => {
    const rows = buildInvestmentCashActivities(baseline(2500), [
      entry({ id: "t1", type: "TOP_UP", amount: 500, direction: "credit" }),
    ]);
    expect(rows[0].runningBalance).toBe(3000);
  });

  it("orders same-day entries by client clock", () => {
    const rows = buildInvestmentCashActivities(baseline(0), [
      entry({ id: "second", amount: 100, direction: "credit", date: "2026-09-10", createdAtMs: 200 }),
      entry({ id: "first", amount: 100, direction: "credit", date: "2026-09-10", createdAtMs: 100 }),
    ]);
    expect(rows.map((row) => row.entry.id)).toEqual(["second", "first"]);
  });

  it("carries the signed delta on each row", () => {
    const rows = buildInvestmentCashActivities(baseline(10000), [
      entry({ id: "p1", type: "PURCHASE", amount: 6000, direction: "debit" }),
    ]);
    expect(rows[0].delta).toBe(-6000);
  });
});

describe("filterInvestmentCashActivities", () => {
  const rows = buildInvestmentCashActivities(baseline(0), [
    entry({ id: "t", type: "TOP_UP", amount: 1000, direction: "credit", createdAtMs: 1 }),
    entry({ id: "p", type: "PURCHASE", amount: 600, direction: "debit", createdAtMs: 2 }),
    entry({ id: "s", type: "SALE", amount: 200, direction: "credit", createdAtMs: 3 }),
    entry({ id: "a", type: "ADJUSTMENT", amount: 50, direction: "debit", createdAtMs: 4 }),
  ]);

  it("returns everything for 'all'", () => {
    expect(filterInvestmentCashActivities(rows, "all")).toHaveLength(4);
  });

  it("groups withdrawals with top-ups as cash transfers", () => {
    const withWithdrawal = buildInvestmentCashActivities(baseline(0), [
      entry({ id: "t", type: "TOP_UP", amount: 1000, direction: "credit", createdAtMs: 1 }),
      entry({ id: "w", type: "WITHDRAWAL", amount: 100, direction: "debit", createdAtMs: 2 }),
    ]);
    expect(filterInvestmentCashActivities(withWithdrawal, "top_ups")).toHaveLength(2);
  });

  it("groups reversals with adjustments", () => {
    const withReversal = buildInvestmentCashActivities(baseline(0), [
      entry({ id: "a", type: "ADJUSTMENT", amount: 50, direction: "debit", createdAtMs: 1 }),
      entry({ id: "r", type: "REVERSAL", amount: 50, direction: "credit", createdAtMs: 2 }),
    ]);
    expect(filterInvestmentCashActivities(withReversal, "adjustments")).toHaveLength(2);
  });

  it("narrows to purchases", () => {
    const purchases = filterInvestmentCashActivities(rows, "purchases");
    expect(purchases.map((row) => row.entry.id)).toEqual(["p"]);
  });
});

describe("entry display", () => {
  it("labels each movement in the ticket's vocabulary", () => {
    expect(investmentCashEntryLabel(entry({ id: "a", type: "TOP_UP" }))).toBe("Transfer In / Top Up");
    expect(investmentCashEntryLabel(entry({ id: "b", type: "PURCHASE" }))).toBe("Stock/ETF Purchase");
    expect(investmentCashEntryLabel(entry({ id: "c", type: "ADJUSTMENT" }))).toBe("Manual Adjustment");
  });

  it("shows the reason for an adjustment ahead of any note", () => {
    const adjustment = entry({
      id: "a",
      type: "ADJUSTMENT",
      reason: "  Correcting cash not deducted  ",
      note: "ignored",
    });
    expect(investmentCashEntryDetail(adjustment)).toBe("Correcting cash not deducted");
  });

  it("falls back to the note, then the symbol, then empty", () => {
    expect(investmentCashEntryDetail(entry({ id: "a", note: "From HDFC" }))).toBe("From HDFC");
    expect(investmentCashEntryDetail(entry({ id: "b", type: "PURCHASE", symbol: "INFY" }))).toBe("INFY");
    expect(investmentCashEntryDetail(entry({ id: "c" }))).toBe("");
  });
});

describe("findRecentDuplicateAdjustment", () => {
  const existing = entry({
    id: "a1",
    type: "ADJUSTMENT",
    amount: 6000,
    direction: "debit",
    reason: "Correcting investment cash not deducted",
    createdAtMs: 1_000_000,
  });
  const candidate = {
    amount: 6000,
    direction: "debit" as const,
    reason: "  correcting investment cash not deducted  ",
  };

  it("matches an identical adjustment inside the window, ignoring case and padding", () => {
    expect(findRecentDuplicateAdjustment([existing], candidate, 1_030_000)).toBe(existing);
  });

  it("ignores one outside the window", () => {
    expect(findRecentDuplicateAdjustment([existing], candidate, 1_200_000)).toBeNull();
  });

  it("ignores a different amount, direction or reason", () => {
    expect(findRecentDuplicateAdjustment([existing], { ...candidate, amount: 5000 }, 1_010_000)).toBeNull();
    expect(findRecentDuplicateAdjustment([existing], { ...candidate, direction: "credit" }, 1_010_000)).toBeNull();
    expect(findRecentDuplicateAdjustment([existing], { ...candidate, reason: "something else" }, 1_010_000)).toBeNull();
  });

  it("ignores non-adjustment entries that happen to match", () => {
    const purchase = { ...existing, id: "p1", type: "PURCHASE" as const };
    expect(findRecentDuplicateAdjustment([purchase], candidate, 1_010_000)).toBeNull();
  });
});

describe("dedupeEntries", () => {
  it("keeps the first of a repeated id", () => {
    const first = entry({ id: "a", amount: 100, direction: "credit" });
    const replay = entry({ id: "a", amount: 999, direction: "credit" });
    expect(dedupeEntries([first, replay])).toEqual([first]);
  });
});
