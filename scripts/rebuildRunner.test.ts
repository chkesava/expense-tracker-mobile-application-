import { describe, expect, it, vi } from "vitest";

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { delete: () => "DEL", serverTimestamp: () => "NOW" },
  FieldPath: class {
    constructor(readonly name: string) {}
  },
}));

import { listUserIds, MAX_BATCH_OPS, rebuildUser } from "./lib/rebuildRunner";

type Rows = Record<string, Record<string, unknown>[]>;

/** Just enough of the Admin Firestore surface the runner touches. */
function fakeDb(users: Record<string, Rows>, rootless: string[] = []) {
  const commits: number[] = [];
  const writes: { path: string; data: unknown }[] = [];
  const db = {
    collection: (name: string) => ({
      listDocuments: async () => [...Object.keys(users), ...rootless].map((id) => ({ id })),
      doc: (uid: string) => ({
        collection: (col: string) => ({
          get: async () => {
            const docs = (users[uid]?.[col] ?? []).map((row) => ({ id: row.id as string, data: () => row }));
            return { docs, size: docs.length };
          },
        }),
      }),
      name,
    }),
    doc: (path: string) => ({ path }),
    batch: () => {
      let ops = 0;
      return {
        set: (ref: { path: string }, data: unknown) => {
          ops += 1;
          writes.push({ path: ref.path, data });
        },
        update: (ref: { path: string }, data: unknown) => {
          ops += 1;
          writes.push({ path: ref.path, data });
        },
        commit: async () => {
          commits.push(ops);
        },
      };
    },
  };
  return { db: db as never, commits, writes };
}

describe("rebuild runner (SPENDLY-499)", () => {
  it("lists uids that have only subcollections, not just root docs", async () => {
    const { db } = fakeDb({ u1: {} }, ["orphan-uid"]);
    expect(await listUserIds(db)).toEqual(["u1", "orphan-uid"]);
  });

  it("chunks more than one batch's worth of writes", async () => {
    // 1,000 flagged bank accounts whose balances are already right: each one
    // still needs a write to clear its flag.
    const accounts = Array.from({ length: 1000 }, (_, i) => ({
      id: `a${i}`,
      typeId: "tb",
      openingBalance: 0,
      currentBalance: 0,
      balanceReconciliationStatus: "needs_reconciliation",
    }));
    const { db, commits } = fakeDb({ u1: { accounts, accountTypes: [{ id: "tb", name: "Bank Account" }] } });
    const report = await rebuildUser(db, "u1", {
      mode: "apply",
      steps: { accounts: true, epf: false, dashboards: false },
      log: () => {},
      today: "2026-10-20",
    });
    expect(report.accountsNeedingWrite).toBe(1000);
    expect(report.opsCommitted).toBe(1000);
    expect(commits.every((n) => n <= MAX_BATCH_OPS)).toBe(true);
    expect(commits).toEqual([450, 450, 100]);
  });

  it("writes nothing in dry-run", async () => {
    const { db, commits } = fakeDb({
      u1: { accounts: [{ id: "a", typeId: "tb", currentBalance: 5 }], accountTypes: [{ id: "tb", name: "Bank Account" }] },
    });
    const report = await rebuildUser(db, "u1", {
      mode: "dryRun",
      steps: { accounts: true, epf: true, dashboards: true },
      log: () => {},
      today: "2026-10-20",
    });
    expect(report.accountsNeedingWrite).toBe(1);
    expect(commits).toEqual([]);
  });

  it("skips a user whose source read fails, writing nothing", async () => {
    const { db, commits } = fakeDb({ u1: {} });
    (db as any).collection = () => ({
      doc: () => ({ collection: () => ({ get: async () => { throw new Error("permission-denied"); } }) }),
    });
    const report = await rebuildUser(db, "u1", {
      mode: "apply",
      steps: { accounts: true, epf: true, dashboards: true },
      log: () => {},
    });
    expect(report.skipped).toBe(true);
    expect(commits).toEqual([]);
  });

  it("never writes the retired netWorth / investments docs", async () => {
    const { db, writes } = fakeDb({
      u1: {
        accounts: [{ id: "a", typeId: "tb", currentBalance: 1 }],
        accountTypes: [{ id: "tb", name: "Bank Account" }],
        expenses: [{ id: "e", amount: 10, date: "2026-10-01", month: "2026-10", accountId: "a", category: "F" }],
      },
    });
    await rebuildUser(db, "u1", {
      mode: "apply",
      steps: { accounts: true, epf: true, dashboards: true },
      log: () => {},
      today: "2026-10-20",
    });
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.some((w) => /financialSummaries\/(netWorth|investments)$/.test(w.path))).toBe(false);
  });
});
