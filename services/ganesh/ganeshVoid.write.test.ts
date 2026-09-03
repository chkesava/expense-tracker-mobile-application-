import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression cover for `voidFinancialRecord` (audit finding N-04, 2026-09-03).
 *
 * A void is the one ledger operation that puts money *back*, so voiding one
 * record twice invents money that never existed. The `voided` flag used to be
 * read with `getDoc` and the reversal applied through a `writeBatch`, so two
 * admins voiding the same record both saw `voided: false` and both reversed it:
 * an ₹8,000 expense credited ₹16,000 back to the God Fund.
 *
 * These tests drive the real function against a fake Firestore and assert the
 * guard now reads through the transaction, so a concurrent writer is forced to
 * retry and then fails the guard instead of double-reversing.
 */

type FakeRef = { path: string };
type Write = { path: string; data: Record<string, unknown> };

const fakeDoc = (_db: unknown, ...segments: string[]): FakeRef => ({
  path: segments.join("/"),
});

vi.mock("firebase/firestore", () => ({
  doc: (db: unknown, ...segments: string[]) => fakeDoc(db, ...segments),
  collection: (db: unknown, ...segments: string[]) => fakeDoc(db, ...segments),
  getDoc: vi.fn(async () => ({ exists: () => true, data: () => ({ status: "open" }) })),
  getDocs: vi.fn(async () => ({ docs: [], empty: true })),
  increment: (n: number) => ({ __increment: n }),
  serverTimestamp: () => ({ __serverTimestamp: true }),
  arrayUnion: (...values: unknown[]) => ({ __arrayUnion: values }),
  arrayRemove: (...values: unknown[]) => ({ __arrayRemove: values }),
  query: (...args: unknown[]) => args,
  where: (...args: unknown[]) => args,
  limit: (...args: unknown[]) => args,
  orderBy: (...args: unknown[]) => args,
  startAfter: (...args: unknown[]) => args,
  documentId: () => ({ __documentId: true }),
  writeBatch: vi.fn(),
  runTransaction: vi.fn(),
}));

vi.mock("@/lib/firestoreWrite", () => ({
  commitWrite: async (fn: () => Promise<unknown>) => fn(),
}));

let idCounter = 0;
vi.mock("@/lib/id", () => ({
  newId: () => `id-${++idCounter}`,
}));

import { runTransaction, writeBatch } from "firebase/firestore";

import { voidFinancialRecord } from "./ganeshWrites";

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

/** A God Fund expense of 8000 paid in cash, not yet voided. */
const liveExpense = {
  amount: 8000,
  godFundAmount: 8000,
  personalAmount: 0,
  paymentMethod: "cash",
  expenseType: "normal",
  voided: false,
};

function runVoid(record: Record<string, unknown>, writer: unknown) {
  const txn = {
    ...(writer as object),
    get: async (ref: FakeRef) => ({
      exists: () => true,
      data: () => (ref.path.includes("/expenses/") ? record : { status: "open" }),
    }),
  };
  vi.mocked(runTransaction).mockImplementation((async (
    _db: unknown,
    fn: (t: unknown) => Promise<unknown>
  ) => fn(txn)) as never);
  return voidFinancialRecord({} as never, actor, "pandal-1", "festival-1", {
    entityType: "expense",
    entityId: "exp-1",
    reason: "Duplicate entry",
  });
}

beforeEach(() => {
  idCounter = 0;
  vi.mocked(writeBatch).mockReset();
  vi.mocked(runTransaction).mockReset();
});

