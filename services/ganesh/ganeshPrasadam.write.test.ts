import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Prasadam register writers (KAN-126).
 *
 * The properties worth proving here are the ones the ticket's edge cases turn
 * on and the rules cannot express:
 *
 * - Two providers in one session produce two documents, and neither write
 *   references the other. That is what makes concurrent recording safe without
 *   a transaction or a lock.
 * - A replayed `clientOpId` writes nothing at all — not a second entry, and not
 *   a second activity row either.
 * - Nothing this service writes carries money, on any path.
 * - A cancellation is terminal and leaves a complete audit trail.
 *
 * The fake batch below records every staged write, so the assertions are about
 * exactly what would reach Firestore.
 */

type FakeRef = { path: string };
type Write = { path: string; data: Record<string, unknown> };

const writes: Write[] = [];
let docs: Record<string, Record<string, unknown> | undefined> = {};
let festivalStatus = "open";

const PANDAL = "pandal-1";
const FESTIVAL = "festival-1";
const FESTIVAL_PATH = `pandals/${PANDAL}/festivals/${FESTIVAL}`;
const ENTRIES = `${FESTIVAL_PATH}/prasadamEntries`;

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  getDoc: vi.fn(async (ref: FakeRef) => {
    if (ref.path === FESTIVAL_PATH) {
      return {
        exists: () => true,
        ref,
        data: () => ({ status: festivalStatus, name: "Ganesh Utsav Test", year: 2026 }),
      };
    }
    return {
      exists: () => docs[ref.path] !== undefined,
      ref,
      data: () => docs[ref.path],
    };
  }),
  serverTimestamp: () => ({ __serverTimestamp: true }),
  writeBatch: () => ({
    set: (ref: FakeRef, data: Record<string, unknown>) =>
      writes.push({ path: ref.path, data }),
    update: (ref: FakeRef, data: Record<string, unknown>) =>
      writes.push({ path: ref.path, data }),
    commit: vi.fn(async () => undefined),
  }),
}));

let idCounter = 0;
vi.mock("@/lib/id", () => ({ newId: () => `generated-${++idCounter}` }));

vi.mock("@/lib/firestoreWrite", () => ({
  commitWrite: vi.fn(async (run: () => Promise<unknown>) => {
    await run();
    return { status: "acked" };
  }),
}));

import {
  cancelPrasadamEntry,
  createPrasadamEntry,
  updatePrasadamEntry,
} from "./ganeshPrasadam";

const ACTOR = { uid: "u-recorder", displayName: "Recorder" };
const db = {} as never;

const INPUT = {
  date: "2026-09-16",
  session: "morning" as const,
  providerName: "Ravi",
  prasadamType: "sweet" as const,
  prasadamLabel: "Laddu",
  quantity: 500,
  unit: "pieces" as const,
  clientOpId: "op-1",
};

/** Every key that would make this document look like money. */
const MONEY_KEYS = [
  "amount",
  "totalAmount",
  "godFundAmount",
  "personalAmount",
  "sponsoredAmount",
  "estimatedValue",
  "ledgerType",
  "purposeType",
  "purposeCategory",
];

function entryWrites() {
  return writes.filter((w) => w.path.startsWith(ENTRIES));
}
function activityWrites() {
  return writes.filter((w) => w.path.includes("/activity/"));
}
function auditWrites() {
  return writes.filter((w) => w.path.includes("/auditLogs/"));
}

beforeEach(() => {
  writes.length = 0;
  docs = {};
  festivalStatus = "open";
  idCounter = 0;
});

