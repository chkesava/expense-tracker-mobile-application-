import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SPENDLY-290 (R4.3a): a decision about a Spendly income or deposit is checked
 * against Firestore before it is written, and records the amount Firestore has.
 * The write itself goes through commitMutations (taxStore, SPENDLY-709).
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
    // The cache misses, so the server read is what counts.
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

const { saveIncomeDecision, undoIncomeDecision, TaxSourceChangedError, firestoreIncomeSourceAmount } = await import(
  "./taxIncomeStore"
);
import type { TaxLine } from "@/shared/features/tax/types";

const FY = "2025-26";
const TODAY = "2026-11-07";

function line(patch: Partial<TaxLine> = {}): TaxLine {
  return {
    key: "income:i1",
    fy: FY,
    category: "dividend",
    value: 3120,
    included: true,
    state: "pending",
    provenance: { origin: "spendly_derived", fy: FY, sourceRef: { kind: "income", id: "i1" } },
    label: "Dividend",
    reasons: [],
    ...patch,
  };
}

beforeEach(() => {
  docs.clear();
  commitMutations.mockClear();
  docs.set("users/u1/incomes/i1", { source: "Dividend", amount: 3120, date: "2025-08-01", month: "2025-08" });
});

describe("saveIncomeDecision", () => {
  it("writes the review with the amount Firestore has", async () => {
    await saveIncomeDecision("u1", { line: line(), decision: "exclude", todayKey: TODAY });
    expect(commitMutations).toHaveBeenCalledTimes(1);
    const [uid, ops] = commitMutations.mock.calls[0] as [string, { op: string; ref: { path: string }; data: Record<string, unknown> }[]];
    expect(uid).toBe("u1");
    expect(ops[0]).toMatchObject({
      op: "set",
      ref: { path: "users/u1/taxReviews/2025-26__income__i1" },
      data: { decision: "exclude", sourceAmount: 3120, engineVersion: 1, fy: FY },
    });
  });

  it("writes nothing when Firestore has a different amount than the user saw", async () => {
    docs.set("users/u1/incomes/i1", { source: "Dividend", amount: 5000, date: "2025-08-01", month: "2025-08" });
    await expect(saveIncomeDecision("u1", { line: line(), decision: "confirm", todayKey: TODAY })).rejects.toBeInstanceOf(
      TaxSourceChangedError
    );
    expect(commitMutations).not.toHaveBeenCalled();
  });

  it("writes nothing when the income was deleted or moved to another year", async () => {
    docs.set("users/u1/incomes/i1", { source: "Dividend", amount: 3120, date: "2025-08-01", deletedAt: "2026-01-01" });
    await expect(saveIncomeDecision("u1", { line: line(), decision: "confirm", todayKey: TODAY })).rejects.toBeInstanceOf(
      TaxSourceChangedError
    );
    docs.set("users/u1/incomes/i1", { source: "Dividend", amount: 3120, date: "2026-04-02" });
    await expect(saveIncomeDecision("u1", { line: line(), decision: "confirm", todayKey: TODAY })).rejects.toBeInstanceOf(
      TaxSourceChangedError
    );
    expect(commitMutations).not.toHaveBeenCalled();
  });

  it("re-derives deposit interest from the deposit as Firestore has it", async () => {
    docs.set("users/u1/investments/fd1", {
      name: "SBI FD",
      kind: "fixed_deposit",
      principal: 100_000,
      startDate: "2025-04-01",
      annualInterestRate: 7,
      interestMethod: "simple",
      creditFrequency: "monthly",
      maturityDate: "2027-04-01",
      status: "active",
    });
    const amount = await firestoreIncomeSourceAmount("u1", FY, "investment", "fd1", TODAY);
    expect(amount).toBeGreaterThan(0);
    const fd = line({
      key: "investment:fd1",
      value: amount!,
      included: false,
      provenance: { origin: "calculated", fy: FY, sourceRef: { kind: "investment", id: "fd1" } },
    });
    await saveIncomeDecision("u1", { line: fd, decision: "confirm", todayKey: TODAY });
    expect(commitMutations).toHaveBeenCalledTimes(1);
  });

  it("refuses an entry line (nothing derived to decide about)", async () => {
    const entry = line({ provenance: { origin: "user_entered", fy: FY, sourceRef: { kind: "tax_entry", id: "e1" } } });
    await expect(saveIncomeDecision("u1", { line: entry, decision: "confirm", todayKey: TODAY })).rejects.toThrow();
    expect(commitMutations).not.toHaveBeenCalled();
  });
});

describe("undoIncomeDecision", () => {
  it("deletes the review so the item goes back to Spendly's view", async () => {
    await undoIncomeDecision("u1", line());
    expect(commitMutations.mock.calls[0][1]).toEqual([
      { op: "delete", ref: { path: "users/u1/taxReviews/2025-26__income__i1" } },
    ]);
  });
});
