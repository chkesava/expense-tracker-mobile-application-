import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cover for the KAN-77 write path.
 *
 * Adding a holding used to write the holding and nothing else, leaving money that
 * had already been spent sitting in the Investment Cash Balance. These tests drive
 * the real services against a fake Firestore and assert the three properties the
 * ticket turns on: the deduction happens in the *same* batch as the holding, a
 * retry with the same id cannot deduct twice, and recording an externally-bought
 * holding moves no cash at all.
 */

type FakeRef = { path: string };
type Write = { path: string; data: Record<string, unknown>; merge: boolean };

const fakeDoc = (_db: unknown, ...segments: string[]): FakeRef => ({
  path: segments.join("/"),
});

let settingsData: Record<string, unknown> | null = null;

vi.mock("firebase/firestore", () => ({
  doc: (db: unknown, ...segments: string[]) => fakeDoc(db, ...segments),
  collection: (db: unknown, ...segments: string[]) => fakeDoc(db, ...segments),
  getDoc: vi.fn(async () => ({
    exists: () => settingsData !== null,
    data: () => settingsData ?? undefined,
  })),
  increment: (n: number) => ({ __increment: n }),
  serverTimestamp: () => ({ __serverTimestamp: true }),
  setDoc: vi.fn(),
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

let idCounter = 0;
vi.mock("@/lib/id", () => ({
  newId: () => `id-${++idCounter}`,
}));

import { setDoc, writeBatch } from "firebase/firestore";

import {
  createHoldingWithCash,
  ensureCashBaseline,
  recordInvestmentCashAdjustment,
  recordInvestmentCashEntry,
  reverseInvestmentCashEntry,
} from "./investmentCash";

let writes: Write[] = [];
let commits = 0;

function installBatchRecorder() {
  vi.mocked(writeBatch).mockImplementation(
    () =>
      ({
        set: (ref: FakeRef, data: Record<string, unknown>, options?: { merge?: boolean }) => {
          writes.push({ path: ref.path, data, merge: options?.merge === true });
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
  exchange: "NSE" as const,
  instrumentType: "stock" as const,
  quantity: 12,
  averageBuyPrice: 500,
};

function pathsUnder(collectionName: string) {
  return writes.filter((write) => write.path.includes(`/${collectionName}/`));
}

beforeEach(() => {
  writes = [];
  commits = 0;
  idCounter = 0;
  settingsData = null;
  vi.clearAllMocks();
  installBatchRecorder();
});

describe("createHoldingWithCash", () => {
  it("writes the holding, the purchase entry and the cache in one batch", async () => {
    const result = await createHoldingWithCash("u1", {
      holding: HOLDING,
      fundingSource: "investment_cash",
      purchaseAmount: 6000,
      date: "2026-09-11",
    });

    expect(commits).toBe(1);
    expect(result.entryId).not.toBeNull();

    const holdingWrite = writes.find((w) => w.path.includes("/holdings/"));
    expect(holdingWrite?.path).toBe(`users/u1/holdings/${result.holdingId}`);
    expect(holdingWrite?.data).toMatchObject({ symbol: "INFY", quantity: 12 });

    const entryWrite = pathsUnder("investmentCashTransactions")[0];
    expect(entryWrite.path).toBe(`users/u1/investmentCashTransactions/${result.entryId}`);
    expect(entryWrite.data).toMatchObject({
      type: "PURCHASE",
      direction: "debit",
      amount: 6000,
      date: "2026-09-11",
      holdingId: result.holdingId,
      symbol: "INFY",
      correlationId: result.entryId,
      source: "app",
    });
  });

  it("decrements the scalar cache by the purchase amount", async () => {
    await createHoldingWithCash("u1", {
      holding: HOLDING,
      fundingSource: "investment_cash",
      purchaseAmount: 6000,
      date: "2026-09-11",
    });

    const settingsWrite = writes.find((w) => w.path.includes("/portfolioSettings/"));
    expect(settingsWrite?.data.cashBalance).toEqual({ __increment: -6000 });
    expect(settingsWrite?.merge).toBe(true);
  });

  it("moves no cash for a holding bought outside the app", async () => {
    const result = await createHoldingWithCash("u1", {
      holding: HOLDING,
      fundingSource: "external",
      purchaseAmount: 6000,
      date: "2026-09-11",
      source: "csv_import",
    });

    expect(result.entryId).toBeNull();
    expect(pathsUnder("investmentCashTransactions")).toHaveLength(0);
    expect(writes.filter((w) => w.path.includes("/portfolioSettings/"))).toHaveLength(0);
    expect(writes).toHaveLength(1);
  });

  it("moves no cash for a zero-cost purchase", async () => {
    const result = await createHoldingWithCash("u1", {
      holding: { ...HOLDING, averageBuyPrice: 0 },
      fundingSource: "investment_cash",
      purchaseAmount: 0,
      date: "2026-09-11",
    });

    expect(result.entryId).toBeNull();
    expect(pathsUnder("investmentCashTransactions")).toHaveLength(0);
  });

  // The offline/retry case: the same submit re-sent must not deduct twice.
  it("targets the same doc paths when retried with the same ids", async () => {
    const ids = { holdingId: "holding-1", entryId: "entry-1" };
    const first = await createHoldingWithCash("u1", {
      holding: HOLDING,
      fundingSource: "investment_cash",
      purchaseAmount: 6000,
      date: "2026-09-11",
      ...ids,
    });
    const firstPaths = writes.map((w) => w.path);

    writes = [];
    const second = await createHoldingWithCash("u1", {
      holding: HOLDING,
      fundingSource: "investment_cash",
      purchaseAmount: 6000,
      date: "2026-09-11",
      ...ids,
    });

    expect(second.holdingId).toBe(first.holdingId);
    expect(second.entryId).toBe(first.entryId);
    expect(writes.map((w) => w.path)).toEqual(firstPaths);
  });

  it("mints fresh ids when none are supplied", async () => {
    const first = await createHoldingWithCash("u1", {
      holding: HOLDING,
      fundingSource: "investment_cash",
      purchaseAmount: 6000,
      date: "2026-09-11",
    });
    const second = await createHoldingWithCash("u1", {
      holding: HOLDING,
      fundingSource: "investment_cash",
      purchaseAmount: 6000,
      date: "2026-09-11",
    });

    expect(second.holdingId).not.toBe(first.holdingId);
    expect(second.entryId).not.toBe(first.entryId);
  });

  it("rejects an unauthenticated caller before writing", async () => {
    await expect(
      createHoldingWithCash("", {
        holding: HOLDING,
        fundingSource: "investment_cash",
        purchaseAmount: 6000,
        date: "2026-09-11",
      })
    ).rejects.toThrow("Not authenticated");
    expect(commits).toBe(0);
  });
});

describe("recordInvestmentCashEntry", () => {
  it("credits the cache for money arriving", async () => {
    await recordInvestmentCashEntry(
      "u1",
      { type: "TOP_UP", amount: 10000, direction: "credit", date: "2026-09-09" },
      "entry-1"
    );

    const entry = pathsUnder("investmentCashTransactions")[0];
    expect(entry.path).toBe("users/u1/investmentCashTransactions/entry-1");
    expect(entry.data).toMatchObject({ type: "TOP_UP", amount: 10000, direction: "credit" });

    const settings = writes.find((w) => w.path.includes("/portfolioSettings/"));
    expect(settings?.data.cashBalance).toEqual({ __increment: 10000 });
  });

  it("keeps the user's chosen date rather than today", async () => {
    await recordInvestmentCashEntry(
      "u1",
      { type: "TOP_UP", amount: 500, direction: "credit", date: "2026-01-02" },
      "entry-1"
    );
    expect(pathsUnder("investmentCashTransactions")[0].data.date).toBe("2026-01-02");
  });

  it("normalises a negative amount and trusts the direction", async () => {
    await recordInvestmentCashEntry(
      "u1",
      { type: "WITHDRAWAL", amount: -750, direction: "debit", date: "2026-09-09" },
      "entry-1"
    );

    expect(pathsUnder("investmentCashTransactions")[0].data.amount).toBe(750);
    const settings = writes.find((w) => w.path.includes("/portfolioSettings/"));
    expect(settings?.data.cashBalance).toEqual({ __increment: -750 });
  });

  it("omits empty optional fields rather than writing undefined", async () => {
    await recordInvestmentCashEntry(
      "u1",
      { type: "TOP_UP", amount: 100, direction: "credit", date: "2026-09-09", note: "   " },
      "entry-1"
    );

    const data = pathsUnder("investmentCashTransactions")[0].data;
    expect("note" in data).toBe(false);
    expect("reason" in data).toBe(false);
    expect("holdingId" in data).toBe(false);
  });
});

describe("recordInvestmentCashAdjustment", () => {
  it("persists the reason and direction", async () => {
    await recordInvestmentCashAdjustment("u1", {
      amount: 6000,
      direction: "debit",
      reason: "  Correcting investment cash not deducted  ",
      date: "2026-09-11",
      entryId: "adj-1",
    });

    const entry = pathsUnder("investmentCashTransactions")[0];
    expect(entry.data).toMatchObject({
      type: "ADJUSTMENT",
      direction: "debit",
      amount: 6000,
      reason: "Correcting investment cash not deducted",
    });
  });

  it("never touches holdings or bank entries", async () => {
    await recordInvestmentCashAdjustment("u1", {
      amount: 6000,
      direction: "debit",
      reason: "Correcting drift",
      date: "2026-09-11",
      entryId: "adj-1",
    });

    expect(writes.some((w) => w.path.includes("/holdings/"))).toBe(false);
    expect(writes.some((w) => w.path.includes("/accountEntries/"))).toBe(false);
  });

  it("refuses an empty or whitespace reason without writing", async () => {
    await expect(
      recordInvestmentCashAdjustment("u1", {
        amount: 6000,
        direction: "debit",
        reason: "   ",
        date: "2026-09-11",
      })
    ).rejects.toThrow("reason");
    expect(commits).toBe(0);
  });

  it("refuses a non-positive amount without writing", async () => {
    await expect(
      recordInvestmentCashAdjustment("u1", {
        amount: 0,
        direction: "debit",
        reason: "Correcting drift",
        date: "2026-09-11",
      })
    ).rejects.toThrow("positive amount");
    expect(commits).toBe(0);
  });
});

describe("reverseInvestmentCashEntry", () => {
  it("credits back a debit and points at the original without editing it", async () => {
    await reverseInvestmentCashEntry(
      "u1",
      { id: "purchase-1", amount: 6000, direction: "debit", symbol: "INFY" },
      { date: "2026-09-12", entryId: "rev-1" }
    );

    const entry = pathsUnder("investmentCashTransactions")[0];
    expect(entry.path).toBe("users/u1/investmentCashTransactions/rev-1");
    expect(entry.data).toMatchObject({
      type: "REVERSAL",
      direction: "credit",
      amount: 6000,
      reversesId: "purchase-1",
    });
    expect(writes.some((w) => w.path.endsWith("/purchase-1"))).toBe(false);
  });
});

describe("ensureCashBaseline", () => {
  it("captures the legacy scalar as the opening balance", async () => {
    settingsData = { cashBalance: 10000 };

    await ensureCashBaseline("u1", 0);

    expect(vi.mocked(setDoc)).toHaveBeenCalledTimes(1);
    const [, payload] = vi.mocked(setDoc).mock.calls[0] as unknown as [unknown, Record<string, any>];
    expect(payload.cashBaseline).toMatchObject({ amount: 10000 });
    expect(payload.cashBalance).toBe(10000);
  });

  it("is a no-op once a baseline exists, so it cannot re-freeze a stale figure", async () => {
    settingsData = {
      cashBalance: 4000,
      cashBaseline: { amount: 10000, capturedAt: "2026-09-01T00:00:00.000Z", capturedAtMs: 0, reason: "x" },
    };

    await ensureCashBaseline("u1", 0);

    expect(vi.mocked(setDoc)).not.toHaveBeenCalled();
  });

  it("falls back to the supplied balance when no settings doc exists yet", async () => {
    settingsData = null;

    await ensureCashBaseline("u1", 2500);

    const [, payload] = vi.mocked(setDoc).mock.calls[0] as unknown as [unknown, Record<string, any>];
    expect(payload.cashBaseline.amount).toBe(2500);
  });
});
