import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { READ_MODEL_TABLES } from "../shared/utils/readModel/mapping";
import { memorySink } from "./lib/readmodelSyncMemory";
import { ALWAYS_FULL, MASS_TOMBSTONE_MIN, OVERLAP_MS, runSync, type Page, type PageRequest, type SourcePort } from "./lib/readmodelSyncCore";

/**
 * A fake Firestore: documents with createdAt / updatedAt (ms) and an
 * updateTime, queried the way the real reader does, and billed the way
 * Firestore bills (each query page: its documents, at least 1).
 */
type FakeDoc = { id: string; data: Record<string, unknown>; updateMs: number };

function fakeFirestore(users: Record<string, Record<string, FakeDoc[]>>) {
  let reads = 0;
  let crossUserQueries = 0;
  const source: SourcePort = {
    async listUserIds() {
      return Object.keys(users);
    },
    async readPage(uid, collection, request: PageRequest): Promise<Page> {
      let docs = [...(users[uid]?.[collection] ?? [])];
      if (request.kind === "since") {
        docs = docs
          .filter((d) => typeof d.data[request.field] === "number" && (d.data[request.field] as number) > request.sinceMs)
          .sort((a, b) => (a.data[request.field] as number) - (b.data[request.field] as number) || a.id.localeCompare(b.id));
      } else {
        docs.sort((a, b) => a.id.localeCompare(b.id));
      }
      const start = typeof request.after === "number" ? request.after : 0;
      const page = docs.slice(start, start + request.limit);
      reads += Math.max(1, page.length);
      return {
        docs: page.map((d) => ({ id: d.id, data: d.data, updateTime: { toMillis: () => d.updateMs } })),
        next: page.length === request.limit ? start + page.length : undefined,
      };
    },
    // SPENDLY-672: a collection-group query, every user's documents at once (duress trees included, as Firestore would).
    async readChangedAcrossUsers(collection, request) {
      const docs = Object.entries(users)
        .flatMap(([uid, cols]) => (cols[collection] ?? []).map((d) => ({ uid, d })))
        .filter(({ d }) => typeof d.data[request.field] === "number" && (d.data[request.field] as number) > request.sinceMs)
        .sort((a, b) => (a.d.data[request.field] as number) - (b.d.data[request.field] as number) || `${a.uid}/${a.d.id}`.localeCompare(`${b.uid}/${b.d.id}`));
      const start = typeof request.after === "number" ? request.after : 0;
      const page = docs.slice(start, start + request.limit);
      reads += Math.max(1, page.length);
      crossUserQueries += 1;
      return {
        docs: page.map(({ uid, d }) => ({ uid, id: d.id, data: d.data, updateTime: { toMillis: () => d.updateMs } })),
        next: page.length === request.limit ? start + page.length : undefined,
        reads: Math.max(1, page.length),
      };
    },
  };
  return { source, reads: () => reads, crossUserQueries: () => crossUserQueries, users };
}

const T0 = Date.UTC(2026, 9, 22, 0, 0);
const H = 3600 * 1000;
const exp = (id: string, amount: number, at: number, extra: Record<string, unknown> = {}): FakeDoc => ({
  id,
  data: { amount, date: "2026-10-20", category: "Food", createdAt: at, ...extra },
  updateMs: at,
});
const opts = (mode: "incremental" | "full", now: number, extra = {}) => ({
  mode, dryRun: false, maxReadsPerRun: 10_000, maxReadsPerDay: 100_000, now: () => now, ...extra,
});

function world() {
  return fakeFirestore({
    alice: {
      expenses: [exp("e1", 100, T0 - 48 * H), exp("e2", 250, T0 - 30 * H)],
      accounts: [{ id: "bank", data: { name: "Bank", currentBalance: 1000 }, updateMs: T0 - 48 * H }],
      categories: [{ id: "c1", data: { name: "Food", createdAt: T0 - 48 * H }, updateMs: T0 - 48 * H }],
    },
    alice_duress: { expenses: [exp("decoy", 1, T0 - 48 * H)] },
    bob: { expenses: [exp("b1", 75, T0 - 48 * H)] },
  });
}

