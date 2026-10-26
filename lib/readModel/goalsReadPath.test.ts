import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SPENDLY-611 — Save Goals on the read path (`goals` switch). `firestore`
 * (the default) never connects; `supabase` reads the read model (here the
 * loopback, which round-trips rows exactly as the sync maps them) with an
 * overlay of newer Firestore events; a failure falls back for the session;
 * `shadow` serves Firestore and logs differences.
 */
let emulator: Record<string, { id: string; data: () => Record<string, unknown> }[]> = {};
const reads: string[] = [];
vi.mock("firebase/firestore", () => ({
  Timestamp: { fromMillis: (ms: number) => ({ __ts: ms, toMillis: () => ms }) },
  collection: (...args: unknown[]) => ({ path: args.slice(1).join("/") }),
  where: (...args: unknown[]) => ({ where: args }),
  orderBy: (...args: unknown[]) => ({ orderBy: args }),
  limit: (n: number) => ({ limit: n }),
  startAfter: (c: unknown) => ({ startAfter: c }),
  query: (ref: { path: string }) => ref,
  getDocs: async (ref: { path: string }) => {
    reads.push(ref.path);
    const coll = ref.path.split("/").at(-1) ?? "";
    return { metadata: { fromCache: false }, docs: emulator[coll] ?? [] };
  },
}));
vi.mock("@/lib/firestoreReadDebug", () => ({ logDirectRead: vi.fn() }));
vi.mock("@/lib/errors", () => ({ logWarning: vi.fn() }));
vi.mock("@/lib/readModelClient", () => ({ connectReadModel: vi.fn() }));

import type { GoalEvent } from "@/shared/types/goal";

import { goalCursorBelow } from "./goalSources";
import { compareGoalEventIds, readGoalEventsInRange, readGoalHistoryPage } from "./goalsReadPath";
import { createReadPath } from "./readPath";
import { setReadModelPathForTests } from "./screenReadPath";

const H = 3600 * 1000;
const NOW = Date.UTC(2026, 9, 26, 12);
const ev = (id: string, goalId: string, createdAtMs: number, amountDelta = 100): GoalEvent => ({
  id,
  goalId,
  type: "contribution",
  amountDelta,
  actorUid: "u1",
  createdAtMs,
});
const doc = (e: GoalEvent) => {
  const { id, ...data } = e;
  return { id, data: () => data };
};
const user = { uid: "u1", getIdToken: async () => "t", getIdTokenResult: async () => ({ claims: {} }) };
const conditions = (mode: string | undefined, extra: Record<string, unknown> = {}) => ({
  setting: mode ? { goals: mode, ...extra } : undefined,
  online: true,
  duress: false,
  localTestMode: true,
});
let log: ReturnType<typeof vi.fn>;

const inRange = { fromMs: NOW - 30 * 24 * H, toMs: NOW + H };
const firestoreEvents = [ev("fs1", "g1", NOW - 48 * H)];

beforeEach(() => {
  reads.length = 0;
  log = vi.fn();
  setReadModelPathForTests(createReadPath({ timeoutMs: 500, log, shadowLogIntervalMs: 0 }));
  emulator = {
    goalEvents: [
      doc(ev("a1", "g1", NOW - 10 * 24 * H)),
      doc(ev("a2", "g1", NOW - 5 * 24 * H, -50)),
      doc(ev("b1", "g2", NOW - 4 * 24 * H)),
      doc(ev("old", "g1", NOW - 90 * 24 * H)),
    ],
  };
});

describe("firestore mode (the default) changes nothing", () => {
  it("serves the bounded Firestore source, never connects and never overlays", async () => {
    const connect = vi.fn();
    const recent = vi.fn();
    const firestore = vi.fn(async () => ({ events: firestoreEvents, truncated: false }));
    for (const setting of [undefined, { goals: "firestore" }, { journal: "supabase" }]) {
      const r = await readGoalEventsInRange({
        db: {} as never, user, connect, conditions: { setting, online: true, duress: false }, ...inRange, firestore, recent,
      });
      expect(r).toMatchObject({ servedBy: "firestore", mode: "firestore", events: firestoreEvents });
      expect(await readGoalHistoryPage({ db: {} as never, user, connect, conditions: { setting, online: true, duress: false }, goalId: "g1", cursor: null, pageSize: 25 })).toBeNull();
    }
    expect(connect).not.toHaveBeenCalled();
    expect(recent).not.toHaveBeenCalled();
    expect(reads).toEqual([]);
  });
});

