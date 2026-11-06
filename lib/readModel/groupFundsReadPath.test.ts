import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SPENDLY-685 — Group Funds history on the read path (`groupFundHistory` switch).
 * `firestore` and `shadow` never page from the read model; `supabase` pages
 * one fund's older events from it (here the loopback, which round-trips rows
 * exactly as the sync maps them); a failure falls back for the session.
 */
let emulator: Record<string, { id: string; data: () => Record<string, unknown> }[]> = {};
const reads: string[] = [];
vi.mock("firebase/firestore", () => ({
  Timestamp: { fromMillis: (ms: number) => ({ __ts: ms, toMillis: () => ms }) },
  collection: (...args: unknown[]) => ({ path: args.slice(1).join("/") }),
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

import type { GroupFundEvent } from "@/shared/types/groupFund";

import { groupFundCursorBelow, groupFundEventsPageFrom } from "./groupFundSources";
import {
  compareGroupFundEventIds,
  readGroupFundHistoryPage,
  readGroupFundMonth,
  shadowCompareGroupFundHistoryPage,
  shadowCompareGroupFundMonth,
} from "./groupFundsReadPath";
import { createReadPath } from "./readPath";
import { setReadModelPathForTests } from "./screenReadPath";

const H = 3600 * 1000;
const NOW = Date.UTC(2026, 10, 6, 12);
const ev = (id: string, fundId: string, createdAtMs: number, amount = 6000): GroupFundEvent => ({
  id,
  fundId,
  kind: "contribution",
  amount,
  purposeId: "appu",
  memberId: "m1",
  date: "2026-11-05",
  accountId: "hdfc",
  actorUid: "u1",
  createdAtMs,
});
const doc = (e: GroupFundEvent) => {
  const { id, ...data } = e;
  return { id, data: () => data };
};
const user = { uid: "u1", getIdToken: async () => "t", getIdTokenResult: async () => ({ claims: {} }) };
const conditions = (mode: string | undefined, extra: Record<string, unknown> = {}) => ({
  setting: mode ? { groupFundHistory: mode, ...extra } : undefined,
  online: true,
  duress: false,
  localTestMode: true,
});
const page = (mode: string | undefined, cursor: Parameters<typeof readGroupFundHistoryPage>[0]["cursor"], pageSize = 2, extra = {}) =>
  readGroupFundHistoryPage({ db: {} as never, user, conditions: conditions(mode, extra), fundId: "f1", cursor, pageSize });
let log: ReturnType<typeof vi.fn>;

beforeEach(() => {
  reads.length = 0;
  log = vi.fn();
  setReadModelPathForTests(createReadPath({ timeoutMs: 500, log, shadowLogIntervalMs: 0 }));
  emulator = {
    groupFundEvents: [
      doc(ev("a1", "f1", NOW - 10 * 24 * H)),
      doc(ev("a2", "f1", NOW - 5 * 24 * H, 100)),
      doc(ev("b1", "f2", NOW - 4 * 24 * H)),
      doc(ev("a0", "f1", NOW - 90 * 24 * H)),
    ],
  };
});

describe("firestore and shadow modes never page from the read model", () => {
  it("returns null (use the Firestore cursor) without connecting or reading", async () => {
    const connect = vi.fn();
    // `groupFunds` (the fund list's collection switch) never moves history paging.
    for (const setting of [undefined, { groupFundHistory: "firestore" }, { groupFundHistory: "shadow" }, { groupFunds: "supabase" }]) {
      expect(
        await readGroupFundHistoryPage({
          db: {} as never,
          user,
          connect,
          conditions: { setting, online: true, duress: false },
          fundId: "f1",
          cursor: null,
          pageSize: 25,
        })
      ).toBeNull();
    }
    expect(connect).not.toHaveBeenCalled();
    expect(reads).toEqual([]);
  });
});

describe("supabase mode", () => {
  it("pages one fund's older history by keyset, newest first", async () => {
    const first = await page("supabase", null);
    expect(first?.items.map((e) => e.id)).toEqual(["a2", "a1"]);
    expect(first?.exhausted).toBe(false);
    const second = await page("supabase", first!.next);
    expect(second?.items.map((e) => e.id)).toEqual(["a0"]);
    expect(second?.exhausted).toBe(true);
    const below = await page("supabase", groupFundCursorBelow(NOW - 5 * 24 * H - 1), 10);
    expect(below?.items.map((e) => e.id)).toEqual(["a1", "a0"]);
    // Rows come back as the app's events, amounts intact.
    expect(first?.items[0]).toMatchObject({ fundId: "f1", amount: 100, createdAtMs: NOW - 5 * 24 * H });
  });

  it("a read-model failure falls back to Firestore for the rest of the session", async () => {
    expect(await page("supabase", null, 2, { loopbackFail: true })).toBeNull();
    expect(log).toHaveBeenCalledWith("readModel.fallback.groupFundHistory", expect.anything());
    expect(await page("supabase", null)).toBeNull();
  });

  it("duress and offline sessions stay on Firestore", async () => {
    for (const c of [{ ...conditions("supabase"), duress: true }, { ...conditions("supabase"), online: false }]) {
      expect(
        await readGroupFundHistoryPage({ db: {} as never, user, conditions: c, fundId: "f1", cursor: null, pageSize: 2 })
      ).toBeNull();
    }
  });
});

describe("groupFundEventsPageFrom", () => {
  it("drops rows whose document isn't a valid event, but pages by the raw rows", () => {
    const good = { fundId: "f1", kind: "contribution", amount: 10, purposeId: "a", date: "2026-11-01", actorUid: "u", createdAtMs: 2 };
    const rows = [
      { doc_id: "ok", created_at: "2026-11-02T00:00:00.000Z", doc: good },
      { doc_id: "bad", created_at: "2026-11-01T00:00:00.000Z", doc: { ...good, amount: "10" } },
    ];
    const page = groupFundEventsPageFrom(rows, 2);
    expect(page.items.map((e) => e.id)).toEqual(["ok"]);
    expect(page).toMatchObject({ exhausted: false, next: { createdAt: "2026-11-01T00:00:00.000Z", docId: "bad" } });
  });

  it("returns a cursor only on a full page", () => {
    const rows = [{ doc_id: "x", created_at: "2026-11-01T00:00:00.000Z", doc: { fundId: "f1" } }];
    expect(groupFundEventsPageFrom(rows, 1)).toMatchObject({ exhausted: false, next: { createdAt: "2026-11-01T00:00:00.000Z", docId: "x" } });
    expect(groupFundEventsPageFrom(rows, 2)).toMatchObject({ exhausted: true, next: null });
  });
});

describe("month view (SPENDLY-688)", () => {
  const month = (mode: string | undefined, extra = {}) =>
    readGroupFundMonth({ db: {} as never, user, conditions: conditions(mode, extra), fundId: "f1", period: "2026-11" });

  it("reads one fund's month from the read model in supabase mode", async () => {
    emulator.groupFundEvents.push(
      doc({ ...ev("n1", "f1", NOW - H), period: "2026-11" }),
      doc({ ...ev("n2", "f1", NOW - 2 * H), period: "2026-11", memberId: "m2" }),
      doc({ ...ev("o1", "f1", NOW - 40 * 24 * H), period: "2026-10" }),
      doc({ ...ev("x1", "f2", NOW - H), period: "2026-11" })
    );
    const rows = await month("supabase");
    expect(rows?.map((e) => e.id).sort()).toEqual(["n1", "n2"]);
  });

  it("other modes never connect; a failure falls back for the session", async () => {
    expect(await month(undefined)).toBeNull();
    expect(await month("shadow")).toBeNull();
    expect(reads).toEqual([]);
    expect(await month("supabase", { loopbackFail: true })).toBeNull();
    expect(await month("supabase")).toBeNull();
  });
});

describe("shadow mode compares, Firestore still serves (CodeRabbit #263)", () => {
  it("logs ids that differ for a month, ignoring events younger than the sync SLO", async () => {
    emulator.groupFundEvents.push(doc({ ...ev("m1", "f1", NOW - 48 * H), period: "2026-11" }));
    const firestoreEvents = [{ ...ev("fs-only", "f1", NOW - 48 * H), period: "2026-11" }, { ...ev("young", "f1", NOW - 60 * 1000), period: "2026-11" }];
    const ran = await shadowCompareGroupFundMonth({
      db: {} as never, user, conditions: conditions("shadow"), fundId: "f1", period: "2026-11", firestoreEvents, now: () => NOW,
    });
    expect(ran).toBe(true);
    await vi.waitFor(() => expect(log).toHaveBeenCalled());
    const [event, detail] = log.mock.calls[0];
    expect(event).toBe("readModel.shadow.groupFundHistory");
    expect(detail.differences).toEqual(expect.arrayContaining(["missing in read model: fs-only", "only in read model: m1"]));
    expect(detail.differences.join(" ")).not.toContain("young");
  });

  it("compares an older page over the same time span only", async () => {
    const ran = await shadowCompareGroupFundHistoryPage({
      db: {} as never, user, conditions: conditions("shadow"), fundId: "f1",
      aboveMs: NOW - 4 * 24 * H, firestoreItems: [ev("a2", "f1", NOW - 5 * 24 * H, 100), ev("a1", "f1", NOW - 10 * 24 * H)], now: () => NOW,
    });
    expect(ran).toBe(true);
    // a0 (90 days old) is outside the page's span, so it isn't a difference; both pages agree.
    await new Promise((r) => setTimeout(r, 50));
    expect(log).not.toHaveBeenCalledWith("readModel.shadow.groupFundHistory", expect.anything());
  });

  it("does nothing outside shadow mode", async () => {
    for (const mode of [undefined, "supabase"]) {
      expect(
        await shadowCompareGroupFundMonth({ db: {} as never, user, conditions: conditions(mode), fundId: "f1", period: "2026-11", firestoreEvents: [] })
      ).toBe(false);
    }
  });

  it("compareGroupFundEventIds reports nothing when both sides agree", () => {
    const e = [ev("x", "f1", NOW - 10 * H)];
    expect(compareGroupFundEventIds(e, e, NOW)).toEqual([]);
  });
});