describe("the sync as the safety net (SPENDLY-672)", () => {
  it("counts a client row that disagrees with Firestore as a divergence, and Firestore's version replaces it", async () => {
    const fs = world();
    const m = memorySink();
    await runSync(fs.source, m.sink, opts("full", T0));
    // The app's direct writes landed in Supabase: e1 agrees with Firestore, e2 doesn't.
    const e1 = m.row("expenses", "alice", "e1")!;
    const e2 = m.row("expenses", "alice", "e2")!;
    Object.assign(e1, { written_by: "client", client_written_at: new Date(T0).toISOString() });
    Object.assign(e2, { written_by: "client", client_written_at: new Date(T0).toISOString(), amount: 999 });
    // Both change in Firestore afterwards, so the nightly incremental run reads them.
    for (const d of fs.users.alice.expenses) Object.assign(d, { updateMs: T0 + H, data: { ...d.data, updatedAt: T0 + H } });

    const run = await runSync(fs.source, m.sink, opts("incremental", T0 + 2 * H));
    expect(run.status).toBe("succeeded");
    expect(run.notes.divergences).toEqual({ expenses: 1 });
    expect(run.notes.clientRowsReplaced).toEqual({ expenses: 2 });
    expect(m.row("expenses", "alice", "e2")).toMatchObject({ amount: 250, written_by: "server", client_written_at: null });
  });

  it("cross-user nights: one query pair per collection, not per user; duress never copied; a global checkpoint", async () => {
    const fs = world();
    const m = memorySink();
    await runSync(fs.source, m.sink, opts("full", T0));
    fs.users.alice.expenses.push(exp("e3", 40, T0 + H));
    fs.users.bob.expenses.push(exp("b2", 60, T0 + H));
    fs.users.alice_duress.expenses.push(exp("decoy2", 1, T0 + H));
    const before = fs.reads();

    const run = await runSync(fs.source, m.sink, opts("incremental", T0 + 2 * H, { crossUser: true }));
    expect(run.status).toBe("succeeded");
    expect(m.row("expenses", "alice", "e3")).toMatchObject({ amount: 40 });
    expect(m.row("expenses", "bob", "b2")).toMatchObject({ amount: 60 });
    expect(m.row("expenses", "alice_duress", "decoy2")).toBeUndefined();
    expect(m.checkpoints.get("*/expenses")?.highWaterMs).toBe(T0 + 2 * H);
    // Every collection but the 4 always-full ones and the users/{uid} doc, with createdAt + updatedAt.
    const crossed = READ_MODEL_TABLES.filter((t) => !t.root && !ALWAYS_FULL.has(t.collection)).length;
    expect(run.notes.crossUserCollections).toBe(crossed);
    expect(fs.crossUserQueries()).toBe(2 * crossed);
    // 2 users: the listing, the cross-user queries (+1 for the page holding both new docs),
    // and per user the always-full collections and the settings doc.
    expect(fs.reads() - before).toBeLessThanOrEqual(1 + 2 * crossed + 2 + 2 * (ALWAYS_FULL.size + 1) + 5);
  });

  it("cross-user: a client row that disagrees is a divergence too", async () => {
    const fs = world();
    const m = memorySink();
    await runSync(fs.source, m.sink, opts("full", T0));
    Object.assign(m.row("expenses", "bob", "b1")!, { written_by: "client", client_written_at: new Date(T0).toISOString(), amount: 1 });
    Object.assign(fs.users.bob.expenses[0], { updateMs: T0 + H, data: { ...fs.users.bob.expenses[0].data, updatedAt: T0 + H } });
    const run = await runSync(fs.source, m.sink, opts("incremental", T0 + 2 * H, { crossUser: true }));
    expect(run.notes.divergences).toEqual({ expenses: 1 });
    expect(m.row("expenses", "bob", "b1")).toMatchObject({ amount: 75, written_by: "server" });
  });

  it("cross-user: a collection some user was never copied for goes per user this time", async () => {
    const fs = world();
    const m = memorySink();
    await runSync(fs.source, m.sink, opts("full", T0));
    m.checkpoints.delete("bob/incomes");
    const run = await runSync(fs.source, m.sink, opts("incremental", T0 + H, { crossUser: true }));
    expect(run.status).toBe("succeeded");
    expect(m.checkpoints.get("*/incomes")).toBeUndefined();
    expect(m.checkpoints.get("*/expenses")).toBeDefined();
  });

  it("an agreeing or server-written row is never a divergence", async () => {
    const fs = world();
    const m = memorySink();
    await runSync(fs.source, m.sink, opts("full", T0));
    const again = await runSync(fs.source, m.sink, opts("full", T0 + H));
    expect(again.notes.divergences).toBeUndefined();
    expect(again.notes.clientRowsReplaced).toBeUndefined();
  });
});

