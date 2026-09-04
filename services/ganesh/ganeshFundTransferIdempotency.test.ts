import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A retried fund transfer is the same transfer (GS-085).
 *
 * Transfer ids were minted with `newId()` before `runTransaction`, so
 * Firestore's own internal retries reused one id and were safe. A *user* retry
 * after an apparent timeout was not: it produced a second, distinct transfer.
 * Balances stayed self-consistent — the second transaction re-read the
 * post-first balance — so this was duplication needing manual correction, not
 * corruption. The only guard was a Button's `loading` state, which does not
 * survive leaving the screen.
 */

type FakeRef = { path: string };
type Write = { path: string; data: Record<string, unknown> };

const writes: Write[] = [];
/** Documents that already exist, by path. */
const existing = new Set<string>();
let fundDoc: Record<string, unknown> = {};

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  getDoc: vi.fn(async (ref: FakeRef) => ({
    exists: () => true,
    ref,
    data: () => ({ status: "open", name: "Ganesh Utsav Test" }),
  })),
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
  runTransaction: vi.fn(async (_db: unknown, fn: (t: unknown) => Promise<unknown>) =>
    fn({
      get: async (ref: FakeRef) => ({
        // The fund document and the festival exist; a transfer document only
        // exists once this run has written it, which is what the
        // deduplication check reads.
        exists: () =>
          ref.path === "pandals/pandal-1/permanentFund/current"
          || ref.path.includes("/festivals/")
          || existing.has(ref.path),
        ref,
        data: () =>
          ref.path === "pandals/pandal-1/permanentFund/current"
            ? fundDoc
            : { status: "open", name: "Ganesh Utsav Test" },
      }),
      set: (ref: FakeRef, data: Record<string, unknown>) => {
        writes.push({ path: ref.path, data });
        existing.add(ref.path);
      },
      update: (ref: FakeRef, data: Record<string, unknown>) =>
        writes.push({ path: ref.path, data }),
    })
  ),
}));

vi.mock("@/lib/firestoreWrite", () => ({
  commitWrite: async (fn: () => Promise<unknown>) => fn(),
}));

let idCounter = 0;
vi.mock("@/lib/id", () => ({ newId: () => `generated-${++idCounter}` }));

import { transferPermanentToFestival } from "./ganeshPermanentFund";

const actor = { uid: "u-treasurer", displayName: "Treasurer" } as never;

function transferWrites(): Write[] {
  return writes.filter((w) => w.path.includes("permanentFundTransactions"));
}

beforeEach(() => {
  idCounter = 0;
  writes.length = 0;
  existing.clear();
  fundDoc = { total: 50_000, cash: 50_000 };
});

const INPUT = {
  amount: 5_000,
  location: "cash" as const,
  festivalName: "Ganesh Utsav Test",
};

describe("transferPermanentToFestival idempotency", () => {
  it("records one transfer for a single call", async () => {
    await transferPermanentToFestival({} as never, actor, "pandal-1", "festival-1", {
      ...INPUT,
      clientOpId: "op-abc",
    });

    expect(transferWrites()).toHaveLength(1);
  });

  it("does not record a second transfer when the same key is retried", async () => {
    // The user tapped again after an apparent timeout on a transfer that had
    // in fact landed.
    await transferPermanentToFestival({} as never, actor, "pandal-1", "festival-1", {
      ...INPUT,
      clientOpId: "op-abc",
    });
    await transferPermanentToFestival({} as never, actor, "pandal-1", "festival-1", {
      ...INPUT,
      clientOpId: "op-abc",
    });

    expect(transferWrites()).toHaveLength(1);
  });

  it("still records two genuinely distinct transfers of the same amount", async () => {
    // The other half of the acceptance criteria: deduplication must not
    // swallow a second, real transfer that happens to match the first.
    await transferPermanentToFestival({} as never, actor, "pandal-1", "festival-1", {
      ...INPUT,
      clientOpId: "op-one",
    });
    await transferPermanentToFestival({} as never, actor, "pandal-1", "festival-1", {
      ...INPUT,
      clientOpId: "op-two",
    });

    expect(transferWrites()).toHaveLength(2);
  });

  it("uses the key as the document id, so the repeat can be recognised", async () => {
    await transferPermanentToFestival({} as never, actor, "pandal-1", "festival-1", {
      ...INPUT,
      clientOpId: "op-abc",
    });

    expect(transferWrites()[0]?.path.endsWith("/op-abc")).toBe(true);
  });

  it("derives the sibling documents from the key rather than minting new ids", async () => {
    // Otherwise a retry that got part-way through once could leave orphan
    // opening-fund or festival-transfer rows behind.
    await transferPermanentToFestival({} as never, actor, "pandal-1", "festival-1", {
      ...INPUT,
      clientOpId: "op-abc",
    });

    const paths = writes.map((w) => w.path);
    expect(paths.some((path) => path.includes("op-abc-opening"))).toBe(true);
    expect(paths.some((path) => path.includes("op-abc-festival"))).toBe(true);
  });

  it("keeps working with no key, for a caller that supplies none", async () => {
    // Backwards compatible: without a key each call is a fresh transfer, which
    // is exactly the old behaviour.
    await transferPermanentToFestival({} as never, actor, "pandal-1", "festival-1", INPUT);
    await transferPermanentToFestival({} as never, actor, "pandal-1", "festival-1", INPUT);

    expect(transferWrites()).toHaveLength(2);
  });
});
