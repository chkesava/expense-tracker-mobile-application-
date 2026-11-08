import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  configureReadModelPush,
  createReadModelPusher,
  MAX_PENDING_PUSH_REFS,
  notifyReadModelSnapshot,
  notifyReadModelWrites,
  resetReadModelPushForTests,
  PUSH_RATE_LIMIT_WAIT_MS,
  type PusherDeps,
} from "./readModelPush";
import { MAX_PUSH_REFS } from "@/shared/utils/readModel/pushRefs";

/** SPENDLY-583 — the app side of the per-write push. */
const user = { uid: "u1", getIdToken: async () => "tok" };

function setup(over: Partial<PusherDeps> = {}) {
  const posts: { url: string; body: unknown; auth: string }[] = [];
  let release: () => void = () => {};
  const committed = new Promise<void>((r) => (release = r));
  const deps: PusherDeps = {
    endpoint: () => "https://site/.netlify/functions/readmodel-push",
    getUser: () => user,
    canPush: () => true,
    waitForCommit: () => committed,
    fetch: async (url, init) => {
      posts.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization });
      return { ok: true, status: 200 };
    },
    log: vi.fn(),
    debounceMs: 1000,
    ...over,
  };
  return { deps, posts, release };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  resetReadModelPushForTests();
});