describe("stored summaries (SPENDLY-592)", () => {
  it("copies the dashboard months and EPF exactly, and never the retired netWorth/investments docs", async () => {
    const at = T0 - 48 * H;
    const fs = fakeFirestore({
      alice: {
        financialSummaries: [
          { id: "dashboard_2026-10", data: { period: "2026-10", totalExpenses: 12345.67, totalIncome: 50000, transactionCount: 41, categoryTotals: { Food: 4200.5 }, summaryVersion: 2 }, updateMs: at },
          { id: "epf", data: { currentBalance: 812345.5, employeeContributionTotal: 400000, employerContributionTotal: 150000, interestTotal: 262345.5, adjustmentsTotal: 0, lastCreditPeriod: "2026-09" }, updateMs: at },
          { id: "netWorth", data: { total: 999 }, updateMs: at },
          { id: "investments", data: { total: 111 }, updateMs: at },
        ],
      },
    });
    const m = memorySink();
    const run = await runSync(fs.source, m.sink, opts("full", T0));
    expect(run.status).toBe("succeeded");
    expect(m.row("financial_summaries", "alice", "dashboard_2026-10")).toMatchObject({
      period: "2026-10", total_expenses: 12345.67, total_income: 50000, transaction_count: 41, mapping_status: "mapped",
      doc: expect.objectContaining({ categoryTotals: { Food: 4200.5 } }),
    });
    expect(m.row("financial_summaries", "alice", "epf")).toMatchObject({ current_balance: 812345.5, interest_total: 262345.5, last_credit_period: "2026-09" });
    expect(m.row("financial_summaries", "alice", "netWorth")).toBeUndefined();
    expect(m.row("financial_summaries", "alice", "investments")).toBeUndefined();
    // A second full pass doesn't treat the skipped docs as anything to tombstone.
    const again = await runSync(fs.source, m.sink, opts("full", T0 + H));
    expect(again.tombstones).toBe(0);
  });
});

