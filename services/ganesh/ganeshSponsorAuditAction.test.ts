import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A sponsorship audit records what actually happened (GS-092).
 *
 * `festivalAudit` hard-coded `action: "edited"`, so creation, promise,
 * confirmation, receipt and cancellation all wrote the same verb and the admin
 * audit screen rendered every one of them as "X edited a sponsorship" — a log
 * that recorded that something happened without recording what. Money moving
 * in was indistinguishable from a typo being fixed.
 *
 * These tests drive the real write functions rather than `festivalAudit`
 * directly, because the defect was never in the helper: it was that no call
 * site passed its own verb.
 */

type FakeRef = { path: string };
type Write = { path: string; data: Record<string, unknown> };

const writes: Write[] = [];
/** Status of the sponsorship the write reads before transitioning it. */
let sponsorshipStatus = "prospective";

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  getDoc: vi.fn(async (ref: FakeRef) => ({
    exists: () => true,
    ref,
    // A festival document must read as open or the writes refuse; a
    // sponsorship carries whatever status the test set.
    data: () => (ref.path.includes("/sponsorships/")
      ? { status: sponsorshipStatus, sponsoringType: "cash", amount: 500 }
      : { status: "open" }),
  })),
  getDocs: vi.fn(async () => ({ docs: [], size: 0, empty: true })),
  query: (...args: unknown[]) => args[0],
  where: (...args: unknown[]) => args,
  limit: (...args: unknown[]) => args,
  orderBy: (...args: unknown[]) => args,
  documentId: () => ({ __documentId: true }),
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
        exists: () => true,
        data: () => ({ status: sponsorshipStatus }),
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

import {
  cancelSponsorship,
  confirmSponsorship,
  promiseSponsorship,
} from "./ganeshSponsors";

const actor = { uid: "u-treasurer", displayName: "Treasurer" } as never;

function auditActions(): unknown[] {
  return writes.filter((w) => w.path.includes("/auditLogs/")).map((w) => w.data.action);
}

beforeEach(() => {
  idCounter = 0;
  writes.length = 0;
  sponsorshipStatus = "prospective";
});

describe("sponsorship audit actions", () => {
  it("records a promise as promised, not as an edit", async () => {
    await promiseSponsorship({} as never, actor, "pandal-1", "festival-1", "sp-1");

    expect(auditActions()).toEqual(["promised"]);
  });

  it("records a confirmation as confirmed", async () => {
    sponsorshipStatus = "promised";
    await confirmSponsorship({} as never, actor, "pandal-1", "festival-1", "sp-1");

    expect(auditActions()).toEqual(["confirmed"]);
  });

  it("records a cancellation as cancelled rather than voided", async () => {
    // Cancelling withdraws a promise that was never banked; voiding reverses a
    // recorded fact. The audit screen renders those differently on purpose.
    sponsorshipStatus = "promised";
    await cancelSponsorship({} as never, actor, "pandal-1", "festival-1", "sp-1", "Donor withdrew");

    expect(auditActions()).toEqual(["cancelled"]);
  });

  it("keeps the reason and the status change alongside the action", async () => {
    sponsorshipStatus = "promised";
    await cancelSponsorship({} as never, actor, "pandal-1", "festival-1", "sp-1", "Donor withdrew");

    const entry = writes.find((w) => w.path.includes("/auditLogs/"))?.data;
    expect(entry?.actorId).toBe("u-treasurer");
    expect(entry?.entityType).toBe("sponsorship");
    expect(entry?.reason).toBe("Donor withdrew");
    expect(entry?.oldValue).toEqual({ status: "promised" });
    expect(entry?.newValue).toEqual({ status: "cancelled" });
  });

  it("no longer writes 'edited' for a status transition", async () => {
    // The regression this guards: any of these transitions silently inheriting
    // the old default would make the audit log uninformative again.
    await promiseSponsorship({} as never, actor, "pandal-1", "festival-1", "sp-1");
    sponsorshipStatus = "promised";
    await confirmSponsorship({} as never, actor, "pandal-1", "festival-1", "sp-1");
    await cancelSponsorship({} as never, actor, "pandal-1", "festival-1", "sp-1");

    expect(auditActions()).not.toContain("edited");
  });
});