describe("supabase mode", () => {
  it("reads the range from the read model and overlays newer local events", async () => {
    const local = ev("fresh", "g1", NOW - H);
    const r = await readGoalEventsInRange({
      db: {} as never, user, conditions: conditions("supabase"), ...inRange,
      firestore: async () => { throw new Error("must not be used"); },
      recent: async () => [local],
      now: () => NOW,
    });
    expect(r.servedBy).toBe("supabase");
    expect(r.events.map((e) => e.id).sort()).toEqual(["a1", "a2", "b1", "fresh"]);
    expect([...r.pendingIds]).toEqual(["fresh"]);
    expect(r.events.find((e) => e.id === "a2")).toMatchObject({ amountDelta: -50, createdAtMs: NOW - 5 * 24 * H });
  });

  it("pages one goal's older history by keyset", async () => {
    const first = await readGoalHistoryPage({ db: {} as never, user, conditions: conditions("supabase"), goalId: "g1", cursor: null, pageSize: 2 });
    expect(first?.items.map((e) => e.id)).toEqual(["a2", "a1"]);
    expect(first?.exhausted).toBe(false);
    const second = await readGoalHistoryPage({ db: {} as never, user, conditions: conditions("supabase"), goalId: "g1", cursor: first!.next, pageSize: 2 });
    expect(second?.items.map((e) => e.id)).toEqual(["old"]);
    expect(second?.exhausted).toBe(true);
    const below = await readGoalHistoryPage({ db: {} as never, user, conditions: conditions("supabase"), goalId: "g1", cursor: goalCursorBelow(NOW - 5 * 24 * H - 1), pageSize: 10 });
    expect(below?.items.map((e) => e.id)).toEqual(["a1", "old"]);
  });

  it("a read-model failure falls back to Firestore, for the rest of the session", async () => {
    const firestore = vi.fn(async () => ({ events: firestoreEvents, truncated: false }));
    const c = conditions("supabase", { loopbackFail: true });
    const r = await readGoalEventsInRange({ db: {} as never, user, conditions: c, ...inRange, firestore, recent: async () => [] });
    expect(r.servedBy).toBe("firestore");
    expect(r.events).toEqual(firestoreEvents);
    expect(log).toHaveBeenCalledWith("readModel.fallback.goals", expect.anything());
    const again = await readGoalEventsInRange({ db: {} as never, user, conditions: conditions("supabase"), ...inRange, firestore, recent: async () => [] });
    expect(again.servedBy).toBe("firestore");
    expect(await readGoalHistoryPage({ db: {} as never, user, conditions: conditions("supabase"), goalId: "g1", cursor: null, pageSize: 2 })).toBeNull();
  });

  it("duress and offline sessions stay on Firestore", async () => {
    const firestore = vi.fn(async () => ({ events: [], truncated: false }));
    for (const c of [{ ...conditions("supabase"), duress: true }, { ...conditions("supabase"), online: false }]) {
      expect((await readGoalEventsInRange({ db: {} as never, user, conditions: c, ...inRange, firestore, recent: async () => [] })).servedBy).toBe("firestore");
    }
  });
});

describe("shadow mode", () => {
  it("serves Firestore and logs ids that differ, ignoring events younger than the SLO", async () => {
    const firestore = async () => ({ events: [...firestoreEvents, ev("young", "g1", NOW - 60 * 1000)], truncated: false });
    const r = await readGoalEventsInRange({ db: {} as never, user, conditions: conditions("shadow"), ...inRange, firestore, recent: async () => [], now: () => NOW });
    expect(r.servedBy).toBe("firestore");
    await vi.waitFor(() => expect(log).toHaveBeenCalled());
    const [event, detail] = log.mock.calls[0];
    expect(event).toBe("readModel.shadow.goals");
    expect(detail.differences).toEqual(expect.arrayContaining(["missing in read model: fs1", "only in read model: a1"]));
    expect(detail.differences.join(" ")).not.toContain("young");
  });

  it("compareGoalEventIds reports nothing when both sides agree", () => {
    const e = [ev("x", "g", NOW - 10 * H)];
    expect(compareGoalEventIds(e, e, NOW)).toEqual([]);
  });
});
