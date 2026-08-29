import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression cover for `addAssetPurchase`.
 *
 * The God Fund path runs its appender inside `runTransaction`, while the
 * personal/sponsored path runs the same appender against a `writeBatch` created
 * further down the function. A stray reference to that batch from inside the
 * appender therefore blew up *only* on the God Fund path, with a temporal dead
 * zone `ReferenceError`, and left the asset row outside the transaction — so
 * the expense could commit without its asset.
 *
 * These tests drive the real function against a fake Firestore and assert both
 * paths write the expense **and** the asset through the same writer.
 */

type FakeRef = { path: string };
type Write = { path: string; data: Record<string, unknown> };

const fakeDoc = (_db: unknown, ...segments: string[]): FakeRef => ({
  path: segments.join("/"),
});

vi.mock("firebase/firestore", () => ({
  doc: (db: unknown, ...segments: string[]) => fakeDoc(db, ...segments),
  collection: (db: unknown, ...segments: string[]) => fakeDoc(db, ...segments),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
  getDocs: vi.fn(async () => ({ docs: [], empty: true })),
  increment: (n: number) => ({ __increment: n }),
  serverTimestamp: () => ({ __serverTimestamp: true }),
  arrayUnion: (...values: unknown[]) => ({ __arrayUnion: values }),
  arrayRemove: (...values: unknown[]) => ({ __arrayRemove: values }),
  query: (...args: unknown[]) => args,
  where: (...args: unknown[]) => args,
  limit: (...args: unknown[]) => args,
  writeBatch: vi.fn(),
  runTransaction: vi.fn(),
}));

vi.mock("@/lib/firestoreWrite", () => ({
  commitWrite: async (fn: () => Promise<unknown>) => fn(),
}));

// `lib/id` reaches expo-crypto and so react-native, whose Flow-typed entry
// point cannot be parsed under vitest's node environment. Ids only need to be
// unique within a test.
let idCounter = 0;
vi.mock("@/lib/id", () => ({
  newId: () => `id-${++idCounter}`,
}));

import { runTransaction, writeBatch } from "firebase/firestore";

import { addAssetPurchase } from "./ganeshWrites";

/** Collects everything a write path sets, so we can assert on the documents. */
function makeRecorder() {
  const writes: Write[] = [];
  const writer = {
    set: (ref: FakeRef, data: Record<string, unknown>) => {
      writes.push({ path: ref.path, data });
    },
    update: (ref: FakeRef, data: Record<string, unknown>) => {
      writes.push({ path: ref.path, data });
    },
    commit: async () => undefined,
  };
  return { writes, writer };
}

const actor = { uid: "u1", displayName: "Treasurer" } as never;

const input = {
  name: "Plastic chairs",
  totalAmount: 15000,
  godFundAmount: 0,
  personalAmount: 0,
  categoryId: "cat-1",
  categoryName: "Pandal Setup",
  paidByMemberId: "u1",
  date: "2026-08-29",
  asset: {
    name: "Plastic chairs",
    category: "furniture" as const,
    quantity: 20,
    unit: "pieces" as const,
    condition: "good" as const,
  },
};

beforeEach(() => {
  vi.mocked(writeBatch).mockReset();
  vi.mocked(runTransaction).mockReset();
});

describe("addAssetPurchase", () => {
  it("writes the expense and the asset in one transaction when paid from the God Fund", async () => {
    const { writes, writer } = makeRecorder();

    // The God Fund path reads the summary inside the transaction before spending.
    const txn = {
      ...writer,
      get: async () => ({ exists: () => true, data: () => ({ openingFunds: 100000 }) }),
    };
    vi.mocked(runTransaction).mockImplementation((async (
      _db: unknown,
      fn: (t: unknown) => Promise<unknown>
    ) => fn(txn)) as never);

    const result = await addAssetPurchase(
      {} as never,
      actor,
      "pandal-1",
      "festival-1",
      { ...input, godFundAmount: 15000 }
    );

    // The bug: this threw `Cannot access 'batch' before initialization`.
    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(writeBatch).not.toHaveBeenCalled();

    const expense = writes.find((w) => w.path.includes("/expenses/"));
    const asset = writes.find((w) => w.path.includes("/assets/"));

    expect(expense?.data.expenseType).toBe("asset_purchase");
    expect(expense?.data.assetId).toBe(result.assetId);

    // The asset must ride the same transaction, not a separate batch.
    expect(asset).toBeDefined();
    expect(asset?.path).toContain(result.assetId);
    expect(asset?.data.ownershipType).toBe("purchased");
    expect(asset?.data.relatedExpenseId).toBe(result.expenseId);
    expect(asset?.data.relatedExpenseFestivalId).toBe("festival-1");
  });

  it("writes the expense and the asset in one batch when paid personally", async () => {
    const { writes, writer } = makeRecorder();
    vi.mocked(writeBatch).mockReturnValue(writer as never);

    const result = await addAssetPurchase(
      {} as never,
      actor,
      "pandal-1",
      "festival-1",
      { ...input, personalAmount: 15000 }
    );

    // No balance to check, so this path stays offline-capable via a batch.
    expect(writeBatch).toHaveBeenCalledTimes(1);
    expect(runTransaction).not.toHaveBeenCalled();

    const expense = writes.find((w) => w.path.includes("/expenses/"));
    const asset = writes.find((w) => w.path.includes("/assets/"));

    expect(expense?.data.assetId).toBe(result.assetId);
    expect(asset?.data.relatedExpenseId).toBe(result.expenseId);
  });
});
