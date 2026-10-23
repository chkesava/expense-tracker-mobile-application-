import { describe, expect, it, vi } from "vitest";

import { handleReadModelPush, USER_SYNC_COST, type PushEvent, type PushPorts } from "./_readmodelPushCore";

/** SPENDLY-583 — the per-write push: who may push what, and what gets written. */
const doc = (id: string, data: Record<string, unknown>, updateTime = 1000) => ({ id, data, updateTime });

function ports(over: Partial<PushPorts> = {}) {
  const calls = { upsert: [] as unknown[][], tombstone: [] as unknown[][], readDocs: [] as unknown[][], allow: [] as unknown[][], record: [] as unknown[] };
  const p: PushPorts = {
    enabled: () => true,
    verifyIdToken: async (t) => {
      if (t === "good") return { uid: "u1" };
      if (t === "duress") return { uid: "u1_duress" };
      throw new Error("bad token");
    },
    isPurged: async () => false,
    allow: async (uid, cost) => (calls.allow.push([uid, cost]), true),
    readDocs: async (uid, refs) => (calls.readDocs.push([uid, refs]), refs.map((r) => (r.docId === "gone" ? null : doc(r.docId, { amount: 42, date: "2026-10-23", category: "Food" })))),
    upsert: async (table, rows) => (calls.upsert.push([table, rows]), rows.length),
    tombstone: async (table, uid, ids) => (calls.tombstone.push([table, uid, ids]), ids.length),
    syncUser: async () => ({ readsUsed: 27, ok: true }),
    record: async (s) => void calls.record.push(s),
    ...over,
  };
  return { p, calls };
}

const post = (body: unknown, token = "good"): PushEvent => ({
  httpMethod: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: typeof body === "string" ? body : JSON.stringify(body),
});

describe("read-model push (SPENDLY-583)", () => {
  it("reads each named document from Firestore and upserts what the mapper builds", async () => {
    const { p, calls } = ports();
    const r = await handleReadModelPush(post({ refs: [{ collection: "expenses", docId: "e1" }, { collection: "incomes", docId: "i1" }] }), p);
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ mode: "refs", pushed: 2, tombstoned: 0 });
    expect(calls.readDocs).toEqual([["u1", [{ collection: "expenses", docId: "e1" }, { collection: "incomes", docId: "i1" }]]]);
    const [table, rows] = calls.upsert[0] as [string, Record<string, unknown>[]];
    expect(table).toBe("expenses");
    expect(rows[0]).toMatchObject({ uid: "u1", doc_id: "e1", amount: 42, category: "Food" });
    expect(calls.allow).toEqual([["u1", 2]]);
  });

  it("ignores any document data in the request: only Firestore's copy is written", async () => {
    const { p, calls } = ports();
    await handleReadModelPush(post({ refs: [{ collection: "expenses", docId: "e1", data: { amount: 999999 } }], data: { amount: 1 } }), p);
    const rows = (calls.upsert[0] as [string, Record<string, unknown>[]])[1];
    expect(rows[0].amount).toBe(42);
  });

  it("tombstones a document that no longer exists (hard delete)", async () => {
    const { p, calls } = ports();
    const r = await handleReadModelPush(post({ refs: [{ collection: "expenses", docId: "gone" }] }), p);
    expect(JSON.parse(r.body)).toMatchObject({ pushed: 0, tombstoned: 1 });
    expect(calls.tombstone).toEqual([["expenses", "u1", ["gone"]]]);
  });

  it("only ever reads under the token's own uid, whatever the request says", async () => {
    const { p, calls } = ports();
    await handleReadModelPush(post({ uid: "someone-else", refs: [{ collection: "expenses", docId: "e1" }] }), p);
    expect((calls.readDocs[0] as unknown[])[0]).toBe("u1");
  });

  it("rejects a missing, forged, expired or revoked token with 401, and a duress uid with 403", async () => {
    const { p, calls } = ports();
    expect((await handleReadModelPush({ httpMethod: "POST", headers: {}, body: "{}" }, p)).statusCode).toBe(401);
    expect((await handleReadModelPush(post({ refs: [{ collection: "expenses", docId: "e1" }] }, "forged"), p)).statusCode).toBe(401);
    expect((await handleReadModelPush(post({ refs: [{ collection: "expenses", docId: "e1" }] }, "duress"), p)).statusCode).toBe(403);
    expect(calls.readDocs).toEqual([]);
  });

  it("rejects non-synced collections, paths and malformed bodies, without reading anything", async () => {
    const { p, calls } = ports();
    for (const body of [
      { refs: [{ collection: "borrowings", docId: "b1" }] },
      { refs: [{ collection: "expenses", docId: "a/b" }] },
      { refs: [{ collection: "expenses", docId: ".." }] },
      { refs: [] },
      { refs: Array.from({ length: 51 }, (_, i) => ({ collection: "expenses", docId: `e${i}` })) },
      "not json",
      [],
    ]) {
      expect((await handleReadModelPush(post(body), p)).statusCode).toBe(400);
    }
    expect(calls.readDocs).toEqual([]);
    expect(calls.record.every((s) => (s as { rejected: number }).rejected === 1)).toBe(true);
  });

  it("refuses an erased account and an account over its rate limit", async () => {
    const purged = ports({ isPurged: async () => true });
    expect((await handleReadModelPush(post({ refs: [{ collection: "expenses", docId: "e1" }] }), purged.p)).statusCode).toBe(403);
    expect(purged.calls.readDocs).toEqual([]);
    const limited = ports({ allow: async () => false });
    expect((await handleReadModelPush(post({ refs: [{ collection: "expenses", docId: "e1" }] }), limited.p)).statusCode).toBe(429);
    expect(limited.calls.readDocs).toEqual([]);
  });

  it("a per-user sync costs USER_SYNC_COST and reports its reads", async () => {
    const syncUser = vi.fn(async () => ({ readsUsed: 27, ok: true }));
    const { p, calls } = ports({ syncUser });
    const r = await handleReadModelPush(post({ mode: "user" }), p);
    expect(r.statusCode).toBe(200);
    expect(syncUser).toHaveBeenCalledWith("u1");
    expect(calls.allow).toEqual([["u1", USER_SYNC_COST]]);
    expect(calls.record[0]).toMatchObject({ userSyncs: 1, reads: 27 });
  });

  it("a Supabase failure returns 502 with no provider detail, and is counted", async () => {
    const { p, calls } = ports({ upsert: async () => { throw new Error("connection refused at 10.0.0.1"); } });
    const r = await handleReadModelPush(post({ refs: [{ collection: "expenses", docId: "e1" }] }), p);
    expect(r.statusCode).toBe(502);
    expect(r.body).not.toMatch(/10\.0\.0\.1|refused/);
    expect(calls.record[0]).toMatchObject({ failed: 1 });
  });

  it("does nothing when pushes are switched off (rollback flag)", async () => {
    const { p, calls } = ports({ enabled: () => false });
    const r = await handleReadModelPush(post({ refs: [{ collection: "expenses", docId: "e1" }] }), p);
    expect(r.statusCode).toBe(202);
    expect(calls.readDocs).toEqual([]);
  });

  it("answers CORS preflight and refuses other methods", async () => {
    const { p } = ports();
    expect((await handleReadModelPush({ httpMethod: "OPTIONS" }, p)).statusCode).toBe(204);
    expect((await handleReadModelPush({ httpMethod: "GET" }, p)).statusCode).toBe(405);
  });
});
