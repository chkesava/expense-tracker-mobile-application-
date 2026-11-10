/**
 * SPENDLY-593 (ADR v2 D2) — realtime from the read model.
 *
 * The database pings the owner's private Broadcast topic `user:<uid>` on every
 * real change to a synced table: table, doc ids, the deleted flag and
 * synced_at, never document data (migration 20261104000000). This module
 * listens and hands consumers (the on-device copy, SPENDLY-594) a change
 * stream; they refetch the rows through PostgREST, where RLS applies.
 *
 * - **Live:** one private channel per user. supabase-js re-reads the Firebase
 *   token (`accessToken`) on every heartbeat, so token refresh needs nothing here.
 * - **Reconnect:** what was missed comes from `readmodel_changes_since` (ids and
 *   times only, tombstones included: RLS hides those from plain reads), from the
 *   last synced_at seen, less an overlap.
 * - **Down:** the same catch-up, polled every 30 s until the channel is back,
 *   skipped while the app is in the background (SPENDLY-745: battery); the
 *   next tick after it returns catches up from the last change seen.
 * - **Too much to list:** a `resync` event; the consumer refetches the table (or all).
 *
 * Off unless `system_settings/global.readModel.realtime` is true; never in
 * duress, signed out, or Spendly Test.
 */

export type ReadModelChange = { table: string; docId: string; deleted: boolean; syncedAt: string };
export type ReadModelChangeEvent =
  | { kind: "changes"; changes: ReadModelChange[] }
  /** Refetch `table` (or everything, when absent): too many changes to list, or no baseline. */
  | { kind: "resync"; table?: string };

type BroadcastMessage = { payload?: unknown };
export type RealtimeChannelLike = {
  on(type: "broadcast", filter: { event: string }, callback: (message: BroadcastMessage) => void): RealtimeChannelLike;
  subscribe(callback?: (status: string, error?: unknown) => void): RealtimeChannelLike;
};
export type ChangesSinceRow = { table_name: string; doc_id: string; synced_at: string; deleted: boolean };

export type ReadModelRealtimeDeps = {
  canListen(): boolean;
  /** The user's private channel `user:<uid>`, or null when the read model isn't connected. */
  channel(uid: string): Promise<RealtimeChannelLike | null>;
  removeChannel(channel: RealtimeChannelLike): void;
  changesSince(since: string, limit: number): Promise<{ data: ChangesSinceRow[] | null; error: unknown }>;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  /** SPENDLY-745: false while the app is in the background; the poll skips its tick. */
  active?(): boolean;
  log?(event: string, detail: unknown): void;
  pollMs?: number;
  limit?: number;
};

/** Changes stamped up to this long before the last one seen are fetched again (a transaction's now() is its start). */
export const CATCH_UP_OVERLAP_MS = 60_000;
export const PING_EVENT = "changed";