describe("read-model sync core (SPENDLY-506)", () => {
  it("first run copies everything, then an unchanged incremental run reads little and writes nothing", async () => {
    const fs = world();
    const m = memorySink();
    const first = await runSync(fs.source, m.sink, opts("incremental", T0));
    expect(first.status).toBe("succeeded");
    expect(m.row("expenses", "alice", "e1")).toMatchObject({ amount: 100, mapping_status: "mapped" });
    expect(m.row("expenses", "bob", "b1")).toBeTruthy();
    expect(m.row("accounts", "alice", "bank")).toMatchObject({ current_balance: 1000 });
    expect(m.checkpoints.get("alice/expenses")?.highWaterMs).toBe(T0);

    const second = await runSync(fs.source, m.sink, opts("incremental", T0 + 3 * H));
    expect(second.upserts).toBe(0);
    expect(second.tombstones).toBe(0);
    // 1 (users) + per user and synced collection at most 2 queries, each an
    // empty page billed as 1 read (SPENDLY-590: the bound scales with the tables).
    expect(second.readsUsed).toBeLessThanOrEqual(1 + 2 * 2 * READ_MODEL_TABLES.length);
  });

  it("never reads or writes a duress tree", async () => {
    const fs = world();
    const m = memorySink();
    await runSync(fs.source, m.sink, opts("full", T0));
    expect([...m.tables.get("expenses")!.values()].some((r) => r.uid.endsWith("_duress"))).toBe(false);
  });

  it("incremental picks up a new expense (createdAt) and an edit (updatedAt), and nothing older", async () => {
    const fs = world();
    const m = memorySink();
    await runSync(fs.source, m.sink, opts("incremental", T0));
    fs.users.alice.expenses.push(exp("e3", 40, T0 + H));
    fs.users.alice.expenses[0] = { ...exp("e1", 120, T0 - 48 * H, { updatedAt: T0 + 2 * H }), updateMs: T0 + 2 * H };
    const run = await runSync(fs.source, m.sink, opts("incremental", T0 + 3 * H));
    expect(m.row("expenses", "alice", "e3")).toMatchObject({ amount: 40 });
    expect(m.row("expenses", "alice", "e1")).toMatchObject({ amount: 120 });
    expect(run.upserts).toBe(2);
  });

  it("catches a write committed during the previous run through the overlap window", async () => {
    const fs = world();
    const m = memorySink();
    await runSync(fs.source, m.sink, opts("incremental", T0));
    // Committed 5 minutes before that run's start but read after it advanced the mark.
    fs.users.alice.expenses.push(exp("late", 9, T0 - 5 * 60 * 1000));
    await runSync(fs.source, m.sink, opts("incremental", T0 + 3 * H));
    expect(m.row("expenses", "alice", "late")).toBeTruthy();
    expect(OVERLAP_MS).toBe(10 * 60 * 1000);
  });

  it("an edit with no updatedAt (old app version, script) waits for the nightly full run", async () => {
    const fs = world();
    const m = memorySink();
    await runSync(fs.source, m.sink, opts("incremental", T0));
    fs.users.alice.expenses[1] = { ...exp("e2", 999, T0 - 30 * H), updateMs: T0 + H };
    await runSync(fs.source, m.sink, opts("incremental", T0 + 3 * H));
    expect(m.row("expenses", "alice", "e2")).toMatchObject({ amount: 250 });
    await runSync(fs.source, m.sink, opts("full", T0 + 6 * H));
    expect(m.row("expenses", "alice", "e2")).toMatchObject({ amount: 999 });
  });

  it("copies account balance changes every run (accounts are always full)", async () => {
    const fs = world();
    const m = memorySink();
    await runSync(fs.source, m.sink, opts("incremental", T0));
    fs.users.alice.accounts[0] = { id: "bank", data: { name: "Bank", currentBalance: 640 }, updateMs: T0 + H };
    await runSync(fs.source, m.sink, opts("incremental", T0 + 3 * H));
    expect(m.row("accounts", "alice", "bank")).toMatchObject({ current_balance: 640 });
  });

  it("tombstones a hard-deleted account on an incremental run, but a deleted category only on a full run", async () => {
    const fs = world();
    const m = memorySink();
    await runSync(fs.source, m.sink, opts("incremental", T0));
    fs.users.alice.accounts = [];
    fs.users.alice.categories = [];
    await runSync(fs.source, m.sink, opts("incremental", T0 + 3 * H));
    expect(m.row("accounts", "alice", "bank")?.source_deleted).toBe(true);
    expect(m.row("categories", "alice", "c1")?.source_deleted).toBe(false);
    await runSync(fs.source, m.sink, opts("full", T0 + 6 * H));
    expect(m.row("categories", "alice", "c1")?.source_deleted).toBe(true);
    // Rows are never removed.
    expect(m.tables.get("categories")!.size).toBe(1);
  });

  it("keeps a soft delete as a column, not a tombstone", async () => {
    const fs = world();
    const m = memorySink();
    await runSync(fs.source, m.sink, opts("incremental", T0));
    fs.users.alice.expenses[0] = {
      ...exp("e1", 100, T0 - 48 * H, { deletedAt: new Date(T0 + H).toISOString(), updatedAt: T0 + H }),
      updateMs: T0 + H,
    };
    await runSync(fs.source, m.sink, opts("incremental", T0 + 3 * H));
    expect(m.row("expenses", "alice", "e1")).toMatchObject({ source_deleted: false, soft_deleted_at: new Date(T0 + H).toISOString() });
  });

  it("is idempotent: the same full run twice changes nothing the second time", async () => {
    const fs = world();
    const m = memorySink();
    await runSync(fs.source, m.sink, opts("full", T0));
    const again = await runSync(fs.source, m.sink, opts("full", T0));
    expect(again.upserts).toBe(0);
    expect(again.tombstones).toBe(0);
  });

  it("stops before the per-run budget, records partial, does not tombstone or advance, and resumes", async () => {
    const big = fakeFirestore({
      alice: { categories: Array.from({ length: 30 }, (_, i) => ({ id: `c${String(i).padStart(2, "0")}`, data: { name: `C${i}` }, updateMs: T0 })) },
      bob: { expenses: [exp("b1", 75, T0 - H)] },
    });
    const m = memorySink();
    const tables = (await import("../shared/utils/readModel/mapping")).READ_MODEL_TABLES.filter((t) =>
      ["categories", "expenses"].includes(t.collection)
    );
    const stopped = await runSync(big.source, m.sink, { ...opts("full", T0), maxReadsPerRun: 12, tables });
    expect(stopped.status).toBe("partial");
    expect(stopped.readsUsed).toBeLessThanOrEqual(12);
    expect(big.reads()).toBeLessThanOrEqual(12);
    expect(stopped.notes.resumeFrom).toEqual({ uid: "alice", collection: "categories" });
    expect(m.checkpoints.has("alice/categories")).toBe(false);

    const resumed = await runSync(big.source, m.sink, { ...opts("full", T0 + H), tables });
    expect(resumed.status).toBe("succeeded");
    expect(m.tables.get("categories")!.size).toBe(30);
  });

  it("skips the run when the daily budget is already used", async () => {
    const m = memorySink({ reads24h: 12_000 });
    const run = await runSync(world().source, m.sink, { ...opts("incremental", T0), maxReadsPerDay: 12_000 });
    expect(run).toMatchObject({ status: "partial", readsUsed: 0, notes: expect.objectContaining({ skipped: expect.any(String) }) });
  });

  it("caps the run at what is left of the daily budget", async () => {
    const m = memorySink({ reads24h: 11_995 });
    const run = await runSync(world().source, m.sink, { ...opts("full", T0), maxReadsPerDay: 12_000 });
    expect(run.readBudget).toBe(5);
    expect(run.readsUsed).toBeLessThanOrEqual(5);
  });

  it("refuses a mass tombstone and reports it", async () => {
    const fs = fakeFirestore({
      alice: { categories: Array.from({ length: MASS_TOMBSTONE_MIN + 10 }, (_, i) => ({ id: `c${i}`, data: { name: "x" }, updateMs: T0 })) },
    });
    const m = memorySink();
    await runSync(fs.source, m.sink, opts("full", T0));
    fs.users.alice.categories = [];
    const run = await runSync(fs.source, m.sink, opts("full", T0 + H));
    expect(run.tombstones).toBe(0);
    expect(run.status).toBe("partial");
    expect(m.failures).toEqual([expect.objectContaining({ errorClass: "mass_tombstone_guard" })]);
  });

  it("stores an unknown shape as unmapped and counts it", async () => {
    const fs = fakeFirestore({ alice: { expenses: [exp("weird", Number.NaN, T0 - H, { amount: "lots" })] } });
    const m = memorySink();
    const run = await runSync(fs.source, m.sink, opts("full", T0));
    expect(run.unmapped).toBe(1);
    expect(m.row("expenses", "alice", "weird")).toMatchObject({ mapping_status: "unmapped", amount: null });
  });

  it("an older version arriving after a newer one leaves the newer row", async () => {
    const m = memorySink();
    const newer = fakeFirestore({ alice: { expenses: [{ ...exp("e1", 200, T0), updateMs: T0 + H }] } });
    await runSync(newer.source, m.sink, opts("full", T0 + H));
    const older = fakeFirestore({ alice: { expenses: [{ ...exp("e1", 100, T0), updateMs: T0 }] } });
    await runSync(older.source, m.sink, opts("full", T0 + 2 * H));
    expect(m.row("expenses", "alice", "e1")).toMatchObject({ amount: 200 });
  });

  it("dry run reads and maps but writes nothing", async () => {
    const m = memorySink();
    const run = await runSync(world().source, m.sink, { ...opts("full", T0), dryRun: true });
    expect(run.mode).toBe("dry_run");
    expect(run.upserts).toBeGreaterThan(0);
    expect(m.tables.size).toBe(0);
    expect(m.checkpoints.size).toBe(0);
  });

  it("a failure in one user's collection doesn't stop the others and is recorded with the hashed-uid log", async () => {
    const fs = world();
    const failing: SourcePort = {
      listUserIds: fs.source.listUserIds,
      async readPage(uid, collection, request) {
        if (uid === "alice" && collection === "expenses") throw new Error("boom");
        return fs.source.readPage(uid, collection, request);
      },
    };
    const lines: string[] = [];
    const m = memorySink();
    const run = await runSync(failing, m.sink, { ...opts("full", T0), log: (l) => lines.push(l) });
    expect(run.status).toBe("partial");
    expect(run.failures).toBe(1);
    expect(m.row("expenses", "bob", "b1")).toBeTruthy();
    expect(lines.join("\n")).not.toContain("alice");
  });
});

