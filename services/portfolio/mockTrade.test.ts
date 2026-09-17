import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * INV-01 / SPENDLY-43: mock buy/sell must not treat `cashBalance` as authority.
 *
 * The trade used to `runTransaction` a scalar overwrite. A concurrent deposit
 * that wrote the ledger + `increment` was lost, and the UI (ledger fold) could
 * disagree with the transaction (scalar). These tests drive the service against
 * a fake Firestore and lock the replacement: one batch, ledger row, `increment`.
 */

type FakeRef = { path: string };
type Write = {
  path: string;
  data: Record<string, unknown>;
  kind: "set" | "update" | "delete";
  merge?: boolean;
};

const docs = new Map<string, Record<string, unknown>>();

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...segments: string[]) => ({
    path: segments.join("/"),
  }),
  collection: (_db: unknown, ...segments: string[]) => ({
    path: segments.join("/"),
  }),
  getDoc: vi.fn(async (ref: FakeRef) => ({
    exists: () => docs.has(ref.path),
    data: () => docs.get(ref.path),
  })),
  getDocs: vi.fn(async (ref: FakeRef) => {
    const prefix = `${ref.path}/`;
    const matches = [...docs.entries()].filter(([path]) => path.startsWith(prefix));
    return {
      docs: matches.map(([path, data]) => ({
        id: path.slice(prefix.length),
        data: () => data,
      })),
    };
  }),
  increment: (n: number) => ({ __increment: n }),
  serverTimestamp: () => ({ __serverTimestamp: true }),
  writeBatch: vi.fn(),
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

vi.mock("@/lib/id", () => ({
  newId: () => "generated-id",
}));

import { writeBatch } from "firebase/firestore";

import { executeMockBuy, executeMockSell } from "./investmentCash";

let writes: Write[] = [];
let commits = 0;

function installBatchRecorder() {
  vi.mocked(writeBatch).mockImplementation(
    () =>
      ({
        set: (ref: FakeRef, data: Record<string, unknown>, options?: { merge?: boolean }) => {
          writes.push({ path: ref.path, data, kind: "set", merge: options?.merge === true });
        },
        update: (ref: FakeRef, data: Record<string, unknown>) => {
          writes.push({ path: ref.path, data, kind: "update" });
        },
        delete: (ref: FakeRef) => {
          writes.push({ path: ref.path, data: {}, kind: "delete" });
        },
        commit: async () => {
          commits += 1;
        },
      }) as never
  );
}

const HOLDING = {
  symbol: "INFY",
  yahooSymbol: "INFY.NS",
  name: "Infosys",
  exchange: "NSE",
  instrumentType: "stock",
  quantity: 10,
  averageBuyPrice: 100,
};

function seedHolding() {
  docs.set("users/u1/holdings/h1", { ...HOLDING });
}

function seedSettings(data: Record<string, unknown>) {
  docs.set("users/u1/portfolioSettings/config", data);
}

function seedCashEntry(id: string, data: Record<string, unknown>) {
  docs.set(`users/u1/investmentCashTransactions/${id}`, data);
}

function pathsUnder(collectionName: string) {
  return writes.filter((write) => write.path.includes(`/${collectionName}/`));
}

beforeEach(() => {
  writes = [];
  commits = 0;
  docs.clear();
  vi.clearAllMocks();
  installBatchRecorder();
  seedHolding();
});

