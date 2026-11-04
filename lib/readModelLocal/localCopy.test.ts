import { describe, expect, it, vi } from "vitest";

import type { ClientWriteEntry } from "@/shared/utils/readModel/clientOutbox";
import { SPEC_BY_COLLECTION, type TableSpec } from "@/shared/utils/readModel/mapping";

import { createLocalCopy, type FetchedRow, type LocalCopyDeps, type PageCursor } from "./localCopy";
import { memoryStoreFactory } from "./store";

const tables: TableSpec[] = [SPEC_BY_COLLECTION.get("expenses")!, SPEC_BY_COLLECTION.get("accounts")!];
type ServerRow = FetchedRow & { source_deleted: boolean };

/** A fake read model: live rows through "PostgREST", the change list through the RPC. */
function fakeServer() {
  const t: Record<string, Map<string, ServerRow>> = { expenses: new Map(), accounts: new Map() };
  let clock = Date.parse("2026-11-04T10:00:00.000Z");
  const tick = () => new Date((clock += 1000)).toISOString();
  const calls = { pages: 0, byIds: 0, changes: 0 };
  return {
    t,
    calls,
    write(table: string, id: string, data: Record<string, unknown> = {}) {
      t[table].set(id, { doc_id: id, synced_at: tick(), source_deleted: false, uid: "u1", ...data });
    },
    del(table: string, id: string) {
      const r = t[table].get(id)!;
      t[table].set(id, { ...r, source_deleted: true, synced_at: tick() });
    },
    async fetchPage(table: string, after: PageCursor | null, limit: number) {
      calls.pages += 1;
      return [...t[table].values()]
        .filter((r) => !r.source_deleted)
        .sort((a, b) => a.synced_at.localeCompare(b.synced_at) || a.doc_id.localeCompare(b.doc_id))
        .filter((r) => !after || r.synced_at > after.syncedAt || (r.synced_at === after.syncedAt && r.doc_id > after.docId))
        .slice(0, limit);
    },
    async fetchByIds(table: string, ids: string[]) {
      calls.byIds += 1;
      return ids.map((id) => t[table].get(id)).filter((r): r is ServerRow => !!r && !r.source_deleted);
    },
    async changesSince(since: string, limit: number) {
      calls.changes += 1;
      return Object.entries(t)
        .flatMap(([table, rows]) => [...rows.values()].map((r) => ({ table_name: table, doc_id: r.doc_id, synced_at: r.synced_at, deleted: r.source_deleted })))
        .filter((r) => r.synced_at > since)
        .sort((a, b) => a.synced_at.localeCompare(b.synced_at))
        .slice(0, limit);
    },
    now: () => clock,
  };
}

function setup(over: Partial<LocalCopyDeps> = {}) {
  const server = fakeServer();
  const factory = memoryStoreFactory();
  let pending: ClientWriteEntry[] = [];
  const deps: LocalCopyDeps = {
    factory,
    canUse: () => true,
    fetchPage: (t, a, l) => server.fetchPage(t, a, l),
    fetchByIds: (t, ids) => server.fetchByIds(t, ids),
    changesSince: (s, l) => server.changesSince(s, l),
    pending: () => pending,
    tables,
    pageSize: 2,
    changesLimit: 3,
    now: () => server.now(),
    ...over,
  };
  const copy = createLocalCopy(deps);
  return { copy, server, factory, deps, setPending: (p: ClientWriteEntry[]) => (pending = p) };
}

const ids = (rows: { doc_id: unknown }[]) => rows.map((r) => String(r.doc_id)).sort();

