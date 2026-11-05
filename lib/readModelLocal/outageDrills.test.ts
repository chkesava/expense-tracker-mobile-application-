import { describe, expect, it } from "vitest";

import { createReadModelRealtime, type ChangesSinceRow, type RealtimeChannelLike } from "@/lib/readModelRealtime";
import type { ClientWriteEntry } from "@/shared/utils/readModel/clientOutbox";
import { effectiveCollectionMode, READ_MODEL_COLLECTIONS } from "@/shared/utils/readModel/collectionMode";
import { SPEC_BY_COLLECTION, type TableSpec } from "@/shared/utils/readModel/mapping";
import { localCopyEnabled } from "@/shared/utils/readModelMode";

import { createLocalCopy, type FetchedRow, type PageCursor } from "./localCopy";
import { createCollectionSource, type SourceDoc } from "./readSource";
import { memoryStoreFactory } from "./store";

/**
 * SPENDLY-601 — the plan v2 read-path drills, app side. The pieces are the
 * real ones (the on-device copy, realtime, the read store, the switch
 * decision); only the network is fake: a read model that can go down.
 *
 * The server-side drills (outbox drain, rejection, divergence, the one-write
 * rollback) are in scripts/readmodel-drill.ts (D8–D11).
 */
const tables: TableSpec[] = [SPEC_BY_COLLECTION.get("expenses")!, SPEC_BY_COLLECTION.get("accounts")!];
type ServerRow = FetchedRow & { source_deleted: boolean };
const flush = () => new Promise((r) => setTimeout(r, 0));

/** A read model that can be taken down (paused, unreachable, airplane mode). */
function fakeReadModel() {
  const t: Record<string, Map<string, ServerRow>> = { expenses: new Map(), accounts: new Map() };
  let clock = Date.parse("2026-11-05T10:00:00.000Z");
  const tick = () => new Date((clock += 1000)).toISOString();
  let up = true;
  const guard = () => {
    if (!up) throw new Error("read model unreachable");
  };
  return {
    t,
    setUp: (v: boolean) => (up = v),
    write(table: string, id: string, data: Record<string, unknown> = {}) {
      t[table].set(id, { doc_id: id, uid: "u1", synced_at: tick(), source_deleted: false, ...data });
    },
    async fetchPage(table: string, after: PageCursor | null, limit: number) {
      guard();
      return [...t[table].values()]
        .filter((r) => !r.source_deleted)
        .sort((a, b) => a.synced_at.localeCompare(b.synced_at) || a.doc_id.localeCompare(b.doc_id))
        .filter((r) => !after || r.synced_at > after.syncedAt || (r.synced_at === after.syncedAt && r.doc_id > after.docId))
        .slice(0, limit);
    },
    async fetchByIds(table: string, ids: string[]) {
      guard();
      return ids.map((id) => t[table].get(id)).filter((r): r is ServerRow => !!r && !r.source_deleted);
    },
    async changesSince(since: string, limit: number): Promise<ChangesSinceRow[]> {
      guard();
      return Object.entries(t)
        .flatMap(([table, rows]) => [...rows.values()].map((r) => ({ table_name: table, doc_id: r.doc_id, synced_at: r.synced_at, deleted: r.source_deleted })))
        .filter((r) => r.synced_at > since)
        .sort((a, b) => a.synced_at.localeCompare(b.synced_at))
        .slice(0, limit);
    },
    now: () => clock,
  };
}

function device(server = fakeReadModel()) {
  let pending: ClientWriteEntry[] = [];
  const copy = createLocalCopy({
    factory: memoryStoreFactory(),
    canUse: () => true,
    fetchPage: (table, after, limit) => server.fetchPage(table, after, limit),
    fetchByIds: (table, ids) => server.fetchByIds(table, ids),
    changesSince: (since, limit) => server.changesSince(since, limit),
    pending: () => pending,
    tables,
    pageSize: 50,
    changesLimit: 50,
    now: () => server.now(),
  });
  return { server, copy, setPending: (p: ClientWriteEntry[]) => (pending = p) };
}

/** Realtime wired to the copy the way FinanceDataProvider wires it. */
function realtimeFor(d: ReturnType<typeof device>) {
  let status: ((s: string) => void) | null = null;
  const channel: RealtimeChannelLike = {
    on: () => channel,
    subscribe: (cb) => {
      status = cb ?? null;
      return channel;
    },
  };
  const timers: (() => void)[] = [];
  const rt = createReadModelRealtime({
    canListen: () => true,
    channel: async () => channel,
    removeChannel: () => {},
    changesSince: async (since) => {
      try {
        return { data: await d.server.changesSince(since, 50), error: null };
      } catch (error) {
        return { data: null, error: { message: String(error) } };
      }
    },
    setInterval: (fn) => timers.push(fn) - 1,
    clearInterval: (h) => {
      timers[h as number] = () => {};
    },
    pollMs: 30_000,
    limit: 50,
  });
  rt.subscribe((event) => void d.copy.applyEvent(event));
  return { rt, status: (s: string) => status?.(s), poll: () => timers.forEach((fn) => fn()) };
}

const docIds = (rows: { doc_id: unknown }[]) => rows.map((r) => String(r.doc_id)).sort();

