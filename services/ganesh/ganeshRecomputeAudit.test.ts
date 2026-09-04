import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `recomputeFestivalSummary` leaves a record of what it changed (GS-053).
 *
 * It rewrites every total on a festival and used to write no audit entry at
 * all, so an admin could silently rebuild the numbers with nothing showing it
 * had happened or who did it. It is also the documented repair path for the God
 * Fund location split, which makes it the write most likely to be reached for
 * when the figures already look wrong — exactly when a committee needs to see
 * what moved.
 */

type FakeRef = { path: string };
type Write = { path: string; data: Record<string, unknown> };

const writes: Write[] = [];
/** Ledger documents the recompute reads, keyed by collection name. */
const collections: Record<string, Array<Record<string, unknown>>> = {};
let storedSummary: Record<string, unknown> = {};

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  getDoc: vi.fn(async (ref: FakeRef) => ({
    exists: () => ref.path.includes("/summary/"),
    ref,
    data: () => storedSummary,
  })),
  getDocs: vi.fn(async (q: { path?: string } | FakeRef[]) => {
    const path = Array.isArray(q) ? String((q[0] as FakeRef)?.path ?? "") : String(q?.path ?? "");
    const name = path.split("/").filter(Boolean).at(-1) ?? "";
    const docs = (collections[name] ?? []).map((data, i) => ({
      id: `${name}-${i}`,
      ref: { path: `${path}/${name}-${i}` },
      data: () => data,
    }));
    return { docs, size: docs.length, empty: docs.length === 0 };
  }),
  query: (...args: unknown[]) => args[0],
  where: (...args: unknown[]) => args,
  limit: (...args: unknown[]) => args,
  orderBy: (...args: unknown[]) => args,
  startAfter: (...args: unknown[]) => args,
  documentId: () => ({ __documentId: true }),
  increment: (n: number) => ({ __increment: n }),
  deleteField: () => ({ __deleteField: true }),
  serverTimestamp: () => ({ __serverTimestamp: true }),
  arrayUnion: (...v: unknown[]) => ({ __arrayUnion: v }),
  arrayRemove: (...v: unknown[]) => ({ __arrayRemove: v }),
  writeBatch: () => ({
    set: (ref: FakeRef, data: Record<string, unknown>) => writes.push({ path: ref.path, data }),
    update: (ref: FakeRef, data: Record<string, unknown>) => writes.push({ path: ref.path, data }),
    commit: vi.fn(async () => undefined),
  }),
  runTransaction: vi.fn(async (_db: unknown, fn: (t: unknown) => Promise<unknown>) =>
    fn({
      get: async (ref: FakeRef) => ({
        exists: () => ref.path.includes("/summary/"),
        data: () => storedSummary,
      }),
      set: (ref: FakeRef, data: Record<string, unknown>) => writes.push({ path: ref.path, data }),
      update: (ref: FakeRef, data: Record<string, unknown>) => writes.push({ path: ref.path, data }),
    })
  ),
}));

vi.mock("@/lib/firestoreWrite", () => ({
  commitWrite: async (fn: () => Promise<unknown>) => fn(),
}));

let idCounter = 0;
vi.mock("@/lib/id", () => ({ newId: () => `id-${++idCounter}` }));

import { recomputeFestivalSummary } from "./ganeshWrites";

const actor = { uid: "u-admin", displayName: "Treasurer" } as never;

function auditEntry(): Record<string, unknown> | undefined {
  return writes.find((w) => w.path.includes("/auditLogs/"))?.data;
}

beforeEach(() => {
  idCounter = 0;
  writes.length = 0;
  storedSummary = {};
  for (const key of Object.keys(collections)) delete collections[key];
});

describe("recomputeFestivalSummary audit trail", () => {
  it("records which totals moved, and who moved them", async () => {
    // The stored summary claims 1,000 of chanda; the ledger holds 5,000.
    storedSummary = { chanda: 1000, collectionCount: 1 };
    collections.collections = [{ amount: 5000, paymentMethod: "cash" }];

    await recomputeFestivalSummary({} as never, actor, "pandal-1", "festival-1");

    const entry = auditEntry();
    expect(entry).toBeDefined();
    expect(entry?.actorId).toBe("u-admin");
    expect(entry?.action).toBe("adjusted");
    expect(entry?.entityType).toBe("summary");
    // The drift is visible in the trail, not just corrected silently.
    expect((entry?.oldValue as Record<string, number>).chanda).toBe(1000);
    expect((entry?.newValue as Record<string, number>).chanda).toBe(5000);
    expect(String(entry?.reason)).toContain("changed");
  });

  it("says so plainly when the recompute changed nothing", async () => {
    // The common case. An entry listing every unchanged total would bury the
    // one that did move, so only movers are recorded.
    //
    // The Cash bucket has to agree too, not just chanda: a summary holding
    // 5,000 of chanda with an empty Cash bucket is exactly the unbackfilled
    // state the God Fund location work addresses, and the recompute would
    // rightly classify it — which is a change.
    storedSummary = { chanda: 5000, collectionCount: 1, cash: 5000 };
    collections.collections = [{ amount: 5000, paymentMethod: "cash" }];

    await recomputeFestivalSummary({} as never, actor, "pandal-1", "festival-1");

    const entry = auditEntry();
    expect(entry).toBeDefined();
    expect(entry?.oldValue).toEqual({});
    expect(entry?.newValue).toEqual({});
    expect(String(entry?.reason)).toContain("already agreed");
  });

  it("writes the audit entry in the same transaction as the totals", async () => {
    storedSummary = { chanda: 0 };
    collections.collections = [{ amount: 250, paymentMethod: "upi" }];

    await recomputeFestivalSummary({} as never, actor, "pandal-1", "festival-1");

    // Both land through the transaction writer, so a failed rebuild cannot
    // leave an audit entry claiming a rebuild that did not happen.
    const summaryWrite = writes.find((w) => w.path.includes("/summary/"));
    expect(summaryWrite).toBeDefined();
    expect(auditEntry()).toBeDefined();
  });
});

describe("recompute status agreement (GS-072)", () => {
  it("treats a contribution with no status as promised, not as cash", async () => {
    // The recompute rolled its own predicate — "not cancelled and not
    // promised" — which counted an absent status as received, while
    // contributionStatusOf defaults it to promised. A statusless document was
    // invisible-as-promised in the UI and became cash the moment anyone
    // pressed "Recalculate from ledger".
    storedSummary = {};
    collections.contributions = [
      { kind: "money", amount: 5000, isCommitteeContribution: false },
    ];

    await recomputeFestivalSummary({} as never, actor, "pandal-1", "festival-1");

    const summary = writes.find((w) => w.path.includes("/summary/"))?.data as
      | Record<string, number>
      | undefined;
    expect(summary?.otherCashContributions).toBe(0);
  });

  it("still counts an explicitly received contribution as cash", async () => {
    storedSummary = {};
    collections.contributions = [
      { kind: "money", amount: 5000, status: "received", isCommitteeContribution: false },
    ];

    await recomputeFestivalSummary({} as never, actor, "pandal-1", "festival-1");

    const summary = writes.find((w) => w.path.includes("/summary/"))?.data as
      | Record<string, number>
      | undefined;
    expect(summary?.otherCashContributions).toBe(5000);
  });
});
