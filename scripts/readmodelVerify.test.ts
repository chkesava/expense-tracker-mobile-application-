import { describe, expect, it } from "vitest";

import { countReads, renderVerifySummary, runVerify, type VerifyRecord, type VerifySink, type VerifySource } from "./lib/readmodelVerifyCore";

const T0 = Date.UTC(2026, 9, 23, 21, 0);

function setup(firestore: Record<string, Record<string, number>>, model: { uid: string; collection: string; live: number }[], reads24h = 0, purged: string[] = []) {
  const recorded: { uid: string; collection: string; sourceCount: number; modelCount: number }[] = [];
  const runs: VerifyRecord[] = [];
  const counted: string[] = [];
  const source: VerifySource = {
    async listUserIds() {
      return Object.keys(firestore);
    },
    async count(uid, collection) {
      counted.push(`${uid}/${collection}`);
      return firestore[uid]?.[collection] ?? 0;
    },
  };
  const sink: VerifySink = {
    async readsUsedSince() {
      return reads24h;
    },
    async liveCounts() {
      return model;
    },
    async purgedUids(uids) {
      return new Set(uids.filter((uid) => purged.includes(uid)));
    },
    async recordCounts(uid, collection, sourceCount, modelCount) {
      recorded.push({ uid, collection, sourceCount, modelCount });
    },
    async startRun() {
      return 1;
    },
    async finishRun(_id, record) {
      runs.push(record);
    },
  };
  return { source, sink, recorded, runs, counted };
}

const opts = { maxReads: 1000, maxReadsPerDay: 12_000, now: () => T0 };

describe("read-model count parity (SPENDLY-509)", () => {
  it("skips an erased account whose Firestore documents still exist: no reads, no mismatch (SPENDLY-520)", async () => {
    const s = setup({ alice: { expenses: 1 }, bob: { expenses: 5 } }, [{ uid: "alice", collection: "expenses", live: 1 }], 0, ["bob"]);
    const r = await runVerify(s.source, s.sink, opts);
    expect(r.status).toBe("succeeded");
    expect(r.mismatches).toBe(0);
    expect(r.notes.purgedSkipped).toBe(1);
    expect(s.counted.some((c) => c.startsWith("bob/"))).toBe(false);
  });

  it("passes when every (user, collection) count matches, and records both counts", async () => {
    const s = setup(
      { alice: { expenses: 3, categories: 2 }, bob: { expenses: 1 } },
      [
        { uid: "alice", collection: "expenses", live: 3 },
        { uid: "alice", collection: "categories", live: 2 },
        { uid: "bob", collection: "expenses", live: 1 },
      ]
    );
    const r = await runVerify(s.source, s.sink, opts);
    expect(r.status).toBe("succeeded");
    expect(r.mismatches).toBe(0);
    expect(r.byCollection.find((c) => c.collection === "expenses")).toEqual({ collection: "expenses", firestore: 4, model: 4, mismatchedUsers: 0 });
    expect(s.recorded).toContainEqual({ uid: "alice", collection: "categories", sourceCount: 2, modelCount: 2 });
    // 2 users × 12 collections (Wave 1 + SPENDLY-609 goals), every pair recorded.
    expect(s.recorded).toHaveLength(24);
  });

  it("fails on a missing row (e.g. deleted by hand in Postgres), naming the collection", async () => {
    const lines: string[] = [];
    const s = setup({ alice: { expenses: 3 } }, [{ uid: "alice", collection: "expenses", live: 2 }]);
    const r = await runVerify(s.source, s.sink, { ...opts, log: (l) => lines.push(l) });
    expect(r.status).toBe("failed");
    expect(r.mismatches).toBe(1);
    expect(lines.join("\n")).toMatch(/expenses ×1/);
    expect(lines.join("\n")).not.toContain("alice");
    expect(s.runs[0].notes).toMatchObject({ mismatches: 1 });
  });

  it("fails on an extra row (a hard delete not yet tombstoned)", async () => {
    const s = setup({ alice: { accounts: 1 } }, [{ uid: "alice", collection: "accounts", live: 2 }]);
    expect((await runVerify(s.source, s.sink, opts)).status).toBe("failed");
  });

  it("never counts a duress tree", async () => {
    const s = setup({ alice: { expenses: 1 }, alice_duress: { expenses: 5 } }, [{ uid: "alice", collection: "expenses", live: 1 }]);
    const r = await runVerify(s.source, s.sink, opts);
    expect(r.status).toBe("succeeded");
    expect(s.counted.some((c) => c.startsWith("alice_duress/"))).toBe(false);
  });

  it("bills count() as Firestore does and stops at the budget", async () => {
    expect(countReads(0)).toBe(1);
    expect(countReads(1000)).toBe(1);
    expect(countReads(2093)).toBe(3);
    const s = setup({ a: {}, b: {}, c: {} }, []);
    const r = await runVerify(s.source, s.sink, { ...opts, maxReads: 15 });
    expect(r.status).toBe("partial");
    expect(r.readsUsed).toBeLessThanOrEqual(15);
  });

  it("respects the shared daily read budget", async () => {
    const s = setup({ a: {} }, [], 11_995);
    const r = await runVerify(s.source, s.sink, opts);
    expect(r.readBudget).toBe(5);
    expect(r.readsUsed).toBeLessThanOrEqual(5);
  });

  it("a failing read is a failed run, not a crash", async () => {
    const s = setup({ a: {} }, []);
    s.source.count = async () => {
      throw new Error("unavailable");
    };
    const r = await runVerify(s.source, s.sink, opts);
    expect(r).toMatchObject({ status: "failed", notes: expect.objectContaining({ error: "unavailable" }) });
  });

  it("renders a summary by collection, with no uids", async () => {
    const s = setup({ "secret-uid": { expenses: 3 } }, [{ uid: "secret-uid", collection: "expenses", live: 2 }]);
    const md = renderVerifySummary(await runVerify(s.source, s.sink, opts));
    expect(md).toContain("| expenses | 3 | 2 | 1 |");
    expect(md).not.toContain("secret-uid");
  });
});
