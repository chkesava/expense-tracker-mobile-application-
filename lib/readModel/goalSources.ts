import type { SupabaseClient } from "@supabase/supabase-js";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type Firestore,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
} from "firebase/firestore";

import { logDirectRead } from "@/lib/firestoreReadDebug";
import type { GoalEvent } from "@/shared/types/goal";

import { auditKeysetAfter } from "./analyticsSources";
import { fromReadModelDoc } from "./readModelDoc";

/**
 * SPENDLY-611 — where Save Goals history and analytics rows come from.
 *
 * - Read model (Supabase, migration 20261029000000): `goal_events`, keyset by
 *   `created_at desc, doc_id desc` (the indexes `(uid, created_at desc,
 *   doc_id desc)` and `(uid, goal_id, created_at desc, doc_id desc)`),
 *   bounded by a created-at range and optionally one goal.
 * - Firestore (the default and the fallback, READ_MODEL_RULES R3.3): the
 *   same range by `createdAtMs`, in pages of 500, never past a cap, so an
 *   outage can't turn into an unbounded read.
 */

export const GOAL_EVENTS_PAGE = 500;
/** Safety cap for one analytics/export read; the screen says when it was hit. */
export const GOAL_EVENTS_CAP = 5000;

export type GoalEventsCursor = { createdAt: string; docId: string } | null;
export type GoalEventsPage = { items: GoalEvent[]; next: GoalEventsCursor; exhausted: boolean };
export type GoalEventsQuery = { fromMs: number; toMs: number; goalId?: string; cursor: GoalEventsCursor; pageSize: number };

const iso = (ms: number) => new Date(ms).toISOString();

export function goalEventsPageFrom(
  rows: { doc_id: string; created_at: string | null; doc: Record<string, unknown> }[],
  pageSize: number
): GoalEventsPage {
  const items = rows.map((r) => fromReadModelDoc<GoalEvent>(r.doc_id, r.doc));
  const last = rows[rows.length - 1];
  if (rows.length >= pageSize && last) return { items, next: { createdAt: String(last.created_at), docId: last.doc_id }, exhausted: false };
  return { items, next: null, exhausted: true };
}

export async function supabaseGoalEventsPage(client: SupabaseClient, options: GoalEventsQuery): Promise<GoalEventsPage> {
  let q = client
    .from("goal_events")
    .select("doc_id, created_at, doc")
    .eq("source_deleted", false)
    .not("created_at", "is", null)
    .gte("created_at", iso(options.fromMs))
    .lt("created_at", iso(options.toMs));
  if (options.goalId) q = q.eq("goal_id", options.goalId);
  if (options.cursor) q = q.or(auditKeysetAfter(options.cursor));
  const { data, error } = await q.order("created_at", { ascending: false }).order("doc_id", { ascending: false }).limit(options.pageSize);
  if (error) throw new Error(`read model goal_events: ${error.message}`);
  return goalEventsPageFrom((data ?? []) as { doc_id: string; created_at: string | null; doc: Record<string, unknown> }[], options.pageSize);
}

/** The cursor that starts just below an event already shown (overlap is de-duplicated by id). */
export function goalCursorBelow(createdAtMs: number): GoalEventsCursor {
  return { createdAt: iso(createdAtMs + 1), docId: "" };
}

const toEvent = (d: QueryDocumentSnapshot): GoalEvent => ({ ...(d.data() as Omit<GoalEvent, "id">), id: d.id });

/**
 * Firestore: every goal event with `fromMs <= createdAtMs < toMs`, newest
 * first, in pages of 500, stopping at `cap` (then `truncated`). Uses the
 * automatic single-field index on `createdAtMs`.
 */
export async function firestoreGoalEventsInRange(
  db: Firestore,
  uid: string,
  fromMs: number,
  toMs: number,
  cap = GOAL_EVENTS_CAP
): Promise<{ events: GoalEvent[]; truncated: boolean }> {
  const out: GoalEvent[] = [];
  let cursor: QueryDocumentSnapshot | null = null;
  for (;;) {
    const constraints: QueryConstraint[] = [
      where("createdAtMs", ">=", fromMs),
      where("createdAtMs", "<", toMs),
      orderBy("createdAtMs", "desc"),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(GOAL_EVENTS_PAGE),
    ];
    const snap: QuerySnapshot = await getDocs(query(collection(db, "users", uid, "goalEvents"), ...constraints));
    logDirectRead(`users/${uid}/goalEvents`, snap.docs.length, snap.metadata.fromCache ? "cache" : "server", {
      feature: "goals",
      queryShape: "analytics range page",
    });
    out.push(...snap.docs.map(toEvent));
    if (snap.docs.length < GOAL_EVENTS_PAGE) return { events: out, truncated: false };
    if (out.length >= cap) return { events: out.slice(0, cap), truncated: true };
    cursor = snap.docs[snap.docs.length - 1];
  }
}
