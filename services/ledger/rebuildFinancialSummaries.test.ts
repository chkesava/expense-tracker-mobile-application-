import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, Record<string, Record<string, unknown>>>();
const updates: { path: string; data: Record<string, unknown> }[] = [];

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...segs: string[]) => ({ path: segs.join("/") }),
  collection: (_db: unknown, ...segs: string[]) => ({ path: segs.join("/") }),
  query: (ref: { path: string }, filter?: { field: string; value: unknown }) => ({ ...ref, filter }),
  where: (field: string, _op: string, value: unknown) => ({ field, value }),
  getDoc: async (ref: { path: string }) => {
    const [, uid, col, id] = ref.path.split("/");
    const row = store.get(`${uid}/${col}`)?.[id];
    return { exists: () => Boolean(row), id, data: () => row };
  },
  getDocs: async (q: { path: string; filter?: { field: string; value: unknown } }) => {
    const [, uid, col] = q.path.split("/");
    const rows = Object.entries(store.get(`${uid}/${col}`) ?? {}).filter(
      ([, row]) => !q.filter || row[q.filter.field] === q.filter.value
    );
    const docs = rows.map(([id, row]) => ({ id, data: () => row }));
    return { docs, forEach: (fn: (d: unknown) => void) => docs.forEach(fn) };
  },
  writeBatch: () => ({
    update: (ref: { path: string }, data: Record<string, unknown>) => updates.push({ path: ref.path, data }),
    commit: async () => {},
  }),
  deleteField: () => "DEL",
  serverTimestamp: () => "NOW",
}));
vi.mock("@/lib/firebase", () => ({ getFirestoreDb: () => ({}) }));
vi.mock("@/shared/utils/dates", async (orig) => ({
  ...(await orig<typeof import("@/shared/utils/dates")>()),
  todayDateKey: () => "2026-10-20",
}));

import type { Account } from "@/shared/types/expense";
import { accountRebuildWrite, accountSourcesFor, planAccountRebuild } from "@/shared/utils/reconciliation";
import { rebuildFinancialSummaries } from "./rebuildFinancialSummaries";

function seed() {
  store.clear();
  updates.length = 0;
  store.set("u1/accounts", {
    bank: { typeId: "tb", openingBalance: 1000, currentBalance: 1000, balanceReconciliationStatus: "needs_reconciliation" },
    card: { typeId: "tc", currentOutstanding: 50, statementDue: 7 },
  });
  store.set("u1/accountTypes", { tb: { name: "Bank Account" }, tc: { name: "Credit Card" } });
  store.set("u1/expenses", {
    e1: { amount: 200, date: "2026-10-02", month: "2026-10", accountId: "bank" },
    e2: { amount: 900, date: "2026-10-03", month: "2026-10", accountId: "card" },
  });
  store.set("u1/accountPayments", {
    p1: { fromAccountId: "bank", toAccountId: "card", amount: 400, date: "2026-10-05", sourceType: "account" },
  });
}

describe("in-app rebuild uses the single reference (SPENDLY-499)", () => {
  beforeEach(seed);

  for (const accountId of ["bank", "card"]) {
    it(`writes exactly accountRebuildWrite(planAccountRebuild(...)) for the ${accountId}`, async () => {
      await rebuildFinancialSummaries("u1", accountId, "apply");

      const account = { id: accountId, ...store.get("u1/accounts")![accountId] } as unknown as Account;
      const typeName = account.typeId === "tb" ? "Bank Account" : "Credit Card";
      const rows = (col: string) =>
        Object.entries(store.get(`u1/${col}`) ?? {}).map(([id, row]) => ({ id, ...row })) as any[];
      const expected = accountRebuildWrite(
        planAccountRebuild(
          account,
          typeName,
          accountSourcesFor(accountId, {
            expenses: rows("expenses"),
            incomes: [],
            entries: [],
            payments: rows("accountPayments"),
            transfers: [],
            borrowings: [],
            borrowingRepayments: [],
            receivables: [],
            receivableRepayments: [],
            bills: [],
          }),
          "2026-10-20"
        ),
        { remove: () => "DEL", now: () => "NOW" }
      );
      expect(updates).toEqual([{ path: `users/u1/accounts/${accountId}`, data: expected }]);
    });
  }

  it("clears a flag even when the balance is already right", async () => {
    // 1000 − 200 (expense) − 400 (bill payment from the bank): already correct.
    store.get("u1/accounts")!.bank.currentBalance = 400;
    const result = await rebuildFinancialSummaries("u1", "bank", "apply");
    expect(result.variances).toEqual([]);
    expect(result.applied).toBe(true);
    expect(updates[0].data).toMatchObject({
      currentBalance: 400,
      balanceReconciliationStatus: "healthy",
      summaryReconciliationStatus: "healthy",
    });
  });

  it("writes nothing in dry run", async () => {
    await rebuildFinancialSummaries("u1", "card", "dryRun");
    expect(updates).toEqual([]);
  });
});
