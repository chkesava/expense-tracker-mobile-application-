/**
 * SPENDLY-588 — Firestore read inventory: what each listener and direct read
 * would cost under Firestore's billing rules, per collection.
 *
 * Pure accumulator (no SDK, no React Native). `lib/firestoreReadMeter.ts`
 * feeds it from the `@/lib/firestore` adapter in dev and perf builds only.
 *
 * Billing rules modelled (firebase.google.com/docs/firestore/pricing):
 * - a query costs one read per returned document, and at least one read even
 *   when it returns nothing;
 * - a listener is billed for every document added or changed while it
 *   listens;
 * - a listener that reconnects with offline persistence is billed only for
 *   changes, unless it was disconnected for more than 30 minutes, when it is
 *   billed "as if you had issued a brand-new query".
 *
 * So the first server snapshot of each listener is counted twice:
 * - `coldReads`: the full result (a launch more than 30 minutes after the last);
 * - `warmReads`: only the documents that changed against the cached view (a
 *   relaunch within 30 minutes).
 * Snapshots served from the cache, and ones that only echo this device's own
 * pending write, are never billed.
 *
 * Keys never contain document ids or uids: every document segment of a path
 * becomes `*` (`users/abc/expenses` → `users/* /expenses`, without the space).
 */

export type ReadInventoryKind = "query" | "doc";

export type SnapshotFacts = {
  kind: ReadInventoryKind;
  /** Documents in the snapshot (queries); 1 or 0 for a document (exists). */
  size: number;
  /** Documents added/modified/removed in this snapshot (queries only). */
  changes: number;
  fromCache: boolean;
  hasPendingWrites: boolean;
};

export type ReadInventoryRow = {
  key: string;
  /** Listeners attached in this session. */
  attaches: number;
  /** Listeners attached right now. */
  open: number;
  /** First server snapshot billed as a brand-new query. */
  coldReads: number;
  /** First server snapshot billed as changes only. */
  warmReads: number;
  /** Server snapshots after the first: changed documents. */
  updateReads: number;
  /** getDoc/getDocs calls answered by the server. */
  directGets: number;
  directReads: number;
  /** Documents delivered from the local cache (not billed). */
  cacheDocs: number;
};

export type ReadInventoryTotals = Omit<ReadInventoryRow, "key">;

type ListenerState = { key: string; sawServer: boolean };

const EMPTY_ROW: ReadInventoryTotals = {
  attaches: 0,
  open: 0,
  coldReads: 0,
  warmReads: 0,
  updateReads: 0,
  directGets: 0,
  directReads: 0,
  cacheDocs: 0,
};

/** `users/u1/accounts/a1/entries` → `users/* /accounts/* /entries` (no spaces). */
export function collectionKey(path: string | null | undefined): string {
  if (!path) return "unknown";
  const segments = path.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) return "unknown";
  return segments.map((s, i) => (i % 2 === 1 ? "*" : s)).join("/");
}

/** Billed reads for a one-shot get (`getDocs`/`getDoc`). */
export function billedGetReads(kind: ReadInventoryKind, size: number, fromCache: boolean): number {
  if (fromCache) return 0;
  return kind === "query" ? Math.max(1, size) : 1;
}

export function createReadInventory() {
  const rows = new Map<string, ReadInventoryRow>();
  const listeners = new Map<number, ListenerState>();
  let nextId = 1;
  let startedAt = Date.now();

  function row(key: string): ReadInventoryRow {
    let r = rows.get(key);
    if (!r) {
      r = { key, ...EMPTY_ROW };
      rows.set(key, r);
    }
    return r;
  }

  return {
    /** A listener was attached; returns its id. */
    attach(path: string | null | undefined): number {
      const id = nextId++;
      const key = collectionKey(path);
      listeners.set(id, { key, sawServer: false });
      const r = row(key);
      r.attaches += 1;
      r.open += 1;
      return id;
    },

    /**
     * The listener's path was unknown at attach time (some SDK queries hide
     * it); re-key it from its first document.
     */
    rekey(id: number, path: string | null | undefined): void {
      const l = listeners.get(id);
      const key = collectionKey(path);
      if (!l || l.key !== "unknown" || key === "unknown") return;
      const from = row(l.key);
      from.attaches -= 1;
      from.open -= 1;
      if (from.attaches === 0 && from.open === 0 && from.coldReads === 0 && from.cacheDocs === 0) {
        rows.delete(from.key);
      }
      l.key = key;
      const to = row(key);
      to.attaches += 1;
      to.open += 1;
    },

    snapshot(id: number, facts: SnapshotFacts): void {
      const l = listeners.get(id);
      if (!l) return;
      const r = row(l.key);
      if (facts.fromCache) {
        r.cacheDocs += facts.size;
        return;
      }
      if (!l.sawServer) {
        l.sawServer = true;
        if (facts.kind === "query") {
          r.coldReads += Math.max(1, facts.size);
          r.warmReads += facts.changes;
        } else {
          r.coldReads += 1;
          r.warmReads += 1;
        }
        return;
      }
      if (facts.hasPendingWrites) return;
      r.updateReads += facts.kind === "query" ? facts.changes : 1;
    },

    detach(id: number): void {
      const l = listeners.get(id);
      if (!l) return;
      listeners.delete(id);
      row(l.key).open -= 1;
    },

    get(path: string | null | undefined, kind: ReadInventoryKind, size: number, fromCache: boolean): void {
      const r = row(collectionKey(path));
      if (fromCache) {
        r.cacheDocs += size;
        return;
      }
      r.directGets += 1;
      r.directReads += billedGetReads(kind, size, fromCache);
    },

    /** Rows, most expensive cold launch first. */
    rows(): ReadInventoryRow[] {
      return [...rows.values()]
        .map((r) => ({ ...r }))
        .sort(
          (a, b) =>
            b.coldReads + b.directReads - (a.coldReads + a.directReads) ||
            b.updateReads - a.updateReads ||
            a.key.localeCompare(b.key)
        );
    },

    totals(): ReadInventoryTotals {
      const t = { ...EMPTY_ROW };
      for (const r of rows.values()) {
        for (const k of Object.keys(t) as (keyof ReadInventoryTotals)[]) t[k] += r[k];
      }
      return t;
    },

    sinceMs(): number {
      return Date.now() - startedAt;
    },

    /** Start a new measurement window. Open listeners stay tracked. */
    reset(): void {
      const open = new Map<string, number>();
      for (const l of listeners.values()) {
        open.set(l.key, (open.get(l.key) ?? 0) + 1);
        // Already served: later snapshots are updates in the new window too.
      }
      rows.clear();
      for (const [key, n] of open) row(key).open = n;
      startedAt = Date.now();
    },
  };
}

export type ReadInventory = ReturnType<typeof createReadInventory>;

/** A markdown table of the inventory, for pasting into the 588 report. */
export function formatReadInventory(rows: ReadInventoryRow[], totals: ReadInventoryTotals, sinceMs: number): string {
  const header =
    "| Collection | Attaches | Open | Cold reads | Warm reads | Update reads | Gets | Get reads | Cache docs |\n" +
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|";
  const line = (k: string, r: ReadInventoryTotals) =>
    `| ${k} | ${r.attaches} | ${r.open} | ${r.coldReads} | ${r.warmReads} | ${r.updateReads} | ${r.directGets} | ${r.directReads} | ${r.cacheDocs} |`;
  return [
    `Window: ${Math.round(sinceMs / 1000)} s`,
    "",
    header,
    ...rows.map((r) => line(`\`${r.key}\``, r)),
    line("**Total**", totals),
  ].join("\n");
}