describe("the on-device copy (SPENDLY-594)", () => {
  it("hydrates every table page by page, live rows only, rows exactly as served", async () => {
    const s = setup();
    for (const id of ["e1", "e2", "e3", "e4", "e5"]) s.server.write("expenses", id, { amount: 10 });
    s.server.write("accounts", "a1", { current_balance: 1234.56 });
    s.server.del("expenses", "e3");
    const res = await s.copy.start("u1");
    expect(ids(await s.copy.read("expenses"))).toEqual(["e1", "e2", "e4", "e5"]);
    expect((await s.copy.read("accounts"))[0]).toMatchObject({ doc_id: "a1", current_balance: 1234.56 });
    expect(res?.lastSeen).toBeTruthy();
    expect(s.copy.status()).toMatchObject({ state: "ready", uid: "u1" });
  });

  it("an interrupted hydrate resumes from its cursor instead of starting over", async () => {
    const s = setup();
    for (const id of ["e1", "e2", "e3", "e4", "e5"]) s.server.write("expenses", id);
    let failAfter = 2;
    s.deps.fetchPage = async (t, a, l) => {
      if (t === "expenses" && failAfter-- <= 0) throw new Error("offline");
      return s.server.fetchPage(t, a, l);
    };
    await s.copy.start("u1");
    await s.copy.stop();
    s.deps.fetchPage = vi.fn((t, a, l) => s.server.fetchPage(t, a, l));
    await s.copy.start("u1");
    expect(ids(await s.copy.read("expenses"))).toEqual(["e1", "e2", "e3", "e4", "e5"]);
    // Resumed after e4: only the rest was read again (plus the accounts table).
    expect(vi.mocked(s.deps.fetchPage).mock.calls.find(([t]) => t === "expenses")?.[1]).toMatchObject({ docId: "e4" });
  });

  it("on the next start it catches up: new, changed and deleted rows", async () => {
    const s = setup();
    s.server.write("expenses", "e1", { amount: 1 });
    s.server.write("expenses", "e2", { amount: 2 });
    await s.copy.start("u1");
    await s.copy.stop();
    s.server.write("expenses", "e1", { amount: 100 });
    s.server.del("expenses", "e2");
    s.server.write("expenses", "e9", { amount: 9 });
    const pagesBefore = s.server.calls.pages;
    await s.copy.start("u1");
    const rows = await s.copy.read("expenses");
    expect(ids(rows)).toEqual(["e1", "e9"]);
    expect(rows.find((r) => r.doc_id === "e1")).toMatchObject({ amount: 100 });
    expect(s.server.calls.pages).toBe(pagesBefore); // no re-hydrate
  });

  it("a catch-up larger than one page pages on by time", async () => {
    const s = setup();
    await s.copy.start("u1");
    await s.copy.stop();
    for (const id of ["n1", "n2", "n3", "n4", "n5", "n6", "n7"]) s.server.write("expenses", id);
    await s.copy.start("u1");
    expect(ids(await s.copy.read("expenses"))).toEqual(["n1", "n2", "n3", "n4", "n5", "n6", "n7"]);
  });

  it("applies realtime pings: refetch live ids, remove deletes, and a live id that is gone", async () => {
    const s = setup();
    s.server.write("expenses", "e1");
    s.server.write("expenses", "e2");
    await s.copy.start("u1");
    const notified: string[][] = [];
    s.copy.onChange((t) => notified.push(t));
    s.server.write("expenses", "e3", { amount: 3 });
    s.server.del("expenses", "e2");
    s.server.t.expenses.delete("e1"); // purged meanwhile
    await s.copy.applyEvent({
      kind: "changes",
      changes: [
        { table: "expenses", docId: "e3", deleted: false, syncedAt: "2026-11-04T10:01:00.000Z" },
        { table: "expenses", docId: "e2", deleted: true, syncedAt: "2026-11-04T10:01:00.000Z" },
        { table: "expenses", docId: "e1", deleted: false, syncedAt: "2026-11-04T10:01:00.000Z" },
        { table: "not_synced", docId: "x", deleted: false, syncedAt: "2026-11-04T10:01:00.000Z" },
      ],
    });
    expect(ids(await s.copy.read("expenses"))).toEqual(["e3"]);
    expect(notified).toEqual([["expenses"]]);
  });

  it("a resync ping rehydrates that table, dropping what the server no longer has", async () => {
    const s = setup();
    s.server.write("expenses", "e1");
    s.server.write("accounts", "a1");
    await s.copy.start("u1");
    s.server.t.expenses.clear();
    s.server.write("expenses", "fresh");
    await s.copy.applyEvent({ kind: "resync", table: "expenses" });
    expect(ids(await s.copy.read("expenses"))).toEqual(["fresh"]);
    expect(ids(await s.copy.read("accounts"))).toEqual(["a1"]);
  });

  it("reads layer this device's unsent writes on top (own saves show offline)", async () => {
    const s = setup();
    s.server.write("expenses", "e1", { amount: 1 });
    s.server.write("expenses", "e2", { amount: 2 });
    await s.copy.start("u1");
    const at = "2026-11-04T11:00:00.000Z";
    s.setPending([
      { key: "expenses/e1", table: "expenses", uid: "u1", docId: "e1", at, attempts: 0, row: { uid: "u1", doc_id: "e1", amount: 50, client_written_at: at } as never },
      { key: "expenses/e2", table: "expenses", uid: "u1", docId: "e2", at, attempts: 0 },
      { key: "expenses/new", table: "expenses", uid: "u1", docId: "new", at, attempts: 0, row: { uid: "u1", doc_id: "new", amount: 7, client_written_at: at } as never },
      { key: "expenses/other", table: "expenses", uid: "u2", docId: "other", at, attempts: 0, row: { uid: "u2", doc_id: "other" } as never },
    ]);
    const rows = await s.copy.read("expenses");
    expect(ids(rows)).toEqual(["e1", "new"]);
    expect(rows.find((r) => r.doc_id === "e1")).toMatchObject({ amount: 50 });
  });

  it("never opens in duress or signed out", async () => {
    const s = setup({ canUse: () => false });
    const open = vi.spyOn(s.factory, "open");
    expect(await s.copy.start("u1")).toBeNull();
    expect(open).not.toHaveBeenCalled();
    expect(await s.copy.read("expenses")).toEqual([]);
  });

  it("wipe removes the copy; another user never sees the previous one's rows", async () => {
    const s = setup();
    s.server.write("expenses", "e1");
    await s.copy.start("u1");
    const destroy = vi.spyOn(s.factory, "destroy");
    await s.copy.wipe();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(s.copy.status().state).toBe("off");
    // And even without a wipe, opening for another uid starts empty.
    await s.copy.start("u1");
    await s.copy.stop();
    s.server.t.expenses.clear();
    await s.copy.start("u2");
    expect(await s.copy.read("expenses")).toEqual([]);
  });

  it("a table past its cap keeps its newest rows and is marked partial", async () => {
    const s = setup({ caps: { expenses: 3 } });
    for (const id of ["e1", "e2", "e3", "e4", "e5"]) s.server.write("expenses", id);
    await s.copy.start("u1");
    expect(ids(await s.copy.read("expenses"))).toEqual(["e3", "e4", "e5"]);
    expect(await s.copy.isPartial("expenses")).toBe(true);
    expect(await s.copy.isPartial("accounts")).toBe(false);
  });
});
