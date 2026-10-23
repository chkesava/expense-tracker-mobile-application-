import { isDuressUid } from "../../shared/utils/duress";
import { bearerToken } from "../../shared/utils/readModelIdentity";
import { mapDocumentWithReason, SPEC_BY_COLLECTION, type ReadModelRow, type SourceDoc } from "../../shared/utils/readModel/mapping";
import { parsePushRequest, type PushRef } from "../../shared/utils/readModel/pushRefs";

/**
 * SPENDLY-583 — push the documents a user just saved to the read model within
 * seconds, so other devices see them before the nightly sync.
 *
 * Firestore stays the only source and the server the only Supabase writer:
 * - the uid comes only from the verified token (revocation checked);
 * - the client sends document refs, never data; each document is read from
 *   Firestore here (1 read each) and mapped exactly as the sync maps it;
 * - the upsert is version-guarded by Firestore's `updateTime`, so a late or
 *   repeated push can never overwrite a newer row; a missing document is
 *   tombstoned;
 * - `{ mode: "user" }` runs a changed-only sync of the caller's own data (for
 *   writers that can't name their documents), within the sync's read budget;
 * - duress, erased accounts and non-synced collections are refused, and every
 *   caller is rate limited (SQL, per uid).
 *
 * Failing a push never affects the save: the app fires it after the commit
 * and ignores the result, and the nightly sync repairs anything missed.
 */
export type PushEvent = { httpMethod?: string; headers?: Record<string, string | undefined>; body?: string | null };
export type PushResult = { statusCode: number; headers: Record<string, string>; body: string };

export type PushStats = { requests: number; docs: number; userSyncs: number; rejected: number; failed: number; reads: number };

export type PushPorts = {
  /** False when READMODEL_PUSH_ENABLED is "false" (rollback) or the site lacks the read-model settings. */
  enabled(): boolean;
  verifyIdToken(token: string): Promise<{ uid: string }>;
  isPurged(uid: string): Promise<boolean>;
  /** Atomically spends `cost` from the uid's allowance; false when over the limit. */
  allow(uid: string, cost: number): Promise<boolean>;
  /** Reads these documents of the uid from Firestore: null for one that doesn't exist. */
  readDocs(uid: string, refs: PushRef[]): Promise<(SourceDoc | null)[]>;
  upsert(table: string, rows: ReadModelRow[]): Promise<number>;
  tombstone(table: string, uid: string, docIds: string[]): Promise<number>;
  /** Changed-only sync of one user; returns the Firestore reads it used and whether it failed. */
  syncUser(uid: string): Promise<{ readsUsed: number; ok: boolean }>;
  /** Best-effort daily counters. */
  record(stats: PushStats): Promise<void>;
  log?(line: string): void;
};

/** What a per-user sync costs against the rate limit (it reads ~30 documents). */
export const USER_SYNC_COST = 30;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(statusCode: number, payload: Record<string, unknown>): PushResult {
  return { statusCode, headers: { ...CORS, "Content-Type": "application/json" }, body: JSON.stringify(payload) };
}

function header(event: PushEvent, name: string): string {
  const headers = event.headers ?? {};
  const match = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
  return match ? String(headers[match] ?? "") : "";
}

const empty = (): PushStats => ({ requests: 1, docs: 0, userSyncs: 0, rejected: 0, failed: 0, reads: 0 });

export async function handleReadModelPush(event: PushEvent, ports: PushPorts): Promise<PushResult> {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  if (!ports.enabled()) return json(202, { skipped: "disabled" });

  const token = bearerToken(header(event, "authorization"));
  if (!token) return json(401, { error: "Sign in first." });
  let uid: string;
  try {
    ({ uid } = await ports.verifyIdToken(token));
  } catch {
    return json(401, { error: "Your session has expired. Sign in again." });
  }
  if (!uid || isDuressUid(uid)) return json(403, { error: "Not allowed." });

  let body: unknown;
  try {
    body = JSON.parse(event.body ?? "");
  } catch {
    body = null;
  }
  const request = parsePushRequest(body);
  const stats = empty();
  const finish = async (result: PushResult) => {
    await ports.record(stats).catch(() => undefined);
    return result;
  };
  if (!request.ok) {
    stats.rejected += 1;
    return finish(json(400, { error: request.error }));
  }
  if (await ports.isPurged(uid)) {
    stats.rejected += 1;
    return finish(json(403, { error: "Not allowed." }));
  }
  const cost = request.mode === "user" ? USER_SYNC_COST : request.refs.length;
  if (!(await ports.allow(uid, cost))) {
    stats.rejected += 1;
    return finish(json(429, { error: "Too many updates. They'll be copied tonight." }));
  }

  if (request.mode === "user") {
    const run = await ports.syncUser(uid);
    stats.userSyncs += 1;
    stats.reads += run.readsUsed;
    if (!run.ok) stats.failed += 1;
    return finish(json(run.ok ? 200 : 502, { mode: "user", reads: run.readsUsed }));
  }

  try {
    const docs = await ports.readDocs(uid, request.refs);
    stats.reads += request.refs.length;
    const upserts = new Map<string, ReadModelRow[]>();
    const tombstones = new Map<string, string[]>();
    request.refs.forEach((ref, i) => {
      const spec = SPEC_BY_COLLECTION.get(ref.collection)!;
      const doc = docs[i];
      if (doc) {
        const list = upserts.get(spec.table) ?? [];
        list.push(mapDocumentWithReason(spec, uid, doc).row);
        upserts.set(spec.table, list);
      } else {
        const list = tombstones.get(spec.table) ?? [];
        list.push(ref.docId);
        tombstones.set(spec.table, list);
      }
    });
    let pushed = 0;
    let tombstoned = 0;
    for (const [table, rows] of upserts) pushed += await ports.upsert(table, rows);
    for (const [table, ids] of tombstones) tombstoned += await ports.tombstone(table, uid, ids);
    stats.docs += request.refs.length;
    return finish(json(200, { mode: "refs", pushed, tombstoned }));
  } catch (error) {
    stats.failed += 1;
    ports.log?.(`[PUSH] failed: ${error instanceof Error ? error.message : String(error)}`);
    // No provider detail to the client; the nightly sync repairs it.
    return finish(json(502, { error: "Couldn't update the reporting copy now. It will catch up tonight." }));
  }
}
