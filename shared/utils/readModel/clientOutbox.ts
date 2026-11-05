/**
 * SPENDLY-670 — the on-device outbox for the app's writes into the read
 * model (plan v2: every save goes to Firestore and to Supabase).
 *
 * Pure: no SDK, no React Native. `lib/readModelClientWrites.ts` feeds it
 * from `commitMutations` and sends its batches to `rm_client_apply`
 * (SPENDLY-669).
 *
 * - One entry per document: a newer save of the same document replaces the
 *   older entry (the newest version is all Supabase needs, and the RPC's
 *   version guard would ignore an older one anyway).
 * - A batch is one table, at most `MAX_BATCH` rows and `MAX_BATCH` deletes
 *   (the RPC's cap), taken from the table holding the oldest entry.
 * - Sending is idempotent: a batch sent twice is a no-op the second time
 *   (the RPC's guard compares `client_written_at`).
 * - A refused batch (the database rejected its input) is dropped, so one bad
 *   row can't block the queue; the server push and the nightly repair copy
 *   Firestore's version anyway. A failed batch (network, server) stays and is
 *   retried with backoff.
 */
import { isExcludedDoc, mapDocumentWithReason, SPEC_BY_COLLECTION, type ReadModelRow } from "./mapping";

/** `rm_client_apply` takes at most this many rows and deletes per call. */
export const MAX_BATCH = 50;
/** Beyond this the oldest entries are dropped (the push and nightly repair cover them). */
export const MAX_QUEUE = 2000;

export type ClientWriteEntry = {
  /** `<table>/<doc_id>`: one entry per document. */
  key: string;
  table: string;
  uid: string;
  docId: string;
  /** The device's save time (ISO), sent as `client_written_at`. */
  at: string;
  /** The mapped row, or absent for a delete. */
  row?: ReadModelRow & { client_written_at: string };
  attempts: number;
};

export type ClientOutboxQueue = { uid: string; entries: ClientWriteEntry[]; dropped: number };

export const emptyQueue = (uid: string): ClientOutboxQueue => ({ uid, entries: [], dropped: 0 });

/** The cached Firestore document a write left behind, or null if it was deleted. */
export type CachedDoc = { id: string; data: Record<string, unknown> } | null;

/**
 * The outbox entry for one written document, or null when its collection
 * isn't synced. `doc` is what Firestore's local cache holds right after the
 * write (null: the document was deleted).
 */
export function buildClientEntry(input: {
  uid: string;
  collection: string;
  docId: string;
  doc: CachedDoc;
  at: string;
}): ClientWriteEntry | null {
  const spec = SPEC_BY_COLLECTION.get(input.collection);
  // The users/{uid} copy is server-push only (SPENDLY-591): never via rm_client_apply.
  if (!spec || spec.root || isExcludedDoc(spec, input.docId)) return null;
  const base = { key: `${spec.table}/${input.docId}`, table: spec.table, uid: input.uid, docId: input.docId, at: input.at, attempts: 0 };
  if (!input.doc) return base;
  // The mapper needs an update time; the RPC sets source_update_time from
  // client_written_at and ignores this one.
  const { row } = mapDocumentWithReason(spec, input.uid, { id: input.docId, data: input.doc.data, updateTime: input.at });
  return { ...base, row: { ...row, client_written_at: input.at } };
}

