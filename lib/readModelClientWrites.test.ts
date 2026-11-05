import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  configureClientWrites,
  createClientWriteOutbox,
  notifyClientWrites,
  resetClientWritesForTests,
  type ClientWritesDeps,
} from "./readModelClientWrites";
import type { ClientBatch } from "@/shared/utils/readModel/clientOutbox";

const user = { uid: "u1", getIdToken: async () => "t", getIdTokenResult: async () => ({ claims: {} }) };

function harness(over: Partial<ClientWritesDeps> = {}) {
  const storage = new Map<string, unknown>();
  const cache = new Map<string, Record<string, unknown> | null>();
  const sent: ClientBatch[] = [];
  let now = Date.UTC(2026, 10, 3, 10, 0, 0);
  let enabled = true;
  let currentUser: typeof user | null = user;
  let fail: null | { code?: string; message?: string } | "throw" = null;
  const deps: ClientWritesDeps = {
    getUser: () => currentUser,
    canSend: () => enabled && !!currentUser,
    readCached: async (path) => (cache.has(path) ? (cache.get(path) ? { id: path.split("/").pop()!, data: cache.get(path)! } : null) : undefined),
    apply: async (_u, batch) => {
      if (fail === "throw") throw new TypeError("Network request failed");
      sent.push(batch);
      return { error: fail };
    },
    load: async (uid) => storage.get(uid) ?? null,
    save: async (uid, q) => void storage.set(uid, JSON.parse(JSON.stringify(q))),
    remove: async (uid) => void storage.delete(uid),
    now: () => now,
    log: () => undefined,
    debounceMs: 10,
    ...over,
  };
  return {
    deps,
    storage,
    cache,
    sent,
    tick: (ms: number) => {
      now += ms;
    },
    setEnabled: (v: boolean) => (enabled = v),
    setUser: (u: typeof user | null) => (currentUser = u),
    setFail: (f: typeof fail) => (fail = f),
  };
}

const expensePath = (id: string) => `users/u1/expenses/${id}`;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  resetClientWritesForTests();
});