describe("sync failures are recorded and resolve themselves (SPENDLY-507)", () => {
  it("records a mapping failure once, naming the field but not the value, and resolves it when the document maps", async () => {
    const fs = fakeFirestore({ alice: { expenses: [exp("weird", 0, T0 - H, { amount: "secret-ish" })] } });
    const m = memorySink();
    await runSync(fs.source, m.sink, opts("full", T0));
    expect(m.failures).toEqual([
      expect.objectContaining({ uid: "alice", collection: "expenses", docId: "weird", errorClass: "mapping", message: "amount: not a valid money" }),
    ]);
    expect(JSON.stringify(m.failures)).not.toContain("secret-ish");

    // Still broken on the next run: no duplicate.
    await runSync(fs.source, m.sink, opts("full", T0 + H));
    expect(m.failures).toHaveLength(1);
    expect(await m.sink.openFailures()).toHaveLength(1);

    // Fixed in Firestore: the next pass maps it and resolves the failure.
    fs.users.alice.expenses[0] = { ...exp("weird", 12, T0 - H, { updatedAt: T0 + 2 * H }), updateMs: T0 + 2 * H };
    await runSync(fs.source, m.sink, opts("incremental", T0 + 3 * H));
    expect(m.row("expenses", "alice", "weird")).toMatchObject({ amount: 12, mapping_status: "mapped" });
    expect(await m.sink.openFailures()).toEqual([]);
  });

  it("resolves a (uid, collection) failure when that pair next completes", async () => {
    const fs = world();
    let broken = true;
    const flaky: SourcePort = {
      listUserIds: fs.source.listUserIds,
      async readPage(uid, collection, request) {
        if (broken && uid === "alice" && collection === "expenses") throw new Error("unavailable");
        return fs.source.readPage(uid, collection, request);
      },
    };
    const m = memorySink();
    await runSync(flaky, m.sink, opts("full", T0));
    expect(await m.sink.openFailures()).toEqual([expect.objectContaining({ uid: "alice", collection: "expenses", docId: "*", errorClass: "pair_failed" })]);
    // The failed pair did not advance, so nothing was skipped.
    expect(m.checkpoints.has("alice/expenses")).toBe(false);

    broken = false;
    await runSync(flaky, m.sink, opts("incremental", T0 + 3 * H));
    expect(await m.sink.openFailures()).toEqual([]);
    expect(m.row("expenses", "alice", "e1")).toBeTruthy();
  });

  it("keeps a mass-tombstone guard failure open while the guard keeps firing", async () => {
    const fs = fakeFirestore({
      alice: { categories: Array.from({ length: MASS_TOMBSTONE_MIN + 10 }, (_, i) => ({ id: `c${i}`, data: { name: "x" }, updateMs: T0 })) },
    });
    const m = memorySink();
    await runSync(fs.source, m.sink, opts("full", T0));
    const kept = fs.users.alice.categories;
    fs.users.alice.categories = [];
    await runSync(fs.source, m.sink, opts("full", T0 + H));
    await runSync(fs.source, m.sink, opts("full", T0 + 2 * H));
    expect(await m.sink.openFailures()).toEqual([expect.objectContaining({ errorClass: "mass_tombstone_guard" })]);

    // The documents were really there (a bad read): the next clean pass resolves it.
    fs.users.alice.categories = kept;
    await runSync(fs.source, m.sink, opts("full", T0 + 3 * H));
    expect(await m.sink.openFailures()).toEqual([]);
  });

  it("dry runs neither record nor resolve failures", async () => {
    const fs = fakeFirestore({ alice: { expenses: [exp("weird", 0, T0 - H, { amount: "x" })] } });
    const m = memorySink();
    await runSync(fs.source, m.sink, { ...opts("full", T0), dryRun: true });
    expect(m.failures).toEqual([]);
  });
});

