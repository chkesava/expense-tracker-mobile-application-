import { describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore", () => ({
  increment: (n: number) => ({ __inc: n }),
  serverTimestamp: () => ({ __ts: true }),
}));

import type { AccountInfo } from "./fetchAccountTypes";
import { journalBalanceOps } from "./journalBalanceOps";

const TODAY = "2026-10-24";

function info_(overrides: Partial<AccountInfo> = {}): AccountInfo {
  return {
    isCreditCard: false,
    oldBalance: 1000,
    oldOutstanding: 0,
    needsInitialization: false,
    exists: true,
    balanceAsOfDate: null,
    ...overrides,
  };
}

describe("journalBalanceOps (SPENDLY-602)", () => {
  it("a new expense decrements the bank balance", () => {
    const ops = journalBalanceOps(
      "u1",
      [{ accountId: "bank", amountDelta: -250, date: "2026-10-01" }],
      new Map([["bank", info_()]]),
      TODAY
    );
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      op: "update",
      ref: { path: "users/u1/accounts/bank" },
      data: { currentBalance: { __inc: -250 } },
    });
  });

  it("a new expense dated before the baseline writes nothing", () => {
    const ops = journalBalanceOps(
      "u1",
      [{ accountId: "bank", amountDelta: -250, date: "2026-08-01" }],
      new Map([["bank", info_({ balanceAsOfDate: "2026-09-10" })]]),
      TODAY
    );
    expect(ops).toEqual([]);
  });

  it("a card expense raises outstanding regardless of a baseline", () => {
    const ops = journalBalanceOps(
      "u1",
      [{ accountId: "card", amountDelta: -250, date: "2026-08-01" }],
      new Map([["card", info_({ isCreditCard: true, balanceAsOfDate: "2026-09-10" })]]),
      TODAY
    );
    expect(ops[0]).toMatchObject({ data: { currentOutstanding: { __inc: 250 } } });
  });

  it("seeds a never-initialized account from its prior value (SPENDLY-436)", () => {
    const ops = journalBalanceOps(
      "u1",
      [{ accountId: "bank", amountDelta: -250, date: "2026-10-01" }],
      new Map([["bank", info_({ needsInitialization: true, oldBalance: 1000 })]]),
      TODAY
    );
    expect(ops[0]).toMatchObject({
      data: {
        currentBalance: 750,
        balanceInitialized: true,
        balanceReconciliationStatus: "needs_reconciliation",
      },
    });
  });

  it("a leg's pinned card flag wins over the account type (SPENDLY-603)", () => {
    const info = new Map([
      ["bank", info_({ balanceAsOfDate: "2026-09-10" })],
      ["card", info_({ isCreditCard: false, balanceAsOfDate: "2026-09-10" })],
    ]);
    const ops = journalBalanceOps(
      "u1",
      [
        // Bank side of a bill payment: pinned non-card, before the baseline.
        { accountId: "bank", amountDelta: -730, date: "2026-09-01", isCreditCard: false },
        // Card side: pinned card, so no baseline and it moves outstanding.
        { accountId: "card", amountDelta: 730, date: "2026-09-01", isCreditCard: true },
      ],
      info,
      TODAY
    );
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      ref: { path: "users/u1/accounts/card" },
      data: { currentOutstanding: { __inc: -730 } },
    });
  });

  it("writes nothing for a row with no account", () => {
    expect(
      journalBalanceOps("u1", [{ accountId: "", amountDelta: -250, date: "2026-10-01" }], new Map(), TODAY)
    ).toEqual([]);
  });
});