describe("client write outbox (SPENDLY-670)", () => {
  it("queues a written document from the cache, persists it, and sends it once", async () => {
    const h = harness();
    h.cache.set(expensePath("e1"), { amount: 120, date: "2026-11-03", category: "Food" });
    const box = createClientWriteOutbox(h.deps);
    await box.note("u1", [expensePath("e1"), "users/u1/meta/x", "users/u1/notSynced/y"]);
    expect((h.storage.get("u1") as { entries: unknown[] }).entries).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(20);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].table).toBe("expenses");
    expect(h.sent[0].rows[0]).toMatchObject({ uid: "u1", doc_id: "e1", amount: 120, client_written_at: "2026-11-03T10:00:00.000Z" });
    expect(box.stats()).toMatchObject({ pending: 0, sent: 1 });
    expect((h.storage.get("u1") as { entries: unknown[] }).entries).toHaveLength(0);
  });

  it("sends a delete for a document the cache no longer holds, and skips one it never held", async () => {
    const h = harness();
    h.cache.set(expensePath("gone"), null);
    const box = createClientWriteOutbox(h.deps);
    await box.note("u1", [expensePath("gone"), expensePath("never-cached")]);
    await vi.advanceTimersByTimeAsync(20);
    expect(h.sent[0].deletes).toEqual([{ uid: "u1", doc_id: "gone", client_written_at: "2026-11-03T10:00:00.000Z" }]);
    expect(box.stats().skippedNotCached).toBe(1);
  });

  it("does nothing while switched off (setting), signed out, or for another uid", async () => {
    const h = harness();
    h.cache.set(expensePath("e1"), { amount: 1 });
    const box = createClientWriteOutbox(h.deps);
    h.setEnabled(false);
    await box.note("u1", [expensePath("e1")]);
    h.setEnabled(true);
    await box.note("u2", ["users/u2/expenses/e1"]);
    h.setUser(null);
    await box.note("u1", [expensePath("e1")]);
    await vi.advanceTimersByTimeAsync(50);
    expect(h.sent).toEqual([]);
    expect(h.storage.size).toBe(0);
  });

  it("keeps the queue offline and retries with backoff, then lands every write exactly once", async () => {
    const h = harness();
    h.cache.set(expensePath("e1"), { amount: 1 });
    h.cache.set(expensePath("e2"), { amount: 2 });
    const box = createClientWriteOutbox(h.deps);
    h.setFail("throw"); // airplane mode
    await box.note("u1", [expensePath("e1"), expensePath("e2")]);
    await vi.advanceTimersByTimeAsync(20);
    expect(box.stats()).toMatchObject({ pending: 2, failed: 2, sent: 0 });
    h.setFail(null); // back online
    await vi.advanceTimersByTimeAsync(2000); // first backoff
    expect(box.stats()).toMatchObject({ pending: 0, sent: 2 });
    const landed = h.sent.flatMap((b) => b.rows.map((r) => r.doc_id));
    expect(landed).toEqual(["e1", "e2"]);
  });

  it("retries a Supabase outage (non-refusal error) and drops a refused batch", async () => {
    const h = harness();
    h.cache.set(expensePath("e1"), { amount: 1 });
    const box = createClientWriteOutbox(h.deps);
    h.setFail({ code: "PGRST000", message: "Supabase is down" });
    await box.note("u1", [expensePath("e1")]);
    await vi.advanceTimersByTimeAsync(20);
    expect(box.stats()).toMatchObject({ pending: 1, failed: 1 });
    h.setFail({ code: "22023", message: "bad row shape" });
    await vi.advanceTimersByTimeAsync(2000);
    expect(box.stats()).toMatchObject({ pending: 0, refused: 1, sent: 0 });
  });

  it("survives an app kill: a new outbox resumes the saved queue", async () => {
    const h = harness();
    h.cache.set(expensePath("e1"), { amount: 9 });
    h.setFail("throw");
    const first = createClientWriteOutbox(h.deps);
    await first.note("u1", [expensePath("e1")]);
    await vi.advanceTimersByTimeAsync(20);
    expect(h.sent).toEqual([]);
    // The process dies; a new one starts with the same device storage.
    h.setFail(null);
    const second = createClientWriteOutbox(h.deps);
    await second.resume("u1");
    await vi.advanceTimersByTimeAsync(20);
    expect(h.sent.map((b) => b.rows[0].doc_id)).toEqual(["e1"]);
  });

  it("sends only the newest version when a document is saved again before sending", async () => {
    const h = harness();
    const box = createClientWriteOutbox(h.deps);
    h.cache.set(expensePath("e1"), { amount: 1 });
    await box.note("u1", [expensePath("e1")]);
    h.tick(1000);
    h.cache.set(expensePath("e1"), { amount: 2 });
    await box.note("u1", [expensePath("e1")]);
    await vi.advanceTimersByTimeAsync(20);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].rows.map((r) => r.amount)).toEqual([2]);
  });

  it("forget removes this user's queue from the device (sign-out)", async () => {
    const h = harness();
    h.cache.set(expensePath("e1"), { amount: 1 });
    h.setFail("throw");
    const box = createClientWriteOutbox(h.deps);
    await box.note("u1", [expensePath("e1")]);
    await box.forget("u1");
    expect(h.storage.has("u1")).toBe(false);
    expect(box.stats().pending).toBe(0);
  });

  it("kick sends at once instead of waiting out the backoff", async () => {
    const h = harness();
    h.cache.set(expensePath("e1"), { amount: 1 });
    const box = createClientWriteOutbox(h.deps);
    h.setFail("throw");
    await box.note("u1", [expensePath("e1")]);
    await vi.advanceTimersByTimeAsync(20);
    h.setFail(null);
    box.kick();
    await vi.advanceTimersByTimeAsync(1);
    expect(box.stats()).toMatchObject({ pending: 0, sent: 1 });
  });

  it("notifyClientWrites is a no-op until configured, then feeds the configured outbox", async () => {
    notifyClientWrites("u1", [expensePath("e1")]); // not configured: nothing happens, nothing throws
    const h = harness();
    h.cache.set(expensePath("e1"), { amount: 3 });
    configureClientWrites(h.deps);
    notifyClientWrites("u1", [expensePath("e1")]);
    await vi.advanceTimersByTimeAsync(20);
    expect(h.sent).toHaveLength(1);
  });
});