describe("account lifecycle (SPENDLY-508)", () => {
  it("never reads an erased account again, even while Firestore still holds its documents (SPENDLY-520 D6)", async () => {
    const fs = world();
    const m = memorySink({ purged: ["bob"] });
    const lines: string[] = [];
    const readUids: string[] = [];
    const source = { ...fs.source, readPage: (uid: string, c: string, r: never) => (readUids.push(uid), fs.source.readPage(uid, c, r)) };
    const run = await runSync(source, m.sink, { ...opts("full", T0), log: (l) => lines.push(l) });
    expect(run.status).toBe("succeeded");
    expect(run.failures).toBe(0);
    expect(run.notes.purgedSkipped).toBe(1);
    expect([...m.tables.values()].flatMap((t) => [...t.values()]).some((r) => r.uid === "bob")).toBe(false);
    expect(readUids).not.toContain("bob");
    expect(readUids).toContain("alice");
    expect(lines.join("\n")).not.toContain("bob");
  });

  it("a full run flags, once, an account the read model holds but Firestore no longer has", async () => {
    const fs = world();
    const m = memorySink();
    await runSync(fs.source, m.sink, opts("full", T0));
    // bob deleted their account, but the read-model purge never ran.
    delete fs.users.bob;
    const lines: string[] = [];
    const run = await runSync(fs.source, m.sink, { ...opts("full", T0 + H), log: (l) => lines.push(l) });
    expect(run.notes.orphans).toBe(1);
    expect(await m.sink.openFailures()).toEqual([{ uid: "bob", collection: "*", docId: "*", errorClass: "orphan_uid" }]);
    expect(lines.join("\n")).not.toContain("bob");
    await runSync(fs.source, m.sink, opts("full", T0 + 2 * H));
    expect(m.failures.filter((f) => f.errorClass === "orphan_uid")).toHaveLength(1);
  });

  it("incremental and dry runs don't run the orphan check", async () => {
    const fs = world();
    const m = memorySink();
    await runSync(fs.source, m.sink, opts("full", T0));
    delete fs.users.bob;
    await runSync(fs.source, m.sink, opts("incremental", T0 + H));
    await runSync(fs.source, m.sink, { ...opts("full", T0 + H), dryRun: true });
    expect(m.failures).toEqual([]);
  });

  it("only ever requests the synced collections (Wave 1 + SPENDLY-609 goals + Waves 2 and 3 + SPENDLY-591), and never a duress tree", async () => {
    const fs = world();
    const requested: string[] = [];
    const watched: SourcePort = {
      listUserIds: fs.source.listUserIds,
      async readPage(uid, collection, request) {
        requested.push(`${uid}/${collection}`);
        return fs.source.readPage(uid, collection, request);
      },
    };
    await runSync(watched, memorySink().sink, opts("full", T0));
    const collections = new Set(requested.map((r) => r.slice(r.indexOf("/") + 1)));
    expect([...collections].sort()).toEqual([
      "accountEntries", "accountPayments", "accountTransfers", "accountTypes", "accounts",
      "borrowingRepayments", "borrowings", "calendarReminders", "categories",
      "categorizationRules", "categoryBudgets", "creditCardBills", "decisions",
      "epfContributionEvents", "epfContributions", "epfEstablishments", "epfInterestEntries",
      "epfProfile", "epfReconciliations", "epfTransferEvents", "epfTransfers", "epfWageHistory",
      "expenses", "feeReviews", "feeSignalDismissals", "financialGoals", "financialSummaries", "goalEvents",
      "goalFundingPlans", "holdings", "incomes", "investmentCashTransactions", "investments",
      "ledgerEvents", "merchantOverrides", "netWorthHistory", "portfolioSettings",
      "portfolioTransactions", "receivableRepayments", "receivables", "recurringDismissals",
      "runwayOverrides", "runwaySettings", "sipPlans", "sipTransactions", "spaces",
      "subscriptions", "trips", "userSettings", "virtualPositions", "watchlists", "watchlists/items", "whatIfScenarios",
    ]);
    for (const excluded of ["meta", "stats", "notifications", "daily_logs", "weight_history", "pandalMemberships", "goalNames"]) {
      expect(collections.has(excluded)).toBe(false);
    }
    expect(requested.some((r) => r.startsWith("alice_duress/"))).toBe(false);
  });
});

