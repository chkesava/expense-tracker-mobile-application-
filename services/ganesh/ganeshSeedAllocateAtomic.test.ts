import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Seeding the Permanent Fund and allocating to a festival is one transaction
 * (GS-070).
 *
 * It used to be two awaited calls — each internally transactional, the pair
 * not. A failure or app kill between them left the Fund holding the whole
 * amount and the festival with nothing, and the setup screen then refused to
 * re-run because `fund.total > 0`: a half-applied setup the UI would not let
 * you finish.
 */

type FakeRef = { path: string };
type Write = { path: string; data: Record<string, unknown> };

const writes: Write[] = [];
let fundExists = false;
let fundDoc: Record<string, unknown> = {};
let festivalStatus = "open";
/** Set to make the transaction body throw part-way, after the seed writes. */
let failOnPath: string | null = null;

const FUND_PATH = "pandals/pandal-1/permanentFund/current";

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  getDoc: vi.fn(async (ref: FakeRef) => ({ exists: () => true, ref, data: () => ({}) })),
  getDocs: vi.fn(async () => ({ docs: [], size: 0, empty: true })),
  query: (...args: unknown[]) => args[0],
  where: (...args: unknown[]) => args,
  limit: (...args: unknown[]) => args,
  orderBy: (...args: unknown[]) => args,
  increment: (n: number) => ({ __increment: n }),
  deleteField: () => ({ __deleteField: true }),
  serverTimestamp: () => ({ __serverTimestamp: true }),
  writeBatch: () => ({
    set: (ref: FakeRef, data: Record<string, unknown>) => writes.push({ path: ref.path, data }),
    update: (ref: FakeRef, data: Record<string, unknown>) => writes.push({ path: ref.path, data }),
    commit: vi.fn(async () => undefined),
  }),
  // A real Firestore transaction discards every write when the body throws.
  // Modelled here by staging writes and only committing them on success, which
  // is the property under test.
  runTransaction: vi.fn(async (_db: unknown, fn: (t: unknown) => Promise<unknown>) => {
    const staged: Write[] = [];
    const txn = {
      get: async (ref: FakeRef) => ({
        exists: () => (ref.path === FUND_PATH ? fundExists : true),
        ref,
        data: () =>
          ref.path === FUND_PATH
            ? fundDoc
            : { status: festivalStatus, name: "Ganesh Utsav Test" },
      }),
      set: (ref: FakeRef, data: Record<string, unknown>) => {
        if (failOnPath && ref.path.includes(failOnPath)) throw new Error("boom");
        staged.push({ path: ref.path, data });
      },
      update: (ref: FakeRef, data: Record<string, unknown>) => {
        if (failOnPath && ref.path.includes(failOnPath)) throw new Error("boom");
        staged.push({ path: ref.path, data });
      },
    };
    const result = await fn(txn);
    writes.push(...staged);
    return result;
  }),
}));

vi.mock("@/lib/firestoreWrite", () => ({
  commitWrite: async (fn: () => Promise<unknown>) => fn(),
}));

let idCounter = 0;
vi.mock("@/lib/id", () => ({ newId: () => `generated-${++idCounter}` }));

import { seedPermanentFundWithAllocation } from "./ganeshPermanentFund";

const actor = { uid: "u-admin", displayName: "Admin" } as never;

const SEED = {
  amount: 50_000,
  location: "cash" as const,
  description: "Saved from previous years",
  clientOpId: "op-setup",
};

const ALLOCATION = {
  festivalId: "festival-1",
  amount: 20_000,
  festivalName: "Ganesh Utsav Test",
};

function paths(): string[] {
  return writes.map((w) => w.path);
}

function fundWrite(): Record<string, unknown> | undefined {
  return writes.filter((w) => w.path === FUND_PATH).at(-1)?.data;
}

beforeEach(() => {
  idCounter = 0;
  writes.length = 0;
  fundExists = false;
  fundDoc = {};
  festivalStatus = "open";
  failOnPath = null;
});

describe("seedPermanentFundWithAllocation", () => {
  it("applies the seed and the allocation together", async () => {
    await seedPermanentFundWithAllocation({} as never, actor, "pandal-1", {
      ...SEED,
      allocation: ALLOCATION,
    });

    // Seed transaction, transfer-out transaction, the festival's opening-funds
    // row and its fund-transfer row all present.
    expect(paths().some((path) => path.includes("op-setup-seed"))).toBe(true);
    expect(paths().some((path) => path.includes("openingFunds"))).toBe(true);
    expect(paths().some((path) => path.includes("fundTransfers"))).toBe(true);
  });

  it("writes the fund once, already net of the allocation", async () => {
    // No intermediate "seeded but not yet debited" state exists to observe.
    await seedPermanentFundWithAllocation({} as never, actor, "pandal-1", {
      ...SEED,
      allocation: ALLOCATION,
    });

    expect(writes.filter((w) => w.path === FUND_PATH)).toHaveLength(1);
    expect(fundWrite()?.total).toBe(30_000);
    expect(fundWrite()?.cash).toBe(30_000);
  });

  it("leaves nothing behind when the allocation half fails", async () => {
    // The whole point of the ticket: the old flow committed the seed and then
    // failed, leaving the Fund funded and the festival empty.
    failOnPath = "openingFunds";

    await expect(
      seedPermanentFundWithAllocation({} as never, actor, "pandal-1", {
        ...SEED,
        allocation: ALLOCATION,
      })
    ).rejects.toThrow("boom");

    expect(writes).toHaveLength(0);
  });

  it("seeds alone when no allocation is asked for", async () => {
    await seedPermanentFundWithAllocation({} as never, actor, "pandal-1", SEED);

    expect(fundWrite()?.total).toBe(50_000);
    expect(paths().some((path) => path.includes("openingFunds"))).toBe(false);
  });

  it("refuses to allocate more than the seed", async () => {
    await expect(
      seedPermanentFundWithAllocation({} as never, actor, "pandal-1", {
        ...SEED,
        allocation: { ...ALLOCATION, amount: 60_000 },
      })
    ).rejects.toThrow();

    expect(writes).toHaveLength(0);
  });

  it("refuses when the Fund already holds money", async () => {
    // Unchanged from seedPermanentFund: this is one-time setup, not a way to
    // overwrite a balance.
    fundExists = true;
    fundDoc = { total: 10_000, cash: 10_000 };

    await expect(
      seedPermanentFundWithAllocation({} as never, actor, "pandal-1", {
        ...SEED,
        allocation: ALLOCATION,
      })
    ).rejects.toThrow(/already has a balance/);

    expect(writes).toHaveLength(0);
  });

  it("refuses to allocate into a closed festival", async () => {
    festivalStatus = "closed";

    await expect(
      seedPermanentFundWithAllocation({} as never, actor, "pandal-1", {
        ...SEED,
        allocation: ALLOCATION,
      })
    ).rejects.toThrow(/Open the festival/);

    expect(writes).toHaveLength(0);
  });
});