describe("recording an offering", () => {
  it("writes the entry, one activity row and one audit row in a single batch", async () => {
    const id = await createPrasadamEntry(db, ACTOR, PANDAL, FESTIVAL, INPUT);

    expect(id).toBe("op-1");
    expect(entryWrites()).toHaveLength(1);
    expect(activityWrites()).toHaveLength(1);
    expect(auditWrites()).toHaveLength(1);

    expect(entryWrites()[0].path).toBe(`${ENTRIES}/op-1`);
    expect(entryWrites()[0].data).toMatchObject({
      date: "2026-09-16",
      session: "morning",
      providerName: "Ravi",
      quantity: 500,
      unit: "pieces",
      status: "recorded",
      voided: false,
      createdBy: ACTOR.uid,
      updatedBy: ACTOR.uid,
    });
    expect(auditWrites()[0].data).toMatchObject({
      action: "created",
      entityType: "prasadamEntry",
      entityId: "op-1",
    });
  });

  it("uses the clientOpId as the document id", async () => {
    await createPrasadamEntry(db, ACTOR, PANDAL, FESTIVAL, {
      ...INPUT,
      clientOpId: "form-abc",
    });
    expect(entryWrites()[0].path).toBe(`${ENTRIES}/form-abc`);
  });

  it("trims the provider name and drops blank optional fields", async () => {
    await createPrasadamEntry(db, ACTOR, PANDAL, FESTIVAL, {
      ...INPUT,
      providerName: "  Ravi  ",
      mobile: "   ",
      notes: "",
    });
    const data = entryWrites()[0].data;
    expect(data.providerName).toBe("Ravi");
    expect(data).not.toHaveProperty("mobile");
    expect(data).not.toHaveProperty("notes");
  });

  it("keeps the provider snapshot alongside a link", async () => {
    await createPrasadamEntry(db, ACTOR, PANDAL, FESTIVAL, {
      ...INPUT,
      providerId: "h-1",
      providerSource: "household",
      mobile: "9000000000",
    });
    expect(entryWrites()[0].data).toMatchObject({
      providerId: "h-1",
      providerSource: "household",
      providerName: "Ravi",
      mobile: "9000000000",
    });
  });

  it("records a unitLabel only when the unit is 'other'", async () => {
    await createPrasadamEntry(db, ACTOR, PANDAL, FESTIVAL, {
      ...INPUT,
      unit: "other",
      unitLabel: " dabba ",
    });
    expect(entryWrites()[0].data.unitLabel).toBe("dabba");

    writes.length = 0;
    await createPrasadamEntry(db, ACTOR, PANDAL, FESTIVAL, {
      ...INPUT,
      clientOpId: "op-2",
      unit: "kg",
      unitLabel: "ignored",
    });
    expect(entryWrites()[0].data).not.toHaveProperty("unitLabel");
  });
});

describe("multiple providers per session", () => {
  it("writes two independent documents, neither referencing the other", async () => {
    await createPrasadamEntry(db, ACTOR, PANDAL, FESTIVAL, {
      ...INPUT,
      providerName: "Ravi",
      clientOpId: "op-a",
    });
    await createPrasadamEntry(db, ACTOR, PANDAL, FESTIVAL, {
      ...INPUT,
      providerName: "Suresh",
      clientOpId: "op-b",
    });

    const paths = entryWrites().map((w) => w.path);
    expect(paths).toEqual([`${ENTRIES}/op-a`, `${ENTRIES}/op-b`]);

    // Nothing either write touches could clobber the other: neither payload
    // mentions the other entry, neither carries a session count, and no shared
    // container or allocator document is written at all.
    expect(JSON.stringify(entryWrites()[0].data)).not.toContain("op-b");
    expect(JSON.stringify(entryWrites()[1].data)).not.toContain("op-a");
    expect(entryWrites()[0].data).not.toHaveProperty("entryCount");
    expect(entryWrites()[1].data).not.toHaveProperty("entryCount");
    expect(writes.every((w) => !w.path.includes("/summary/"))).toBe(true);
    expect(writes.every((w) => !w.path.includes("prasadamSessions"))).toBe(true);
  });

  it("keeps the same person's morning and evening entries apart", async () => {
    await createPrasadamEntry(db, ACTOR, PANDAL, FESTIVAL, {
      ...INPUT,
      session: "morning",
      clientOpId: "op-m",
    });
    await createPrasadamEntry(db, ACTOR, PANDAL, FESTIVAL, {
      ...INPUT,
      session: "evening",
      clientOpId: "op-e",
    });
    expect(entryWrites().map((w) => w.data.session)).toEqual(["morning", "evening"]);
  });
});

