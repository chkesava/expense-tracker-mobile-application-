import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SPENDLY-521: both adjustments built a batch and returned it without
 * committing, so the app said "recalibrated" and nothing was saved. These
 * tests drive the service against a fake Firestore and require the commit.
 */

type FakeRef = { path: string };
type Write = { path: string; data: Record<string, unknown>; kind: "set" | "update" };

const docs = new Map<string, Record<string, unknown>>();
const batches: { writes: Write[]; committed: boolean }[] = [];

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  getDoc: vi.fn(async (ref: FakeRef) => ({
    exists: () => docs.has(ref.path),
    data: () => docs.get(ref.path),
  })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  increment: (n: number) => ({ __increment: n }),
  serverTimestamp: () => ({ __serverTimestamp: true }),
  writeBatch: () => {
    const batch = { writes: [] as Write[], committed: false };
    batches.push(batch);
    return {
      set: (ref: FakeRef, data: Record<string, unknown>) => {
        batch.writes.push({ path: ref.path, data, kind: "set" });
      },
      update: (ref: FakeRef, data: Record<string, unknown>) => {
        batch.writes.push({ path: ref.path, data, kind: "update" });
      },
      commit: async () => {
        batch.committed = true;
      },
    };
  },
}));

vi.mock("@/lib/firebase", () => ({
  getFirestoreDb: () => ({ __db: true }),
}));

vi.mock("@/lib/firestoreWrite", () => ({
  commitWrite: async (fn: () => Promise<unknown>) => {
    await fn();
    return "acked";
  },
}));

let idCounter = 0;
vi.mock("@/lib/id", () => ({
  newId: () => `id-${++idCounter}`,
}));

const { executeCostBasisAdjustment, executeMissingAcquisitionAdjustment } = await import(
  "./holdingAdjustments"
);

const UID = "u1";
const HOLDING_PATH = `users/${UID}/holdings/h1`;

beforeEach(() => {
  docs.clear();
  batches.length = 0;
  idCounter = 0;
  docs.set(HOLDING_PATH, { symbol: "KPITTECH", quantity: 20, averageBuyPrice: 1300 });
});

describe("executeCostBasisAdjustment", () => {
  it("commits the new average, a signed ADJUSTMENT row and the audit record", async () => {
    const result = await executeCostBasisAdjustment(UID, {
      holdingId: "h1",
      actualInvestedValue: 24470,
      date: "2026-10-12",
      reason: "Correct existing cost basis",
    });

    expect(result.outcome).toBe("acked");
    expect(batches).toHaveLength(1);
    expect(batches[0].committed).toBe(true);

    const [holding, tx, audit] = batches[0].writes;
    expect(holding).toMatchObject({ path: HOLDING_PATH, kind: "update" });
    expect(holding.data.averageBuyPrice).toBe(1223.5);
    expect(tx.path).toBe(`users/${UID}/portfolioTransactions/id-2`);
    // 24470 - 20 * 1300: lowering the basis gives a negative price.
    expect(tx.data).toMatchObject({ type: "ADJUSTMENT", quantity: 0, price: -1530 });
    expect(audit.path).toBe(`users/${UID}/holdingAdjustments/id-1`);
    expect(audit.data).toMatchObject({
      type: "correct_cost_basis",
      previousInvestedValue: 26000,
      newInvestedValue: 24470,
      newAveragePrice: 1223.5,
    });
  });

  it("writes nothing when the holding is missing", async () => {
    docs.clear();
    await expect(
      executeCostBasisAdjustment(UID, {
        holdingId: "h1",
        actualInvestedValue: 24470,
        date: "2026-10-12",
        reason: "x",
      })
    ).rejects.toThrow("Holding not found");
    expect(batches).toHaveLength(0);
  });
});

describe("executeMissingAcquisitionAdjustment", () => {
  it("commits the merged quantity and average with a BUY row", async () => {
    await executeMissingAcquisitionAdjustment(UID, {
      holdingId: "h1",
      quantity: 5,
      price: 1000,
      date: "2026-01-05",
      fundingSource: "external",
      reason: "Missing historical purchase",
    });

    expect(batches).toHaveLength(1);
    expect(batches[0].committed).toBe(true);
    const [holding, tx] = batches[0].writes;
    expect(holding.data).toMatchObject({ quantity: 25, averageBuyPrice: 1240 });
    expect(tx.data).toMatchObject({ type: "BUY", quantity: 5, price: 1000 });
  });
});
