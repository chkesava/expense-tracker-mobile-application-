import { describe, it, expect } from "vitest";
import { buildAccountBalanceOps } from "./balanceMutations";

// SPENDLY-436: an account whose materialized summary was never seeded
// (`balanceInitialized` missing) must not have its first mutation read
// `currentBalance ?? 0` and silently drop `openingBalance`. The caller signals
// this via `needsInitialization`, and the write must become a literal seed
// from the caller's best-known prior value, not a bare Firestore increment().
describe("buildAccountBalanceOps", () => {
  it("increments normally for an already-initialized bank account", () => {
    const ops = buildAccountBalanceOps("u1", [
      { accountId: "a1", amountDelta: -300, isCreditCard: false, oldBalance: 1000 },
    ]);
    const accountOp = ops.find((op): op is Extract<typeof op, { data: object }> => op.op !== "delete" && op.ref.path === "users/u1/accounts/a1")!;
    const data = accountOp.data as Record<string, unknown>;
    // A real Firestore increment() sentinel, never a plain number here.
    expect(typeof data.currentBalance).not.toBe("number");
    expect(data.balanceInitialized).toBeUndefined();
    expect(data.balanceReconciliationStatus).toBeUndefined();
  });

  it("seeds from openingBalance instead of defaulting to zero when uninitialized", () => {
    const ops = buildAccountBalanceOps("u1", [
      {
        accountId: "a1",
        amountDelta: -300,
        isCreditCard: false,
        oldBalance: 18981, // caller-supplied openingBalance, not currentBalance
        needsInitialization: true,
      },
    ]);
    const accountOp = ops.find((op): op is Extract<typeof op, { data: object }> => op.op !== "delete" && op.ref.path === "users/u1/accounts/a1")!;
    const data = accountOp.data as Record<string, unknown>;
    expect(data.currentBalance).toBe(18681);
    expect(data.balanceInitialized).toBe(true);
    expect(data.balanceReconciliationStatus).toBe("needs_reconciliation");
  });

  it("seeds credit card outstanding from the caller's prior value when uninitialized", () => {
    const ops = buildAccountBalanceOps("u1", [
      {
        accountId: "c1",
        amountDelta: -500, // a 500 spend
        isCreditCard: true,
        oldOutstanding: 2000,
        needsInitialization: true,
      },
    ]);
    const accountOp = ops.find((op): op is Extract<typeof op, { data: object }> => op.op !== "delete" && op.ref.path === "users/u1/accounts/c1")!;
    const data = accountOp.data as Record<string, unknown>;
    expect(data.currentOutstanding).toBe(2500);
    expect(data.balanceInitialized).toBe(true);
    expect(data.summaryReconciliationStatus).toBe("needs_reconciliation");
  });

  it("never drops a never-materialized account's openingBalance on its first mutation", () => {
    // Regression shape for the ticket's observed negative balances: an
    // account with real prior history (oldBalance from openingBalance) that
    // has never had currentBalance seeded.
    const ops = buildAccountBalanceOps("u1", [
      { accountId: "a1", amountDelta: -7600, isCreditCard: false, oldBalance: 18981, needsInitialization: true },
    ]);
    const accountOp = ops.find((op): op is Extract<typeof op, { data: object }> => op.op !== "delete" && op.ref.path === "users/u1/accounts/a1")!;
    const data = accountOp.data as Record<string, unknown>;
    // Not -7600 (what a bare increment() on an absent field would produce).
    expect(data.currentBalance).toBe(11381);
  });
});