describe("duplicate submission", () => {
  it("writes nothing at all when the clientOpId has already been used", async () => {
    docs[`${ENTRIES}/op-1`] = { providerName: "Ravi", status: "recorded" };

    const id = await createPrasadamEntry(db, ACTOR, PANDAL, FESTIVAL, INPUT);

    expect(id).toBe("op-1");
    // Not just "no second entry" — no second activity or audit row either.
    expect(writes).toHaveLength(0);
  });

  it("still records when the existence check cannot be answered offline", async () => {
    // The duplicate check is a read, and a read can fail with no signal. It
    // must degrade to "write it" rather than losing the volunteer's entry --
    // a duplicate is recoverable, a silently dropped offering is not.
    const { getDoc } = await import("firebase/firestore");
    const real = vi.mocked(getDoc).getMockImplementation()!;
    vi.mocked(getDoc).mockImplementation(async (ref: any) => {
      if (ref.path.startsWith(ENTRIES)) throw new Error("client is offline");
      return real(ref);
    });

    const id = await createPrasadamEntry(db, ACTOR, PANDAL, FESTIVAL, INPUT);

    vi.mocked(getDoc).mockImplementation(real);
    expect(id).toBe("op-1");
    expect(entryWrites()).toHaveLength(1);
  });
});

describe("no path writes money", () => {
  it("creates without any money-shaped key", async () => {
    await createPrasadamEntry(db, ACTOR, PANDAL, FESTIVAL, INPUT);
    for (const write of writes) {
      for (const key of MONEY_KEYS) {
        expect(write.data).not.toHaveProperty(key);
      }
    }
  });

  it("puts no amount on the activity row", async () => {
    await createPrasadamEntry(db, ACTOR, PANDAL, FESTIVAL, INPUT);
    expect(activityWrites()[0].data).not.toHaveProperty("amount");
    expect(activityWrites()[0].data).not.toHaveProperty("estimatedValue");
  });

  it("never touches the summary or any ledger subcollection", async () => {
    await createPrasadamEntry(db, ACTOR, PANDAL, FESTIVAL, INPUT);
    docs[`${ENTRIES}/op-1`] = { status: "recorded", providerName: "Ravi", session: "morning" };
    await cancelPrasadamEntry(db, ACTOR, PANDAL, FESTIVAL, {
      entryId: "op-1",
      reason: "Duplicate",
    });

    for (const write of writes) {
      expect(write.path).not.toContain("/summary/");
      expect(write.path).not.toContain("/collections/");
      expect(write.path).not.toContain("/contributions/");
      expect(write.path).not.toContain("/expenses/");
    }
  });
});

