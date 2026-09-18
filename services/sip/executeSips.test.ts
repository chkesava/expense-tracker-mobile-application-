import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeRef = { path: string };
type Write = { path: string; data: Record<string, unknown>; merge: boolean };

const fakeDoc = (_db: unknown, ...segments: string[]): FakeRef => ({
  path: segments.join("/"),
});

vi.mock("firebase/firestore", () => ({
  doc: (db: unknown, ...segments: string[]) => fakeDoc(db, ...segments),
  collection: (db: unknown, ...segments: string[]) => fakeDoc(db, ...segments),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
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

vi.mock("@/services/marketDataService", () => ({
  fetchMarketQuote: vi.fn(),
}));

import { getDoc, getDocs, writeBatch } from "firebase/firestore";
import { fetchMarketQuote } from "@/services/marketDataService";
import { executeDueSips } from "./executeSips";

let writes: Write[] = [];
let commits = 0;

function installBatchRecorder() {
  vi.mocked(writeBatch).mockImplementation(
    () =>
      ({
        set: (ref: FakeRef, data: Record<string, unknown>, options?: { merge?: boolean }) => {
          writes.push({ path: ref.path, data, merge: options?.merge === true });
        },
        update: (ref: FakeRef, data: Record<string, unknown>) => {
          writes.push({ path: ref.path, data, merge: false });
        },
        commit: async () => {
          commits += 1;
        },
      }) as never
  );
}

const TODAY = new Date(2026, 8, 18);

const PLAN = {
  id: "sip1",
  status: "active",
  nextExecutionDate: new Date(2026, 8, 18).toISOString(),
  skipNextExecution: false,
  frequency: "monthly",
  executionDay: 18,
  investmentAmount: 5000,
  currency: "INR",
  symbol: "INFY.NS",
  quoteKey: "INFY.NS",
  assetName: "Infosys",
  assetType: "stock",
  totalInvested: 0,
  totalUnits: 0,
  executionCount: 0,
};

beforeEach(() => {
  writes = [];
  commits = 0;
  vi.clearAllMocks();
  installBatchRecorder();
  vi.mocked(getDocs).mockImplementation(async (query) => {
    const path = String((query as unknown as FakeRef).path ?? "");
    if (path.includes("sipPlans")) {
      return { docs: [{ id: "sip1", data: () => PLAN }] } as never;
    }
    return { docs: [] } as never;
  });
  vi.mocked(getDoc).mockResolvedValue({ exists: () => false, data: () => undefined } as never);
});

describe("executeDueSips", () => {
  it("writes a deterministic transaction id and increments plan totals", async () => {
    vi.mocked(fetchMarketQuote).mockResolvedValue({ currentPrice: 250 } as never);

    const result = await executeDueSips("u1", TODAY);

    expect(result.executed).toBe(1);
    expect(commits).toBe(1);
    const tx = writes.find((w) => w.path.includes("/sipTransactions/"));
    expect(tx?.path).toBe("users/u1/sipTransactions/sip1_2026-09-18");
    expect(tx?.data).toMatchObject({ status: "executed", marketPrice: 250, unitsPurchased: 20 });
    const planWrite = writes.find((w) => w.path.endsWith("/sipPlans/sip1"));
    expect(planWrite?.data.totalInvested).toEqual({ __increment: 5000 });
    expect(planWrite?.data.executionCount).toEqual({ __increment: 1 });
  });

  it("records a failed row instead of buying at ₹100 when the quote is missing", async () => {
    vi.mocked(fetchMarketQuote).mockResolvedValue(null);

    const result = await executeDueSips("u1", TODAY);

    expect(result.failed).toBe(1);
    expect(result.executed).toBe(0);
    const tx = writes.find((w) => w.path.includes("/sipTransactions/"));
    expect(tx?.data).toMatchObject({ status: "failed", marketPrice: 0, unitsPurchased: 0 });
    expect(writes.some((w) => w.path.includes("/virtualPositions/"))).toBe(false);
  });

  it("does not execute again when that day's transaction already exists", async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ status: "executed" }),
    } as never);
    vi.mocked(fetchMarketQuote).mockResolvedValue({ currentPrice: 250 } as never);

    const result = await executeDueSips("u1", TODAY);

    expect(result.executed).toBe(0);
    expect(commits).toBe(0);
    expect(vi.mocked(fetchMarketQuote)).not.toHaveBeenCalled();
  });
});
