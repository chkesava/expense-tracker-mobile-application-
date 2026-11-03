/**
 * SPENDLY-670 — the app's writes into the read model (plan v2, ADR v2 §2).
 *
 * `commitMutations` names the paths it wrote; for each synced one this reads
 * the document from Firestore's local cache (the exact saved version, no
 * billed read), maps it with the shared mapper and queues it
 * (`shared/utils/readModel/clientOutbox.ts`). The queue is kept on the device
 * per user, so it survives a restart, and is sent in batches to
 * `rm_client_apply` (SPENDLY-669), with backoff while offline or while
 * Supabase is down.
 *
 * The SPENDLY-583 server push still runs after every save, and the nightly
 * repair after it: Firestore wins any difference. So nothing here is
 * load-bearing for correctness; it makes Supabase current sooner.
 *
 * Off unless `system_settings/global.readModel.clientWrites` is true (a
 * server-only setting: turning it off stops sending, with no release). Never
 * in duress, never signed out, never for another uid. In Spendly Test the
 * batches go to a no-op loopback instead of Supabase.
 */
import type { ReadModelUser } from "@/lib/readModelClient";
import {
  backoffMs,
  buildClientEntry,
  emptyQueue,
  enqueue,
  isRefusal,
  nextBatch,
  parseQueue,
  queueStats,
  settle,
  type CachedDoc,
  type ClientBatch,
  type ClientOutboxQueue,
  type ClientWriteEntry,
  type SendOutcome,
} from "@/shared/utils/readModel/clientOutbox";
import { pushRefFromPath, pushRefKey } from "@/shared/utils/readModel/pushRefs";

export type ClientWriteUser = ReadModelUser & { uid: string };