describe("editing", () => {
  beforeEach(() => {
    docs[`${ENTRIES}/op-1`] = {
      status: "recorded",
      providerName: "Ravi",
      quantity: 500,
      unit: "pieces",
      session: "morning",
      date: "2026-09-16",
    };
  });

  it("writes the corrected fields and an audit row carrying both values", async () => {
    await updatePrasadamEntry(db, ACTOR, PANDAL, FESTIVAL, "op-1", {
      ...INPUT,
      providerName: "Ravi Kumar",
      quantity: 6,
      unit: "kg",
    });

    expect(entryWrites()[0].data).toMatchObject({
      providerName: "Ravi Kumar",
      quantity: 6,
      unit: "kg",
    });
    expect(auditWrites()[0].data).toMatchObject({
      action: "edited",
      entityId: "op-1",
      oldValue: { providerName: "Ravi", quantity: 500, unit: "pieces" },
      newValue: { providerName: "Ravi Kumar", quantity: 6, unit: "kg" },
    });
  });

  it("never writes date or session", async () => {
    // Relocating an entry is a cancel and a re-record, so a day's counts stay
    // reconcilable against its own history.
    await updatePrasadamEntry(db, ACTOR, PANDAL, FESTIVAL, "op-1", {
      ...INPUT,
      date: "2026-09-20",
      session: "evening",
    });
    expect(entryWrites()[0].data).not.toHaveProperty("date");
    expect(entryWrites()[0].data).not.toHaveProperty("session");
  });

  it("clears an emptied optional field instead of keeping the old value", async () => {
    await updatePrasadamEntry(db, ACTOR, PANDAL, FESTIVAL, "op-1", {
      ...INPUT,
      notes: "",
      mobile: undefined,
    });
    expect(entryWrites()[0].data.notes).toBe("");
    expect(entryWrites()[0].data.mobile).toBe("");
  });

  it("refuses to edit a cancelled entry", async () => {
    docs[`${ENTRIES}/op-1`] = { status: "cancelled", voided: true, providerName: "Ravi" };
    await expect(
      updatePrasadamEntry(db, ACTOR, PANDAL, FESTIVAL, "op-1", INPUT)
    ).rejects.toThrow(/cancelled/i);
    expect(writes).toHaveLength(0);
  });

  it("refuses to edit an entry that is gone", async () => {
    await expect(
      updatePrasadamEntry(db, ACTOR, PANDAL, FESTIVAL, "missing", INPUT)
    ).rejects.toThrow(/no longer/i);
  });

  it("refuses an invalid edit before writing anything", async () => {
    await expect(
      updatePrasadamEntry(db, ACTOR, PANDAL, FESTIVAL, "op-1", { ...INPUT, quantity: 0 })
    ).rejects.toThrow();
    expect(writes).toHaveLength(0);
  });
});

describe("cancelling", () => {
  beforeEach(() => {
    docs[`${ENTRIES}/op-1`] = {
      status: "recorded",
      providerName: "Ravi",
      session: "morning",
    };
  });

  it("sets the status and the full void trail, and audits the reason", async () => {
    await cancelPrasadamEntry(db, ACTOR, PANDAL, FESTIVAL, {
      entryId: "op-1",
      reason: "Recorded twice",
    });

    expect(entryWrites()[0].data).toMatchObject({
      status: "cancelled",
      cancelReason: "Recorded twice",
      voided: true,
      voidReason: "Recorded twice",
      voidedBy: ACTOR.uid,
      updatedBy: ACTOR.uid,
    });
    expect(auditWrites()[0].data).toMatchObject({
      action: "cancelled",
      entityId: "op-1",
      reason: "Recorded twice",
    });
    expect(activityWrites()).toHaveLength(1);
  });

  it("never deletes the document", async () => {
    await cancelPrasadamEntry(db, ACTOR, PANDAL, FESTIVAL, {
      entryId: "op-1",
      reason: "Duplicate",
    });
    // A cancellation is an update, so the row survives for the register.
    expect(entryWrites()[0].data.status).toBe("cancelled");
  });

  it("requires a reason", async () => {
    await expect(
      cancelPrasadamEntry(db, ACTOR, PANDAL, FESTIVAL, { entryId: "op-1", reason: "  " })
    ).rejects.toThrow(/why/i);
    expect(writes).toHaveLength(0);
  });

  it("refuses a second cancellation", async () => {
    docs[`${ENTRIES}/op-1`] = { status: "cancelled", voided: true, providerName: "Ravi" };
    await expect(
      cancelPrasadamEntry(db, ACTOR, PANDAL, FESTIVAL, { entryId: "op-1", reason: "Again" })
    ).rejects.toThrow(/already/i);
    expect(writes).toHaveLength(0);
  });
});

describe("festival state", () => {
  it("refuses to record into a closed festival", async () => {
    festivalStatus = "closed";
    await expect(
      createPrasadamEntry(db, ACTOR, PANDAL, FESTIVAL, INPUT)
    ).rejects.toThrow();
    expect(writes).toHaveLength(0);
  });
});