describe("field parity and repair (SPENDLY-510)", () => {
  it("detects a row edited directly in Postgres, repairs it from Firestore, and clears the failure next run", async () => {
    const fs = world();
    const m = memorySink();
    await runSync(fs.source, m.sink, opts("full", T0));

    // Injected divergence: same version, different amount (the version guard
    // alone would never heal this).
    m.row("expenses", "alice", "e1")!.amount = 999;
    const lines: string[] = [];
    const run = await runSync(fs.source, m.sink, { ...opts("full", T0 + H), log: (l) => lines.push(l) });
    expect(run.notes).toMatchObject({ parityMismatches: 1, parityRepaired: 1 });
    expect(run.status).toBe("partial");
    expect(m.row("expenses", "alice", "e1")).toMatchObject({ amount: 100 });
    expect(await m.sink.openFailures()).toEqual([{ uid: "alice", collection: "expenses", docId: "e1", errorClass: "parity" }]);
    expect(m.failures[0].message).toBe("differs from Firestore in: amount");
    expect(lines.join("\n")).not.toContain("alice");

    const clean = await runSync(fs.source, m.sink, opts("full", T0 + 2 * H));
    expect(clean.notes.parityMismatches).toBeUndefined();
    expect(clean.status).toBe("succeeded");
    expect(await m.sink.openFailures()).toEqual([]);
  });

  it("restores a row deleted by hand and reports it", async () => {
    const fs = world();
    const m = memorySink();
    await runSync(fs.source, m.sink, opts("full", T0));
    m.tables.get("expenses")!.delete("bob/b1");
    const run = await runSync(fs.source, m.sink, opts("full", T0 + H));
    // The upsert re-inserts it; parity then sees it equal, so nothing is flagged.
    expect(m.row("expenses", "bob", "b1")).toMatchObject({ amount: 75 });
    expect(run.notes.parityMismatches).toBeUndefined();
  });

  it("dry runs don't run field parity", async () => {
    const fs = world();
    const m = memorySink();
    await runSync(fs.source, m.sink, opts("full", T0));
    m.row("accounts", "alice", "bank")!.current_balance = 1;
    await runSync(fs.source, m.sink, { ...opts("full", T0 + H), dryRun: true });
    expect(m.failures).toEqual([]);
    expect(m.row("accounts", "alice", "bank")).toMatchObject({ current_balance: 1 });
  });
});

