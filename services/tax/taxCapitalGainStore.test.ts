import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SPENDLY-293 (R4.3a): a decision about a sale Spendly found is checked
 * against the SELL row in Firestore before it is written, and records the sale
 * value Firestore has. The write goes through commitMutations (taxStore).
 */

type FakeRef = { path: string; id: string };
const docs = new Map<string, Record<string, unknown>>();

vi.mock("firebase/firestore", () => {
  const snap = (ref: FakeRef) => {
    const data = docs.get(ref.path);
    return { id: ref.id, exists: () => data !== undefined, data: () => data };
  };
  return {
    doc: (_db: unknown, ...segments: string[]): FakeRef => ({ path: segments.join("/"), id: segments[segments.length - 1] }),
    collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
    getDocFromCache: vi.fn(async () => {
      throw new Error("not cached");
    }),
    getDoc: vi.fn(async (ref: FakeRef) => snap(ref)),
    serverTimestamp: () => ({ __serverTimestamp: true }),
    deleteField: () => ({ __delete: true }),
  };
});

vi.mock("@/lib/firebase", () => ({ getFirestoreDb: () => ({ __db: true }) }));

const commitMutations = vi.fn(async (..._args: unknown[]) => "acked" as const);
vi.mock("@/lib/commitMutations", () => ({
  commitMutations: (...args: unknown[]) => (commitMutations as (...a: unknown[]) => unknown)(...args),
}));

const { saveSaleDecision, undoSaleDecision } = await import("./taxCapitalGainStore");
const { TaxSourceChangedError } = await import("./taxIncomeStore");

const FY = "2025-26";
const SALE = { type: "SELL", quantity: 10, price: 200, fees: 20, date: "2025-08-01", orderStatus: "executed", symbol: "INFY", holdingId: "h1" };
type Op = { op: string; ref: { path: string }; data: Record<string, unknown> };

beforeEach(() => {
  docs.clear();
  commitMutations.mockClear();
  docs.set("users/u1/portfolioTransactions/s1", { ...SALE });
});

describe("saveSaleDecision", () => {
  it("writes the review with the sale value Firestore has", async () => {
    await saveSaleDecision("u1", { fy: FY, saleId: "s1", saleValue: 2000, decision: "confirm" });
    const [uid, ops] = commitMutations.mock.calls[0] as [string, Op[]];
    expect(uid).toBe("u1");
    expect(ops[0]).toMatchObject({
      op: "set",
      ref: { path: "users/u1/taxReviews/2025-26__portfolio_transaction__s1" },
      data: { decision: "confirm", sourceAmount: 2000, engineVersion: 1, fy: FY },
    });
  });

  it("stores the chosen asset class when moving a sale", async () => {
    await saveSaleDecision("u1", { fy: FY, saleId: "s1", saleValue: 2000, decision: "recategorize", assetClass: "debt_mutual_fund" });
    const ops = commitMutations.mock.calls[0][1] as Op[];
    expect(ops[0].data).toMatchObject({ decision: "recategorize", category: "debt_mutual_fund" });
  });

  it("writes nothing when the sale changed, was cancelled, moved year or is gone", async () => {
    const attempt = () => saveSaleDecision("u1", { fy: FY, saleId: "s1", saleValue: 2000, decision: "confirm" });
    docs.set("users/u1/portfolioTransactions/s1", { ...SALE, price: 210 });
    await expect(attempt()).rejects.toBeInstanceOf(TaxSourceChangedError);
    docs.set("users/u1/portfolioTransactions/s1", { ...SALE, orderStatus: "cancelled" });
    await expect(attempt()).rejects.toBeInstanceOf(TaxSourceChangedError);
    docs.set("users/u1/portfolioTransactions/s1", { ...SALE, date: "2026-04-02" });
    await expect(attempt()).rejects.toBeInstanceOf(TaxSourceChangedError);
    docs.set("users/u1/portfolioTransactions/s1", { ...SALE, type: "BUY" });
    await expect(attempt()).rejects.toBeInstanceOf(TaxSourceChangedError);
    docs.delete("users/u1/portfolioTransactions/s1");
    await expect(attempt()).rejects.toBeInstanceOf(TaxSourceChangedError);
    expect(commitMutations).not.toHaveBeenCalled();
  });
});

describe("undoSaleDecision", () => {
  it("deletes the review", async () => {
    await undoSaleDecision("u1", FY, "s1");
    expect(commitMutations.mock.calls[0][1]).toEqual([{ op: "delete", ref: { path: "users/u1/taxReviews/2025-26__portfolio_transaction__s1" } }]);
  });
});
