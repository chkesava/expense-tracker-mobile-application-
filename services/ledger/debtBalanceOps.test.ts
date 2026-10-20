import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore", () => ({
  increment: (n: number) => ({ __inc: n }),
  serverTimestamp: () => ({ __ts: true }),
}));

const accounts = new Map<string, Record<string, unknown>>();
vi.mock("@/services/ledger/fetchAccountTypes", () => ({
  fetchAccountTypes: vi.fn(async (_db: unknown, _uid: string, ids: (string | null | undefined)[]) => {
    const out = new Map();
    for (const id of ids) {
      if (!id) continue;
      const a = accounts.get(id);
      out.set(id, {
        exists: Boolean(a),
        isCreditCard: Boolean(a?.isCreditCard),
        oldBalance: (a?.currentBalance as number) ?? 0,
        oldOutstanding: 0,
        needsInitialization: false,
        balanceAsOfDate: (a?.balanceAsOfDate as string) ?? null,
      });
    }
    return out;
  }),
}));

import type { Borrowing, BorrowingRepayment } from "@/shared/types/borrowing";
import type { Receivable } from "@/shared/types/receivable";
import { debtLedgerBalanceOps } from "./debtBalanceOps";

const db = {} as never;
const TODAY = "2026-10-15";

function accountIncrement(ops: any[], id: string): number | undefined {
  const op = ops.find((o) => o.ref.path === `users/u1/accounts/${id}`);
  return op?.data.currentBalance?.__inc;
}

describe("debtLedgerBalanceOps (SPENDLY-496)", () => {
  beforeEach(() => {
    accounts.clear();
    accounts.set("bank-1", { currentBalance: 1000 });
    accounts.set("bank-2", { currentBalance: 500, balanceAsOfDate: "2026-10-05" });
    accounts.set("card-1", { isCreditCard: true });
  });

  it("a new borrowing credits its account and updates net worth", async () => {
    const ops = await debtLedgerBalanceOps(db, "u1", [], [
      { kind: "borrowing", row: { id: "b1", principalAmount: 300, borrowedDate: "2026-10-01", creditedAccountId: "bank-1" } as Borrowing },
    ], TODAY);
    expect(accountIncrement(ops, "bank-1")).toBe(300);
    expect(ops.some((o) => o.ref.path === "users/u1/financialSummaries/netWorth")).toBe(true);
  });

  it("a repayment delete gives the money back", async () => {
    const ops = await debtLedgerBalanceOps(db, "u1", [
      { kind: "borrowingRepayment", row: { id: "p1", borrowingId: "b1", amount: 120, date: "2026-10-02", paymentAccountId: "bank-1" } as BorrowingRepayment },
    ], [], TODAY);
    expect(accountIncrement(ops, "bank-1")).toBe(120);
  });

  it("emits nothing for a credit card, a deleted account, or a row before the baseline", async () => {
    const lend = (sourceAccountId: string, lentDate = "2026-10-10") =>
      ({ kind: "receivable", row: { id: "r", originalAmount: 50, lentDate, sourceAccountId } as Receivable }) as const;
    expect(await debtLedgerBalanceOps(db, "u1", [], [lend("card-1")], TODAY)).toEqual([]);
    expect(await debtLedgerBalanceOps(db, "u1", [], [lend("gone")], TODAY)).toEqual([]);
    expect(await debtLedgerBalanceOps(db, "u1", [], [lend("bank-2", "2026-10-01")], TODAY)).toEqual([]);
    const counted = await debtLedgerBalanceOps(db, "u1", [], [lend("bank-2", "2026-10-06")], TODAY);
    expect(accountIncrement(counted, "bank-2")).toBe(-50);
  });

  it("emits nothing when the row moves no account", async () => {
    expect(
      await debtLedgerBalanceOps(db, "u1", [], [
        { kind: "borrowing", row: { id: "b", principalAmount: 10, borrowedDate: "2026-10-01", creditedAccountId: null } as Borrowing },
      ], TODAY)
    ).toEqual([]);
  });
});
