import type { ChangesSinceRow, ReadModelChangeEvent } from "@/lib/readModelRealtime";
import type { ClientWriteEntry } from "@/shared/utils/readModel/clientOutbox";
import { READ_MODEL_TABLES, type ReadModelRow, type TableSpec } from "@/shared/utils/readModel/mapping";

import type { LocalRow, LocalRowStore, LocalStoreFactory } from "./store";

/**
 * SPENDLY-594 (ADR v2 D1) — the on-device copy of the user's read-model rows,
 * the offline source once screens read Supabase (SPENDLY-673).
 *
 * - **Hydrate** (first start, or a table whose mapping changed): page every
 *   table through PostgREST by (synced_at, doc_id), resumably (the cursor is
 *   kept per table).
 * - **Catch up** after hydrating and on every later start: what changed since
 *   the last change seen (`readmodel_changes_since`: ids and times only,
 *   tombstones included). Live ids are refetched; deleted ones are removed.
 * - **Realtime** (SPENDLY-593): the same for each ping; `resync` rehydrates.
 * - **Overlay:** reads layer this device's outbox (SPENDLY-670) on top, so its
 *   own saves show at once, offline too.
 * - **Cap:** a table past its cap keeps its newest rows by synced_at and is
 *   marked partial; older history comes from Supabase online.
 * - **Safety:** never opened in duress or signed out (`canUse`); `wipe` on
 *   sign-out and account deletion; the store wipes itself for another uid.
 *
 * Rows are kept exactly as PostgREST returned them: money is a copy, never
 * computed here (READ_MODEL_RULES R4).
 */
export type FetchedRow = Record<string, unknown> & { doc_id: string; synced_at: string };
export type PageCursor = { syncedAt: string; docId: string };

export type LocalCopyDeps = {
  factory: LocalStoreFactory;
  canUse(): boolean;
  /** Live rows after `after` in (synced_at, doc_id) order. */
  fetchPage(table: string, after: PageCursor | null, limit: number): Promise<FetchedRow[]>;
  /** Live rows among `ids` (a tombstoned or missing id is simply absent). */
  fetchByIds(table: string, ids: string[]): Promise<FetchedRow[]>;
  changesSince(since: string, limit: number): Promise<ChangesSinceRow[]>;
  /** This device's unsent writes for `uid` (the outbox), for the overlay. */
  pending?(uid: string): ClientWriteEntry[];
  tables?: TableSpec[];
  pageSize?: number;
  changesLimit?: number;
  /** Max rows kept per table (default DEFAULT_CAP). */
  caps?: Record<string, number>;
  now(): number;
  log?(event: string, detail: unknown): void;
};

export const DEFAULT_CAP = 50_000;
/** Overlap on every catch-up: a transaction's now() (its synced_at) is its start, not its commit. */
export const LOCAL_CATCH_UP_OVERLAP_MS = 60_000;
/** Before a hydrate, changes are caught up from this long before it (covers device clock skew). */
export const HYDRATE_SKEW_MS = 5 * 60_000;

const hydratedKey = (t: string) => `table:${t}:hydrated`;
const cursorKey = (t: string) => `table:${t}:cursor`;
const partialKey = (t: string) => `table:${t}:partial`;
const LAST_SEEN = "lastSeen";
const HYDRATE_MARK = "hydrateMark";

const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : Date.parse(b) > Date.parse(a) ? b : a);
const toLocal = (r: FetchedRow): LocalRow => ({ docId: r.doc_id, syncedAt: r.synced_at, row: r });