describe("readmodel-sync never writes Firestore", () => {
  const FIRESTORE_WRITES = /\.(set|update|delete|create)\(|\.batch\(|runTransaction|bulkWriter|recursiveDelete/;

  it("the Firestore reader in the CLI only reads", () => {
    const source = readFileSync(path.resolve(__dirname, "readmodel-sync.ts"), "utf8");
    const reader = source.slice(source.indexOf("function firestoreSource"), source.indexOf("async function must"));
    expect(reader).toContain("export function firestoreReader");
    expect(reader).toMatch(/\.get\(\)/);
    expect(reader).not.toMatch(FIRESTORE_WRITES);
    expect(reader).not.toMatch(/\.add\(/);
    // Nothing else in the CLI touches Firestore.
    expect(source.match(/getFirestore\(/g)).toHaveLength(1);
  });

  it("the core has no I/O of its own beyond its ports", () => {
    // A sha256 hash's `.update(` is not a write.
    const source = readFileSync(path.resolve(__dirname, "lib/readmodelSyncCore.ts"), "utf8").replace(/createHash\([^)]*\)\.update\(/g, "");
    expect(source).not.toMatch(FIRESTORE_WRITES);
    expect(source).not.toMatch(/firebase-admin|@supabase\/supabase-js/);
  });
});