const DOWN = new Set(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"]);

export function createReadModelRealtime(deps: ReadModelRealtimeDeps) {
  const pollMs = deps.pollMs ?? 30_000;
  const limit = deps.limit ?? 500;
  const listeners = new Set<(event: ReadModelChangeEvent) => void>();
  let uid: string | null = null;
  let channel: RealtimeChannelLike | null = null;
  let generation = 0;
  let lastSeen: string | null = null;
  let subscribedOnce = false;
  let poll: unknown = null;
  let state: "off" | "connecting" | "live" | "down" = "off";

  function emit(event: ReadModelChangeEvent) {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        deps.log?.("readModel.realtime.listener", error);
      }
    }
  }

  function seen(syncedAt: unknown) {
    if (typeof syncedAt !== "string" || Number.isNaN(Date.parse(syncedAt))) return;
    if (!lastSeen || Date.parse(syncedAt) > Date.parse(lastSeen)) lastSeen = syncedAt;
  }

  function onPing(message: BroadcastMessage) {
    const p = message.payload as { table?: unknown; synced_at?: unknown; resync?: unknown; changes?: unknown } | undefined;
    if (!p || typeof p.table !== "string") return;
    seen(p.synced_at);
    if (p.resync === true) {
      emit({ kind: "resync", table: p.table });
      return;
    }
    if (!Array.isArray(p.changes)) return;
    const changes: ReadModelChange[] = [];
    for (const c of p.changes as { doc_id?: unknown; deleted?: unknown }[]) {
      if (typeof c?.doc_id !== "string") continue;
      changes.push({ table: p.table, docId: c.doc_id, deleted: c.deleted === true, syncedAt: String(p.synced_at ?? "") });
    }
    if (changes.length) emit({ kind: "changes", changes });
  }

  async function catchUp(forGeneration: number) {
    if (forGeneration !== generation || !uid) return;
    if (!lastSeen) {
      // No baseline: the consumer must refetch to be sure it has everything.
      emit({ kind: "resync" });
      return;
    }
    const since = new Date(Date.parse(lastSeen) - CATCH_UP_OVERLAP_MS).toISOString();
    const { data, error } = await deps.changesSince(since, limit);
    if (forGeneration !== generation) return;
    if (error || !data) {
      deps.log?.("readModel.realtime.catchUp", error ?? "no data");
      return;
    }
    const changes = data.map((r) => ({ table: r.table_name, docId: r.doc_id, deleted: r.deleted === true, syncedAt: r.synced_at }));
    for (const c of changes) seen(c.syncedAt);
    if (changes.length) emit({ kind: "changes", changes });
    if (data.length >= limit) emit({ kind: "resync" });
  }

  function startPolling(forGeneration: number) {
    if (poll !== null) return;
    poll = deps.setInterval(() => {
      if (deps.active && !deps.active()) return;
      void catchUp(forGeneration);
    }, pollMs);
  }

  function stopPolling() {
    if (poll === null) return;
    deps.clearInterval(poll);
    poll = null;
  }

  async function start(nextUid: string, since?: string | null) {
    if (uid === nextUid && channel) return;
    stop();
    if (!deps.canListen()) return;
    const mine = ++generation;
    uid = nextUid;
    lastSeen = since ?? null;
    subscribedOnce = false;
    state = "connecting";
    let ch: RealtimeChannelLike | null = null;
    try {
      ch = await deps.channel(nextUid);
    } catch (error) {
      deps.log?.("readModel.realtime.connect", error);
    }
    if (mine !== generation) {
      if (ch) deps.removeChannel(ch);
      return;
    }
    if (!ch) {
      // Not connected (no role claim yet, offline…): poll until a later start.
      state = "down";
      startPolling(mine);
      return;
    }
    channel = ch;
    ch.on("broadcast", { event: PING_EVENT }, (message) => {
      if (mine === generation) onPing(message);
    }).subscribe((status, error) => {
      if (mine !== generation) return;
      if (status === "SUBSCRIBED") {
        const reconnect = subscribedOnce || since != null;
        subscribedOnce = true;
        state = "live";
        stopPolling();
        if (reconnect) void catchUp(mine);
      } else if (DOWN.has(status)) {
        if (state !== "down") deps.log?.("readModel.realtime.down", { status, error: error ?? null });
        state = "down";
        startPolling(mine);
      }
    });
  }

  function stop() {
    generation += 1;
    stopPolling();
    if (channel) deps.removeChannel(channel);
    channel = null;
    uid = null;
    state = "off";
  }

  return {
    start,
    stop,
    /** Every change event; returns the unsubscribe. */
    subscribe(listener: (event: ReadModelChangeEvent) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    status: () => ({ state, uid, lastSeen }),
  };
}

let shared: ReturnType<typeof createReadModelRealtime> | null = null;
// Kept apart from the feed, so a consumer may subscribe before it is configured.
const appListeners = new Set<(event: ReadModelChangeEvent) => void>();

/** The app's realtime feed (FinanceDataProvider configures it). */
export function configureReadModelRealtime(deps: ReadModelRealtimeDeps) {
  shared?.stop();
  shared = createReadModelRealtime(deps);
  shared.subscribe((event) => {
    for (const listener of appListeners) listener(event);
  });
  return shared;
}

/** Subscribe to the read model's change stream (SPENDLY-594's on-device copy). */
export function onReadModelChanges(listener: (event: ReadModelChangeEvent) => void): () => void {
  appListeners.add(listener);
  return () => appListeners.delete(listener);
}

/** The app feed's state, for diagnostics. */
export function readModelRealtimeStatus() {
  return shared?.status() ?? { state: "off" as const, uid: null, lastSeen: null };
}