describe("voidFinancialRecord", () => {
  it("reverses the expense through the transaction, never a batch", async () => {
    const { writes, writer } = makeRecorder();
    await runVoid({ ...liveExpense }, writer);

    expect(runTransaction).toHaveBeenCalledTimes(1);
    // A batch here is the bug: the guard would sit outside the write.
    expect(writeBatch).not.toHaveBeenCalled();

    const record = writes.find((w) => w.path.includes("/expenses/exp-1"));
    expect(record?.data.voided).toBe(true);

    const summary = writes.find((w) => w.path.includes("/summary/"));
    expect(summary?.data.godFundExpenses).toEqual({ __increment: -8000 });
    // The cash the expense took leaves the Cash bucket back where it came from.
    expect(summary?.data.cash).toEqual({ __increment: 8000 });
  });

  it("refuses a record that is already voided, so money is not returned twice", async () => {
    const { writes, writer } = makeRecorder();

    await expect(
      runVoid({ ...liveExpense, voided: true }, writer)
    ).rejects.toThrow("already voided");

    // Nothing may be written on the losing side of the race.
    expect(writes).toEqual([]);
  });

  it("refuses to void an asset purchase while the Pandal still owns the asset", async () => {
    const { writes, writer } = makeRecorder();
    const txn = {
      ...writer,
      get: async (ref: FakeRef) => ({
        exists: () => true,
        data: () =>
          ref.path.includes("/expenses/")
            ? { ...liveExpense, expenseType: "asset_purchase", assetId: "asset-1" }
            : ref.path.includes("/assets/")
              ? { status: "available", voided: false }
              : { status: "open" },
      }),
    };
    vi.mocked(runTransaction).mockImplementation((async (
      _db: unknown,
      fn: (t: unknown) => Promise<unknown>
    ) => fn(txn)) as never);

    await expect(
      voidFinancialRecord({} as never, actor, "pandal-1", "festival-1", {
        entityType: "expense",
        entityId: "exp-1",
        reason: "Wrong amount",
      })
    ).rejects.toThrow("Pandal assets screen");

    // The asset would otherwise be left in inventory citing a voided expense.
    expect(writes).toEqual([]);
  });

  it("allows the void once that asset is disposed", async () => {
    const { writes, writer } = makeRecorder();
    const txn = {
      ...writer,
      get: async (ref: FakeRef) => ({
        exists: () => true,
        data: () =>
          ref.path.includes("/expenses/")
            ? { ...liveExpense, expenseType: "asset_purchase", assetId: "asset-1" }
            : ref.path.includes("/assets/")
              ? { status: "disposed", voided: false }
              : { status: "open" },
      }),
    };
    vi.mocked(runTransaction).mockImplementation((async (
      _db: unknown,
      fn: (t: unknown) => Promise<unknown>
    ) => fn(txn)) as never);

    await voidFinancialRecord({} as never, actor, "pandal-1", "festival-1", {
      entityType: "expense",
      entityId: "exp-1",
      reason: "Wrong amount",
    });

    const summary = writes.find((w) => w.path.includes("/summary/"));
    expect(summary?.data.godFundExpenses).toEqual({ __increment: -8000 });
    // An asset purchase also unwinds the purchase total.
    expect(summary?.data.assetPurchaseAmount).toEqual({ __increment: -8000 });
  });

  it("reads the voided flag inside the transaction, not before it", async () => {
    const { writer } = makeRecorder();
    const reads: string[] = [];
    const txn = {
      ...writer,
      get: async (ref: FakeRef) => {
        reads.push(ref.path);
        return {
          exists: () => true,
          data: () => (ref.path.includes("/expenses/") ? liveExpense : { status: "open" }),
        };
      },
    };
    vi.mocked(runTransaction).mockImplementation((async (
      _db: unknown,
      fn: (t: unknown) => Promise<unknown>
    ) => fn(txn)) as never);

    await voidFinancialRecord({} as never, actor, "pandal-1", "festival-1", {
      entityType: "expense",
      entityId: "exp-1",
      reason: "Duplicate entry",
    });

    // The record itself must be among the transaction's own reads — that is what
    // makes a concurrent void retry instead of passing the same stale check.
    expect(reads.some((path) => path.includes("/expenses/exp-1"))).toBe(true);
  });
});