/** Adds entries, keeping only the newest per document and at most `MAX_QUEUE`. */
export function enqueue(queue: ClientOutboxQueue, added: ClientWriteEntry[]): ClientOutboxQueue {
  const byKey = new Map(queue.entries.map((e) => [e.key, e]));
  for (const entry of added) {
    if (entry.uid !== queue.uid) continue;
    const current = byKey.get(entry.key);
    if (!current || Date.parse(entry.at) >= Date.parse(current.at)) byKey.set(entry.key, entry);
  }
  let entries = [...byKey.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  let dropped = queue.dropped;
  if (entries.length > MAX_QUEUE) {
    dropped += entries.length - MAX_QUEUE;
    entries = entries.slice(entries.length - MAX_QUEUE);
  }
  return { uid: queue.uid, entries, dropped };
}

export type ClientBatch = {
  table: string;
  rows: (ReadModelRow & { client_written_at: string })[];
  deletes: { uid: string; doc_id: string; client_written_at: string }[];
  /** The entries sent, as they were (to settle exactly these). */
  sent: { key: string; at: string }[];
};

/** The next batch: the table holding the oldest entry, oldest first. */
export function nextBatch(queue: ClientOutboxQueue): ClientBatch | null {
  const oldest = queue.entries[0];
  if (!oldest) return null;
  const table = oldest.table;
  const rows: ClientBatch["rows"] = [];
  const deletes: ClientBatch["deletes"] = [];
  const sent: ClientBatch["sent"] = [];
  for (const entry of queue.entries) {
    if (entry.table !== table) continue;
    if (entry.row) {
      if (rows.length >= MAX_BATCH) continue;
      rows.push(entry.row);
    } else {
      if (deletes.length >= MAX_BATCH) continue;
      deletes.push({ uid: entry.uid, doc_id: entry.docId, client_written_at: entry.at });
    }
    sent.push({ key: entry.key, at: entry.at });
    if (rows.length >= MAX_BATCH && deletes.length >= MAX_BATCH) break;
  }
  return { table, rows, deletes, sent };
}

export type SendOutcome = "ok" | "refused" | "retry";

/**
 * After a send: `ok` and `refused` remove the sent entries (unless a newer
 * save replaced one meanwhile); `retry` keeps them and counts the attempt.
 */
export function settle(queue: ClientOutboxQueue, batch: ClientBatch, outcome: SendOutcome): ClientOutboxQueue {
  const sentAt = new Map(batch.sent.map((s) => [s.key, s.at]));
  if (outcome === "retry") {
    return {
      ...queue,
      entries: queue.entries.map((e) => (sentAt.get(e.key) === e.at ? { ...e, attempts: e.attempts + 1 } : e)),
    };
  }
  return { ...queue, entries: queue.entries.filter((e) => sentAt.get(e.key) !== e.at) };
}

/**
 * Whether an `rm_client_apply` error means the input itself was rejected
 * (never retry it) rather than a transient failure. Postgres SQLSTATE
 * classes 22 (data exception), 23 (constraint) and 42 (privilege, syntax).
 */
export function isRefusal(error: { code?: unknown } | null | undefined): boolean {
  const code = typeof error?.code === "string" ? error.code : "";
  return /^(22|23|42)[0-9A-Z]{3}$/.test(code);
}

/** Retry delay after `attempts` failed sends: 2 s doubling, at most 5 min. */
export function backoffMs(attempts: number): number {
  return Math.min(5 * 60_000, 2000 * 2 ** Math.max(0, attempts - 1));
}

export function parseQueue(raw: unknown, uid: string): ClientOutboxQueue {
  if (!raw || typeof raw !== "object") return emptyQueue(uid);
  const q = raw as Partial<ClientOutboxQueue>;
  if (q.uid !== uid || !Array.isArray(q.entries)) return emptyQueue(uid);
  const entries = q.entries.filter(
    (e): e is ClientWriteEntry =>
      !!e && typeof e === "object" && typeof e.key === "string" && typeof e.table === "string"
      && e.uid === uid && typeof e.docId === "string" && typeof e.at === "string" && Number.isFinite(Date.parse(e.at))
  );
  return enqueue({ uid, entries: [], dropped: typeof q.dropped === "number" ? q.dropped : 0 }, entries.map((e) => ({ ...e, attempts: e.attempts ?? 0 })));
}

export function queueStats(queue: ClientOutboxQueue, now: number): { pending: number; oldestAgeMs: number | null; dropped: number } {
  const oldest = queue.entries[0];
  return { pending: queue.entries.length, oldestAgeMs: oldest ? Math.max(0, now - Date.parse(oldest.at)) : null, dropped: queue.dropped };
}