describe("executeMockBuy", () => {
  it("writes holding, PURCHASE, trade row and increment cache in one batch", async () => {
    seedSettings({
      cashBalance: 10000,
      cashBaseline: { amount: 10000, capturedAt: "2026-01-01T00:00:00.000Z", capturedAtMs: 1, reason: "open" },
    });

    const result = await executeMockBuy("u1", {
      holdingId: "h1",
      quantity: 2,
      price: 150,
      fees: 10,
      date: "2026-09-17",
      cashEntryId: "cash-1",
      transactionId: "txn-1",
    });

    expect(commits).toBe(1);
    expect(result.cashEntryId).toBe("cash-1");
    expect(result.transactionId).toBe("txn-1");

    const holding = writes.find((w) => w.path === "users/u1/holdings/h1");
    expect(holding?.kind).toBe("update");
    expect(holding?.data).toMatchObject({ quantity: 12, averageBuyPrice: 109.17 });

    const cash = pathsUnder("investmentCashTransactions")[0];
    expect(cash.path).toBe("users/u1/investmentCashTransactions/cash-1");
    expect(cash.data).toMatchObject({
      type: "PURCHASE",
      amount: 310,
      direction: "debit",
      holdingId: "h1",
      correlationId: "cash-1",
    });

    const trade = pathsUnder("portfolioTransactions")[0];
    expect(trade.path).toBe("users/u1/portfolioTransactions/txn-1");
    expect(trade.data).toMatchObject({ type: "BUY", quantity: 2, price: 150, fees: 10 });

    const settings = writes.find((w) => w.path.includes("/portfolioSettings/"));
    expect(settings?.merge).toBe(true);
    expect(settings?.data.cashBalance).toEqual({ __increment: -310 });
    expect(settings?.data.cashBalance).not.toBe(9690);
  });

  it("gates on the ledger fold, not a stale high scalar", async () => {
    seedSettings({
      cashBalance: 50000,
      cashBaseline: { amount: 1000, capturedAt: "2026-01-01T00:00:00.000Z", capturedAtMs: 1, reason: "open" },
    });
    seedCashEntry("spent", {
      type: "PURCHASE",
      amount: 900,
      direction: "debit",
      date: "2026-09-01",
      createdAtMs: 2,
    });

    await expect(
      executeMockBuy("u1", {
        holdingId: "h1",
        quantity: 2,
        price: 150,
        date: "2026-09-17",
      })
    ).rejects.toThrow("Insufficient cash balance");
    expect(commits).toBe(0);
  });

  it("lets a concurrent deposit's ledger row fund the buy even when the scalar is stale-low", async () => {
    seedSettings({
      cashBalance: 50,
      cashBaseline: { amount: 50, capturedAt: "2026-01-01T00:00:00.000Z", capturedAtMs: 1, reason: "open" },
    });
    seedCashEntry("deposit", {
      type: "TOP_UP",
      amount: 10000,
      direction: "credit",
      date: "2026-09-17",
      createdAtMs: 2,
    });

    await executeMockBuy("u1", {
      holdingId: "h1",
      quantity: 1,
      price: 100,
      date: "2026-09-17",
      cashEntryId: "cash-1",
      transactionId: "txn-1",
    });

    expect(commits).toBe(1);
    const settings = writes.find((w) => w.path.includes("/portfolioSettings/"));
    expect(settings?.data.cashBalance).toEqual({ __increment: -100 });
  });

  it("captures the baseline in the same batch when it is missing", async () => {
    seedSettings({ cashBalance: 5000 });

    await executeMockBuy("u1", {
      holdingId: "h1",
      quantity: 1,
      price: 100,
      date: "2026-09-17",
    });

    expect(commits).toBe(1);
    const settings = writes.find((w) => w.path.includes("/portfolioSettings/"));
    expect(settings?.data.cashBaseline).toMatchObject({ amount: 5000 });
    expect(settings?.data.cashBalance).toEqual({ __increment: -100 });
  });

  it("refuses a missing holding without committing", async () => {
    docs.delete("users/u1/holdings/h1");
    seedSettings({ cashBalance: 5000 });

    await expect(
      executeMockBuy("u1", {
        holdingId: "h1",
        quantity: 1,
        price: 100,
        date: "2026-09-17",
      })
    ).rejects.toThrow("Holding not found");
    expect(commits).toBe(0);
  });
});

describe("executeMockSell", () => {
  it("credits the ledger and increments the cache; does not overwrite the scalar", async () => {
    seedSettings({
      cashBalance: 1000,
      cashBaseline: { amount: 1000, capturedAt: "2026-01-01T00:00:00.000Z", capturedAtMs: 1, reason: "open" },
    });

    await executeMockSell("u1", {
      holdingId: "h1",
      quantity: 2,
      price: 120,
      fees: 5,
      date: "2026-09-17",
      cashEntryId: "sale-1",
      transactionId: "txn-s",
    });

    expect(commits).toBe(1);
    const holding = writes.find((w) => w.path === "users/u1/holdings/h1");
    expect(holding?.kind).toBe("update");
    expect(holding?.data).toMatchObject({ quantity: 8 });

    const cash = pathsUnder("investmentCashTransactions")[0];
    expect(cash.data).toMatchObject({
      type: "SALE",
      amount: 235,
      direction: "credit",
      correlationId: "sale-1",
    });

    const settings = writes.find((w) => w.path.includes("/portfolioSettings/"));
    expect(settings?.data.cashBalance).toEqual({ __increment: 235 });
  });

  it("deletes the holding when the remaining quantity is zero", async () => {
    seedSettings({ cashBalance: 0, cashBaseline: { amount: 0, capturedAt: "x", capturedAtMs: 1, reason: "open" } });

    await executeMockSell("u1", {
      holdingId: "h1",
      quantity: 10,
      price: 100,
      date: "2026-09-17",
    });

    const holding = writes.find((w) => w.path === "users/u1/holdings/h1");
    expect(holding?.kind).toBe("delete");
  });

  it("refuses an oversell without committing", async () => {
    seedSettings({ cashBalance: 0 });

    await expect(
      executeMockSell("u1", {
        holdingId: "h1",
        quantity: 99,
        price: 100,
        date: "2026-09-17",
      })
    ).rejects.toThrow("Insufficient holdings quantity");
    expect(commits).toBe(0);
  });
});
