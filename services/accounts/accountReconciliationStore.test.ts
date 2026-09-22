import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeRef = { path: string; id: string };

const writes: Array<{ path: string; data: Record<string, unknown> }> = [];
let queried: Array<{ path: string; field: string; value: unknown }> = [];
let storedDocs: Array<{ id: string; data: Record<string, unknown> }> = [];
let idCounter = 0;

vi.mock("firebase/firestore", () => {
  const ref = (...segments: string[]): FakeRef => {
    idCounter += 1;
    return { path: segments.join("/"), id: `generated-${idCounter}` };
  };
  return {
    // `doc(collectionRef)` — the single-argument form the store uses to mint a
    // new id — inherits the collection's path; `doc(db, ...segments)` builds one.
    doc: (first: unknown, ...segments: string[]) =>
      segments.length === 0 && first && typeof first === "object" && "path" in first
        ? ref((first as FakeRef).path)
        : ref(...segments),
    collection: (_db: unknown, ...segments: string[]) => ref(...segments),
    query: (base: FakeRef, constraint: { field: string; value: unknown }) => ({
      base,
      constraint,
    }),
    where: (field: string, _op: string, value: unknown) => ({ field, value }),
    serverTimestamp: () => ({ __serverTimestamp: true }),
    getDocs: vi.fn(
      async (built: {
        base: FakeRef;
        constraint: { field: string; value: unknown };
      }) => {
        queried.push({
          path: built.base.path,
          field: built.constraint.field,
          value: built.constraint.value,
        });
        return {
          docs: storedDocs.map((entry) => ({
            id: entry.id,
            data: () => entry.data,
          })),
        };
      }
    ),
  };
});

let db: unknown = { __db: true };
vi.mock("@/lib/firebase", () => ({
  getFirestoreDb: () => db,
}));

vi.mock("@/lib/commitMutations", () => ({
  commitMutations: vi.fn(
    async (
      _uid: string,
      ops: Array<{ op: string; ref: FakeRef; data?: Record<string, unknown> }>
    ) => {
      for (const op of ops) {
        writes.push({ path: op.ref.path, data: op.data ?? {} });
      }
      return "acked";
    }
  ),
}));

const {
  isSaveReconciliationInputValid,
  listAccountReconciliations,
  saveAccountReconciliation,
} = await import("./accountReconciliationStore");

const UID = "u1";

function input(overrides: Record<string, unknown> = {}) {
  return {
    accountId: "a1",
    fromDate: "2026-09-01",
    toDate: "2026-09-30",
    statementClosingBalance: 4500,
    ledgerClosingBalance: 4500,
    variance: 0,
    status: "balanced" as const,
    matchedCount: 3,
    missingCount: 0,
    extraCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  writes.length = 0;
  queried = [];
  storedDocs = [];
  idCounter = 0;
  db = { __db: true };
});

describe("saveAccountReconciliation", () => {
  it("writes exactly one document, to the reconciliations collection", async () => {
    await saveAccountReconciliation(UID, input());

    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe("users/u1/accountReconciliations");
  });

  it("never writes to the ledger", async () => {
    await saveAccountReconciliation(UID, input({ variance: -300, status: "variance" }));

    // The whole point: reconciling records a finding, it does not move money.
    for (const write of writes) {
      expect(write.path).not.toContain("accountEntries");
      expect(write.path).not.toContain("expenses");
      expect(write.path).not.toContain("incomes");
      expect(write.path).not.toContain("accounts/");
    }
  });

  it("persists the period, the balances, the variance and the status", async () => {
    await saveAccountReconciliation(
      UID,
      input({ ledgerClosingBalance: 4800, variance: -300, status: "variance" })
    );

    expect(writes[0].data).toMatchObject({
      accountId: "a1",
      fromDate: "2026-09-01",
      toDate: "2026-09-30",
      statementClosingBalance: 4500,
      ledgerClosingBalance: 4800,
      variance: -300,
      status: "variance",
    });
  });

  it("records the adjustment entry only when one was made", async () => {
    await saveAccountReconciliation(UID, input());
    expect(writes[0].data).not.toHaveProperty("adjustmentEntryId");

    await saveAccountReconciliation(UID, input({ adjustmentEntryId: "entry-9" }));
    expect(writes[1].data.adjustmentEntryId).toBe("entry-9");
  });

  it("rounds the money it stores", async () => {
    await saveAccountReconciliation(
      UID,
      input({
        statementClosingBalance: 4500.005,
        ledgerClosingBalance: 4500,
        variance: 0.005,
        status: "variance",
      })
    );

    expect(writes[0].data.statementClosingBalance).toBe(4500.01);
    expect(writes[0].data.variance).toBe(0.01);
  });

  it("refuses a period that ends before it starts", async () => {
    const id = await saveAccountReconciliation(
      UID,
      input({ fromDate: "2026-09-30", toDate: "2026-09-01" })
    );

    expect(id).toBeNull();
    expect(writes).toHaveLength(0);
  });

  it("refuses a malformed date", async () => {
    expect(
      await saveAccountReconciliation(UID, input({ fromDate: "30-09-2026" }))
    ).toBeNull();
    expect(writes).toHaveLength(0);
  });

  it("refuses a reconciliation with no account", async () => {
    expect(await saveAccountReconciliation(UID, input({ accountId: "" }))).toBeNull();
    expect(writes).toHaveLength(0);
  });

  it("writes nothing when there is no database", async () => {
    db = null;

    expect(await saveAccountReconciliation(UID, input())).toBeNull();
    expect(writes).toHaveLength(0);
  });
});

describe("isSaveReconciliationInputValid", () => {
  it("accepts a single-day period", () => {
    expect(
      isSaveReconciliationInputValid(
        input({ fromDate: "2026-09-10", toDate: "2026-09-10" })
      )
    ).toBe(true);
  });

  it("rejects a non-finite variance", () => {
    expect(isSaveReconciliationInputValid(input({ variance: NaN }))).toBe(false);
  });
});

describe("listAccountReconciliations", () => {
  it("queries by account id alone, so no composite index is needed", async () => {
    await listAccountReconciliations(UID, "a1");

    expect(queried).toEqual([
      { path: "users/u1/accountReconciliations", field: "accountId", value: "a1" },
    ]);
  });

  it("returns the newest period first", async () => {
    storedDocs = [
      { id: "r1", data: { accountId: "a1", toDate: "2026-07-31" } },
      { id: "r2", data: { accountId: "a1", toDate: "2026-09-30" } },
      { id: "r3", data: { accountId: "a1", toDate: "2026-08-31" } },
    ];

    const rows = await listAccountReconciliations(UID, "a1");

    expect(rows.map((row) => row.id)).toEqual(["r2", "r3", "r1"]);
  });

  it("returns nothing rather than throwing when there is no account", async () => {
    expect(await listAccountReconciliations(UID, "")).toEqual([]);
    expect(queried).toEqual([]);
  });
});