export function createLocalCopy(deps: LocalCopyDeps) {
  const specs = new Map((deps.tables ?? READ_MODEL_TABLES).map((s) => [s.table, s]));
  const pageSize = deps.pageSize ?? 500;
  const changesLimit = deps.changesLimit ?? 500;
  const listeners = new Set<(tables: string[]) => void>();
  let store: LocalRowStore | null = null;
  let generation = 0;
  let chain: Promise<unknown> = Promise.resolve();
  type CopyState = "off" | "hydrating" | "ready" | "error";
  let state: CopyState = "off";
  const stateListeners = new Set<(state: CopyState) => void>();
  function setState(next: CopyState) {
    if (next === state) return;
    state = next;
    for (const l of stateListeners) {
      try {
        l(next);
      } catch (error) {
        deps.log?.("readModel.localCopy.listener", error);
      }
    }
  }

  /**
   * Store work runs one task at a time; a task from an older start does
   * nothing. A failed task (offline, a refused fetch) is logged and resolves
   * null: what it finished is kept, and the next start resumes from there.
   */
  function run<T>(task: (s: LocalRowStore, mine: number) => Promise<T>): Promise<T | null> {
    const mine = generation;
    const next = chain.then(async () => (store && mine === generation ? task(store, mine) : null));
    const settled = next.catch((error) => {
      if (mine === generation) setState("error");
      deps.log?.("readModel.localCopy", error);
      return null;
    });
    chain = settled;
    return settled;
  }

  function changed(tables: string[]) {
    if (!tables.length) return;
    for (const l of listeners) {
      try {
        l(tables);
      } catch (error) {
        deps.log?.("readModel.localCopy.listener", error);
      }
    }
  }

  async function seen(s: LocalRowStore, syncedAt: string | null) {
    const next = later(await s.getMeta(LAST_SEEN), syncedAt);
    if (next) await s.setMeta(LAST_SEEN, next);
  }

  async function cap(s: LocalRowStore, table: string) {
    const limit = deps.caps?.[table] ?? DEFAULT_CAP;
    if ((await s.count(table)) <= limit) return;
    const gone = await s.evictOldest(table, limit);
    await s.setMeta(partialKey(table), "1");
    deps.log?.("readModel.localCopy.cap", { table, evicted: gone, cap: limit });
  }

  async function hydrateTable(s: LocalRowStore, table: string, mine: number) {
    const raw = await s.getMeta(cursorKey(table));
    let cursor: PageCursor | null = raw ? (JSON.parse(raw) as PageCursor) : null;
    if (!cursor) {
      await s.clear(table);
      await s.setMeta(partialKey(table), null);
    }
    for (;;) {
      if (mine !== generation) return false;
      const rows = await deps.fetchPage(table, cursor, pageSize);
      if (mine !== generation) return false;
      if (rows.length) {
        await s.put(table, rows.map(toLocal));
        const last = rows[rows.length - 1];
        cursor = { syncedAt: last.synced_at, docId: last.doc_id };
        await s.setMeta(cursorKey(table), JSON.stringify(cursor));
        await seen(s, rows.reduce<string | null>((m, r) => later(m, r.synced_at), null));
      }
      if (rows.length < pageSize) break;
    }
    await cap(s, table);
    await s.setMeta(hydratedKey(table), "1");
    await s.setMeta(cursorKey(table), null);
    return true;
  }

  /** Applies changes (from a ping or a catch-up): refetch live rows, remove deleted ones. */
  async function applyChanges(s: LocalRowStore, changes: { table: string; docId: string; deleted: boolean; syncedAt: string }[]) {
    const byTable = new Map<string, { live: Set<string>; gone: Set<string> }>();
    let newest: string | null = null;
    for (const c of changes) {
      newest = later(newest, c.syncedAt || null);
      if (!specs.has(c.table)) continue;
      const entry = byTable.get(c.table) ?? { live: new Set(), gone: new Set() };
      if (c.deleted) {
        entry.gone.add(c.docId);
        entry.live.delete(c.docId);
      } else {
        entry.live.add(c.docId);
        entry.gone.delete(c.docId);
      }
      byTable.set(c.table, entry);
    }
    for (const [table, { live, gone }] of byTable) {
      const ids = [...live];
      const rows = ids.length ? await deps.fetchByIds(table, ids) : [];
      const found = new Set(rows.map((r) => r.doc_id));
      // A live id that came back missing was deleted (or hidden) since: remove it.
      const removed = [...gone, ...ids.filter((id) => !found.has(id))];
      if (rows.length) await s.put(table, rows.map(toLocal));
      if (removed.length) await s.remove(table, removed);
      if (rows.length) await cap(s, table);
    }
    await seen(s, newest);
    changed([...byTable.keys()]);
  }

  /** Everything since `since`, page by page (results are ordered by synced_at). */
  async function catchUp(s: LocalRowStore, since: string, mine: number): Promise<"ok" | "rehydrate"> {
    let from = new Date(Date.parse(since) - LOCAL_CATCH_UP_OVERLAP_MS).toISOString();
    for (;;) {
      if (mine !== generation) return "ok";
      const rows = await deps.changesSince(from, changesLimit);
      await applyChanges(s, rows.map((r) => ({ table: r.table_name, docId: r.doc_id, deleted: r.deleted === true, syncedAt: r.synced_at })));
      if (rows.length < changesLimit) return "ok";
      const last = rows[rows.length - 1].synced_at;
      // A full page all stamped at the same instant can't be paged by time.
      if (Date.parse(last) <= Date.parse(from)) return "rehydrate";
      from = last;
    }
  }

  async function hydrateAll(s: LocalRowStore, mine: number, tables: string[]) {
    setState("hydrating");
    const mark = (await s.getMeta(HYDRATE_MARK)) ?? new Date(deps.now() - HYDRATE_SKEW_MS).toISOString();
    await s.setMeta(HYDRATE_MARK, mark);
    for (const t of tables) {
      await s.setMeta(hydratedKey(t), null);
    }
    for (const t of tables) {
      if (!(await hydrateTable(s, t, mine))) return;
    }
    // Changes made while the tables were being read.
    if ((await catchUp(s, mark, mine)) === "rehydrate") deps.log?.("readModel.localCopy.catchUp", "full page at one instant after hydrate");
    // The hydrate's start is the floor for the next catch-up, even when it saw no rows.
    await seen(s, mark);
    await s.setMeta(HYDRATE_MARK, null);
    changed(tables);
  }

  return {
    /** Opens (or hydrates) the copy for `uid`; returns the last change seen, for realtime's catch-up. */
    async start(uid: string): Promise<{ lastSeen: string | null } | null> {
      if (store?.uid === uid) return { lastSeen: await store.getMeta(LAST_SEEN) };
      await this.stop();
      if (!deps.canUse()) return null;
      const mine = ++generation;
      let opened: LocalRowStore;
      try {
        opened = await deps.factory.open(uid);
      } catch (error) {
        setState("error");
        deps.log?.("readModel.localCopy.open", error);
        return null;
      }
      if (mine !== generation) {
        await opened.close();
        return null;
      }
      store = opened;
      await run(async (s, g) => {
        const missing: string[] = [];
        for (const t of specs.keys()) if ((await s.getMeta(hydratedKey(t))) !== "1") missing.push(t);
        // An interrupted hydrate resumes; anything unhydrated is (re)hydrated.
        const resuming = (await s.getMeta(HYDRATE_MARK)) !== null;
        const lastSeen = await s.getMeta(LAST_SEEN);
        if (lastSeen && !resuming && (await catchUp(s, lastSeen, g)) === "rehydrate") {
          await hydrateAll(s, g, [...specs.keys()]);
        } else if (missing.length) {
          await hydrateAll(s, g, missing);
        }
        if (g === generation) setState("ready");
      });
      return { lastSeen: (await run((s) => s.getMeta(LAST_SEEN))) ?? null };
    },

    /** A realtime event (onReadModelChanges). */
    applyEvent(event: ReadModelChangeEvent): Promise<unknown> {
      return run(async (s, g) => {
        if (event.kind === "changes") return applyChanges(s, event.changes);
        const tables = event.table ? (specs.has(event.table) ? [event.table] : []) : [...specs.keys()];
        if (tables.length) await hydrateAll(s, g, tables);
        if (g === generation) setState("ready");
      });
    },

    /** The table's rows, with this device's unsent writes on top. */
    async read(table: string): Promise<ReadModelRow[]> {
      const rows = (await run((s) => s.all(table))) ?? [];
      const byId = new Map(rows.map((r) => [r.docId, r.row as ReadModelRow]));
      const uid = store?.uid;
      if (uid && deps.pending) {
        for (const entry of deps.pending(uid)) {
          if (entry.uid !== uid || entry.table !== table) continue;
          if (entry.row) byId.set(entry.docId, entry.row);
          else byId.delete(entry.docId);
        }
      }
      return [...byId.values()];
    },

    /** Whether `table` holds only its newest rows (older ones come from Supabase online). */
    async isPartial(table: string): Promise<boolean> {
      return (await run((s) => s.getMeta(partialKey(table)))) === "1";
    },

    /** Notified with the tables that changed (SPENDLY-673's read store). */
    onChange(listener: (tables: string[]) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async stop() {
      generation += 1;
      const s = store;
      store = null;
      setState("off");
      await chain.catch(() => undefined);
      await s?.close();
    },

    /** Sign-out and account deletion: nothing of the copy stays on the device. */
    async wipe() {
      await this.stop();
      await deps.factory.destroy();
    },

    status: () => ({ state, uid: store?.uid ?? null }),

    /** Notified when the copy's state changes (SPENDLY-673: `supabase` waits for `ready`). */
    onState(listener: (state: CopyState) => void): () => void {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
  };
}