describe("read-model pusher (SPENDLY-583)", () => {
  it("batches a burst of saves into one push, de-duplicated, only after Firestore has committed them", async () => {
    const { deps, posts, release } = setup();
    const pusher = createReadModelPusher(deps);
    pusher.note("u1", [{ collection: "expenses", docId: "e1" }]);
    pusher.note("u1", [{ collection: "expenses", docId: "e1" }, { collection: "ledgerEvents", docId: "le1" }]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(posts).toEqual([]); // still waiting for the commit (offline waits here)
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(posts).toEqual([{
      url: "https://site/.netlify/functions/readmodel-push",
      auth: "Bearer tok",
      body: { refs: [{ collection: "expenses", docId: "e1" }, { collection: "ledgerEvents", docId: "le1" }] },
    }]);
  });

  const refsOf = (n: number, prefix = "c") => Array.from({ length: n }, (_, i) => ({ collection: "categories", docId: `${prefix}${i}` }));

  it("names a large write in requests of at most 50 documents, every one of them (SPENDLY-712)", async () => {
    const { deps, posts, release } = setup();
    release();
    const pusher = createReadModelPusher(deps);
    pusher.note("u1", refsOf(417));
    await vi.advanceTimersByTimeAsync(20_000);
    const bodies = posts.map((p) => p.body as { refs?: { docId: string }[]; mode?: string });
    expect(bodies).toHaveLength(9);
    expect(bodies.every((b) => !b.mode && b.refs!.length <= MAX_PUSH_REFS)).toBe(true);
    expect(new Set(bodies.flatMap((b) => b.refs!.map((r) => r.docId)))).toEqual(new Set(refsOf(417).map((r) => r.docId)));
  });

  it("falls back to one per-user sync only for a backlog too large to name", async () => {
    const { deps, posts, release } = setup();
    release();
    const pusher = createReadModelPusher(deps);
    pusher.note("u1", refsOf(MAX_PENDING_PUSH_REFS + 1));
    pusher.note("u1", refsOf(3, "x"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(posts.map((p) => p.body)).toEqual([{ mode: "user" }]);
  });

  it("when rate limited, keeps the unsent documents and sends them after the window", async () => {
    let status = 200;
    const sent: string[][] = [];
    const { deps, release } = setup({
      fetch: async (_url, init) => {
        const body = JSON.parse(init.body) as { refs: { docId: string }[] };
        if (status === 429) return { ok: false, status };
        sent.push(body.refs.map((r) => r.docId));
        if (sent.length === 2) status = 429;
        return { ok: true, status: 200 };
      },
    });
    release();
    const pusher = createReadModelPusher(deps);
    pusher.note("u1", refsOf(150));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sent).toHaveLength(2); // the third request was refused and is held
    expect(deps.log).toHaveBeenCalledTimes(1);

    status = 200;
    await vi.advanceTimersByTimeAsync(PUSH_RATE_LIMIT_WAIT_MS);
    expect(new Set(sent.flat())).toEqual(new Set(refsOf(150).map((r) => r.docId)));
    expect(sent).toHaveLength(3);
  });

  it("never pushes when not allowed (Spendly Test, duress, no read model)", async () => {
    const { deps, posts, release } = setup({ canPush: () => false });
    release();
    const pusher = createReadModelPusher(deps);
    pusher.note("u1", [{ collection: "expenses", docId: "e1" }]);
    pusher.noteUserSync("u1");
    await vi.advanceTimersByTimeAsync(5000);
    expect(posts).toEqual([]);
  });

  it("drops what was noted for a user who has since signed out or switched", async () => {
    let current: typeof user | null = user;
    const { deps, posts, release } = setup({ getUser: () => current });
    const pusher = createReadModelPusher(deps);
    pusher.note("u1", [{ collection: "expenses", docId: "e1" }]);
    await vi.advanceTimersByTimeAsync(1000);
    current = { uid: "u2", getIdToken: async () => "tok2" };
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(posts).toEqual([]);
  });

  it("a failed push is logged once and never thrown; later pushes still go", async () => {
    const log = vi.fn();
    let fail = true;
    const { deps, posts, release } = setup({
      log,
      fetch: async (url, init) => {
        if (fail) throw new Error("network down");
        posts.push({ url, body: JSON.parse(init.body), auth: "" });
        return { ok: true, status: 200 };
      },
    });
    release();
    const pusher = createReadModelPusher(deps);
    pusher.note("u1", [{ collection: "expenses", docId: "e1" }]);
    await vi.advanceTimersByTimeAsync(1000);
    pusher.note("u1", [{ collection: "expenses", docId: "e2" }]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(log).toHaveBeenCalledTimes(1);
    fail = false;
    pusher.note("u1", [{ collection: "expenses", docId: "e3" }]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(posts.map((p) => p.body)).toEqual([{ refs: [{ collection: "expenses", docId: "e3" }] }]);
  });
});

describe("the two hooks (SPENDLY-583)", () => {
  function configure() {
    const { deps, posts, release } = setup();
    release();
    configureReadModelPush({ ...deps, getUser: () => user });
    return posts;
  }

  it("commitMutations paths: only the signed-in user's synced documents", async () => {
    const posts = configure();
    notifyReadModelWrites("u1", [
      "users/u1/expenses/e1",
      "users/u1/meta/outbox/acks/x",
      "users/u1/stats/n1",
      "users/u1_duress/expenses/d1",
      "users/u2/expenses/z",
    ]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(posts.map((p) => p.body)).toEqual([{ refs: [{ collection: "expenses", docId: "e1" }] }]);
  });

  it("listener snapshots: only this device's own unsaved changes, deletes included", async () => {
    const posts = configure();
    const change = (type: "added" | "modified" | "removed", path: string, pending: boolean) => ({ type, doc: { ref: { path }, metadata: { hasPendingWrites: pending } } });
    // Another device's change (no pending writes): nothing.
    notifyReadModelSnapshot({ metadata: { hasPendingWrites: false }, docChanges: () => [change("added", "users/u1/categories/c9", false)] });
    notifyReadModelSnapshot({
      metadata: { hasPendingWrites: true },
      docChanges: () => [
        change("modified", "users/u1/creditCardBills/b1", true),
        change("modified", "users/u1/creditCardBills/b2", false),
        change("removed", "users/u1/creditCardBills/b3", false),
      ],
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(posts.map((p) => p.body)).toEqual([{ refs: [{ collection: "creditCardBills", docId: "b1" }, { collection: "creditCardBills", docId: "b3" }] }]);
  });

  it("does nothing before the provider configures it", () => {
    expect(() => notifyReadModelWrites("u1", ["users/u1/expenses/e1"])).not.toThrow();
  });
});