export type ClientWritesDeps = {
  getUser(): ClientWriteUser | null;
  /** False when off by setting, in duress, signed out, or the read model isn't set up. */
  canSend(): boolean;
  /** The cached document at `path`: null if deleted, undefined if not in the cache. */
  readCached(path: string): Promise<CachedDoc | undefined>;
  /** Sends one batch to `rm_client_apply`. */
  apply(user: ClientWriteUser, batch: ClientBatch): Promise<{ error: { code?: unknown; message?: unknown } | null }>;
  load(uid: string): Promise<unknown>;
  save(uid: string, queue: ClientOutboxQueue): Promise<void>;
  remove(uid: string): Promise<void>;
  now(): number;
  log(event: string, detail: unknown): void;
  debounceMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export type ClientWritesStats = {
  pending: number;
  oldestAgeMs: number | null;
  dropped: number;
  sent: number;
  refused: number;
  failed: number;
  skippedNotCached: number;
};

export function createClientWriteOutbox(deps: ClientWritesDeps) {
  const debounceMs = deps.debounceMs ?? 500;
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let queue: ClientOutboxQueue | null = null;
  let loading: Promise<ClientOutboxQueue> | null = null;
  let timer: unknown = null;
  let running = false;
  let warned = false;
  const counts = { sent: 0, refused: 0, failed: 0, skippedNotCached: 0 };

  const warnOnce = (event: string, detail: unknown) => {
    if (warned) return;
    warned = true;
    deps.log(event, detail);
  };

  /** This uid's queue, loaded from the device once. Another uid's is never kept. */
  async function queueFor(uid: string): Promise<ClientOutboxQueue> {
    if (queue?.uid === uid) return queue;
    if (!loading) {
      loading = deps
        .load(uid)
        .then((raw) => parseQueue(raw, uid))
        .catch(() => emptyQueue(uid))
        .finally(() => {
          loading = null;
        });
    }
    const loaded = await loading;
    if (loaded.uid !== uid) return queueFor(uid);
    // A note() that ran while loading may already hold newer entries.
    queue = queue?.uid === uid ? enqueue(loaded, queue.entries) : loaded;
    return queue;
  }

  async function persist(q: ClientOutboxQueue): Promise<void> {
    await deps.save(q.uid, q).catch((error) => warnOnce("readModel.clientWrites.save", error));
  }

  function schedule(ms: number) {
    if (timer) return;
    timer = setTimer(() => {
      timer = null;
      void flush();
    }, ms);
  }

  /** Queues the synced documents among `paths` that this device just wrote. */
  async function note(uid: string, paths: string[]): Promise<void> {
    if (!deps.canSend()) return;
    const user = deps.getUser();
    if (!user || user.uid !== uid) return;
    const refs = new Map<string, { collection: string; docId: string }>();
    for (const path of paths) {
      const ref = pushRefFromPath(path, uid);
      if (ref) refs.set(pushRefKey(ref), ref);
    }
    if (refs.size === 0) return;
    const at = new Date(deps.now()).toISOString();
    const added: ClientWriteEntry[] = [];
    for (const ref of refs.values()) {
      const doc = await deps.readCached(`users/${uid}/${ref.collection}/${ref.docId}`);
      if (doc === undefined) {
        counts.skippedNotCached += 1;
        continue; // the server push copies it
      }
      try {
        const entry = buildClientEntry({ uid, collection: ref.collection, docId: ref.docId, doc, at });
        if (entry) added.push(entry);
      } catch (error) {
        warnOnce("readModel.clientWrites.map", error);
      }
    }
    if (added.length === 0) return;
    const q = enqueue(await queueFor(uid), added);
    queue = q;
    await persist(q);
    schedule(debounceMs);
  }

  /** Sends batches until the queue is empty, a send fails, or sending stops being allowed. */
  async function flush(): Promise<void> {
    if (running) {
      schedule(debounceMs);
      return;
    }
    running = true;
    try {
      for (;;) {
        const user = deps.getUser();
        if (!user || !deps.canSend()) return;
        let q = await queueFor(user.uid);
        const batch = nextBatch(q);
        if (!batch) return;
        let outcome: SendOutcome;
        try {
          const { error } = await deps.apply(user, batch);
          outcome = !error ? "ok" : isRefusal(error) ? "refused" : "retry";
          if (error) warnOnce(outcome === "refused" ? "readModel.clientWrites.refused" : "readModel.clientWrites.failed", error);
        } catch (error) {
          outcome = "retry";
          warnOnce("readModel.clientWrites.failed", error);
        }
        const sentCount = batch.sent.length;
        if (outcome === "ok") counts.sent += sentCount;
        else if (outcome === "refused") counts.refused += sentCount;
        else counts.failed += sentCount;
        // The queue may have grown while the batch was in flight.
        q = settle(queue?.uid === user.uid ? queue : q, batch, outcome);
        queue = q;
        await persist(q);
        if (outcome === "retry") {
          const attempts = Math.max(1, ...q.entries.map((e) => e.attempts));
          schedule(backoffMs(attempts));
          return;
        }
      }
    } finally {
      running = false;
    }
  }

  /** Try now (for example, back online), dropping any backoff wait. */
  function kick() {
    if (timer) {
      clearTimer(timer);
      timer = null;
    }
    schedule(0);
  }

  /** Sign-out or account deletion: this uid's queue leaves the device. */
  async function forget(uid: string): Promise<void> {
    if (queue?.uid === uid) queue = null;
    await deps.remove(uid).catch(() => undefined);
  }

  /** Loads a signed-in user's saved queue and sends it. */
  async function resume(uid: string): Promise<void> {
    if (!deps.canSend()) return;
    const q = await queueFor(uid);
    if (q.entries.length) schedule(debounceMs);
  }

  function stats(): ClientWritesStats {
    const s = queue ? queueStats(queue, deps.now()) : { pending: 0, oldestAgeMs: null, dropped: 0 };
    return { ...s, ...counts };
  }

  return { note, flush, kick, forget, resume, stats };
}

type ClientWriteOutbox = ReturnType<typeof createClientWriteOutbox>;

let outbox: ClientWriteOutbox | null = null;

/** Called once by FinanceDataProvider. */
export function configureClientWrites(deps: ClientWritesDeps): ClientWriteOutbox {
  outbox = createClientWriteOutbox(deps);
  return outbox;
}

/** `commitMutations` hook: the paths it just wrote (any not synced are ignored). */
export function notifyClientWrites(uid: string, paths: string[]): void {
  if (!outbox) return;
  void outbox.note(uid, paths).catch(() => undefined);
}

export function clientWritesStats(): ClientWritesStats | null {
  return outbox?.stats() ?? null;
}

/** Tests only. */
export function resetClientWritesForTests(): void {
  outbox = null;
}

export const CLIENT_OUTBOX_STORAGE_PREFIX = "spendly.rmClientOutbox.v1.";