describe("plan v2 read-path drills (SPENDLY-601)", () => {
  it("R1 realtime down: the copy keeps up by polling the catch-up, and stops polling once live again", async () => {
    const d = device();
    d.server.write("expenses", "e1", { amount: 10 });
    const lastSeen = (await d.copy.start("u1"))?.lastSeen ?? null;
    const live = realtimeFor(d);
    await live.rt.start("u1", lastSeen);
    live.status("CHANNEL_ERROR");
    expect(live.rt.status().state).toBe("down");

    d.server.write("expenses", "e2", { amount: 20 }); // saved on another device while realtime is down
    live.poll();
    await flush();
    await flush();
    expect(docIds(await d.copy.read("expenses"))).toEqual(["e1", "e2"]);

    live.status("SUBSCRIBED");
    await flush();
    expect(live.rt.status().state).toBe("live");
  });

  it("R2 airplane mode: the copy still serves every row, with this device's unsent save on top; nothing throws", async () => {
    const d = device();
    d.server.write("expenses", "e1", { amount: 10 });
    d.server.write("accounts", "a1", { current_balance: 1500.25 });
    await d.copy.start("u1");
    d.server.setUp(false);
    const at = "2026-11-05T11:00:00.000Z";
    d.setPending([{ key: "expenses/new", table: "expenses", uid: "u1", docId: "new", at, attempts: 0, row: { uid: "u1", doc_id: "new", amount: 7, client_written_at: at } as never }]);

    const source = createCollectionSource({ collection: "expenses", copy: () => d.copy });
    const seen: SourceDoc[][] = [];
    const errors: unknown[] = [];
    const off = source.subscribe((docs) => seen.push(docs), (e) => errors.push(e));
    await flush();
    off();
    expect(errors).toEqual([]);
    expect(seen.at(-1)!.map((x) => x.id).sort()).toEqual(["e1", "new"]);
    expect((await d.copy.read("accounts"))[0]).toMatchObject({ current_balance: 1500.25 }); // money exactly as copied

    // A cold launch offline (the app restarted in airplane mode) reopens the copy: no wipe, no rehydrate.
    await d.copy.stop();
    const reopened = await d.copy.start("u1");
    // A hydrated copy opens offline as ready, so supabase-mode screens keep reading it.
    expect(d.copy.status().state).toBe("ready");
    expect(docIds(await d.copy.read("expenses"))).toEqual(["e1", "new"]);
    expect(reopened?.lastSeen).toBeTruthy(); // realtime catches up from here when the network is back

    // Back online: the next start catches up what changed meanwhile.
    d.server.setUp(true);
    d.server.write("expenses", "e3", { amount: 30 });
    await d.copy.stop();
    await d.copy.start("u1");
    expect(docIds(await d.copy.read("expenses"))).toEqual(["e1", "e3", "new"]);
  });

  it("R3 Supabase paused on first launch: the copy can't fill, so every collection reads Firestore", async () => {
    const d = device();
    d.server.setUp(false);
    const started = await d.copy.start("u1");
    expect(started?.lastSeen ?? null).toBeNull();
    expect(d.copy.status().state).toBe("error");
    const setting = { localCopy: true, expenses: "supabase", accounts: "supabase", categories: "shadow" };
    for (const collection of ["expenses", "accounts"]) {
      const decision = effectiveCollectionMode({
        setting, collection, envConfigured: true, localTestMode: false, duress: false, signedIn: true,
        localCopyOn: localCopyEnabled(setting), copyState: d.copy.status().state, fellBack: false,
      });
      expect(decision.mode).toBe("firestore");
    }
  });

  it("R4 a copy failure mid-session reports an error, so that collection falls back to Firestore for the session", async () => {
    const failing = { read: async () => { throw new Error("disk"); }, onChange: () => () => {}, status: () => ({ state: "ready" as const, uid: "u1" }) };
    const source = createCollectionSource({ collection: "expenses", copy: () => failing as never });
    const errors: unknown[] = [];
    source.subscribe(() => {}, (e) => errors.push(e));
    await flush();
    expect(errors).toHaveLength(1);
    const decision = effectiveCollectionMode({
      setting: { localCopy: true, expenses: "supabase" }, collection: "expenses", envConfigured: true, localTestMode: false,
      duress: false, signedIn: true, localCopyOn: true, copyState: "ready", fellBack: true,
    });
    expect(decision).toMatchObject({ mode: "firestore", reason: "fell back this session" });
  });

  it("R5 one write turns every collection back to Firestore (readModel.localCopy = false), with no release", () => {
    const setting: Record<string, unknown> = { localCopy: true };
    for (const c of READ_MODEL_COLLECTIONS) setting[c] = "supabase";
    const on = (s: Record<string, unknown>) =>
      READ_MODEL_COLLECTIONS.map((collection) =>
        effectiveCollectionMode({
          setting: s, collection, envConfigured: true, localTestMode: false, duress: false, signedIn: true,
          localCopyOn: localCopyEnabled(s), copyState: "ready", fellBack: false,
        }).mode
      );
    expect(new Set(on(setting))).toEqual(new Set(["supabase"]));
    const rolledBack = { ...setting, localCopy: false }; // `readmodel-set-mode.ts --switch=localCopy --value=false --apply`
    expect(new Set(on(rolledBack))).toEqual(new Set(["firestore"]));
    // The per-collection settings are kept, so turning it back on restores them.
    expect(new Set(on({ ...rolledBack, localCopy: true }))).toEqual(new Set(["supabase"]));
  });

  it("R6 realtime off: back in the foreground the copy catches up; offline, a refresh keeps the copy ready", async () => {
    const d = device();
    d.server.write("expenses", "e1", { amount: 10 });
    await d.copy.start("u1");
    d.server.write("expenses", "e2", { amount: 20 }); // another device, no realtime ping
    expect(docIds(await d.copy.read("expenses"))).toEqual(["e1"]);
    await d.copy.refresh(); // FinanceDataProvider: AppState "active", realtime not live
    expect(docIds(await d.copy.read("expenses"))).toEqual(["e1", "e2"]);

    d.server.setUp(false);
    await d.copy.refresh();
    expect(d.copy.status().state).toBe("ready");
    expect(docIds(await d.copy.read("expenses"))).toEqual(["e1", "e2"]);
  });
});

