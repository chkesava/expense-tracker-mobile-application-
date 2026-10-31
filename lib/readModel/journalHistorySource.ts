import type { SupabaseClient } from "@supabase/supabase-js";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type Firestore,
  type QueryDocumentSnapshot,
} from "@/lib/firestore";

import { logDirectRead } from "@/lib/firestoreReadDebug";
import { foldLedgerSnapshot, LEDGER_PAGE_SIZE } from "@/shared/utils/ledgerSnapshot";

import type { JournalCollection } from "./journalMonthSource";
import { fromReadModelDoc } from "./readModelDoc";

/**
 * SPENDLY-512 — Journal history older than the live (staged) window, one page
 * at a time.
 *
 * - firestore: the provider's previous cursor query, moved unchanged:
 *   `createdAt desc`, `startAfter(cursor)`, `limit(50)`, logged.
 * - supabase: keyset pages by `date desc, doc_id desc` (the order the Journal
 *   shows), active rows only (RLS: own rows), then any rows with no date.
 *   Both orders reach the same full set; the Journal sorts by date for
 *   display, so what the user sees is the same once a period is loaded.
 */
export type FirestorePage<T> = { items: T[]; lastDoc: QueryDocumentSnapshot | null; exhausted: boolean };

export async function firestoreJournalPage<T extends { id?: string }>(
  db: Firestore,
  uid: string,
  collectionName: JournalCollection,
  cursor: QueryDocumentSnapshot
): Promise<FirestorePage<T>> {
  const q = query(
    collection(db, "users", uid, collectionName),
    orderBy("createdAt", "desc"),
    startAfter(cursor),
    limit(LEDGER_PAGE_SIZE)
  );
  const snap = await getDocs(q);
  logDirectRead(
    `users/${uid}/${collectionName}`,
    snap.docs.length,
    snap.metadata.fromCache ? "cache" : "server",
    {
      feature: "ledger_pagination",
      queryShape: `startAfter limit=${LEDGER_PAGE_SIZE}`,
    }
  );
  return {
    items: foldLedgerSnapshot<T>(snap.docs, { activeOnly: true }).items,
    lastDoc: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null,
    exhausted: snap.docs.length < LEDGER_PAGE_SIZE,
  };
}

/** Where the next read-model page starts. `"undated"` = the rows with no date. */
export type SupabaseCursor = { date: string; docId: string } | "undated" | null;
export type SupabasePage<T> = { items: T[]; next: SupabaseCursor; exhausted: boolean };

/** PostgREST `or` filter for "strictly after this row" in date desc, doc_id desc order. */
export function keysetAfter(cursor: { date: string; docId: string }): string {
  const q = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return `date.lt.${q(cursor.date)},and(date.eq.${q(cursor.date)},doc_id.lt.${q(cursor.docId)})`;
}

export async function supabaseJournalPage<T extends { id?: string }>(
  client: SupabaseClient,
  collectionName: JournalCollection,
  cursor: SupabaseCursor,
  pageSize = LEDGER_PAGE_SIZE
): Promise<SupabasePage<T>> {
  let q = client
    .from(collectionName)
    .select("doc_id, date, doc")
    .eq("source_deleted", false)
    .is("soft_deleted_at", null);
  if (cursor === "undated") {
    q = q.is("date", null);
  } else {
    q = q.not("date", "is", null);
    if (cursor) q = q.or(keysetAfter(cursor));
  }
  const { data, error } = await q
    .order("date", { ascending: false })
    .order("doc_id", { ascending: false })
    .limit(pageSize);
  if (error) throw new Error(`read model ${collectionName}: ${error.message}`);
  const rows = (data ?? []) as { doc_id: string; date: string | null; doc: Record<string, unknown> }[];
  const items = rows.map((r) => fromReadModelDoc<T>(r.doc_id, r.doc));
  const last = rows[rows.length - 1];

  if (rows.length === pageSize) {
    return { items, next: cursor === "undated" ? "undated" : { date: String(last.date), docId: last.doc_id }, exhausted: false };
  }
  // Dated rows done: undated rows (if any) come last; then the history is complete.
  if (cursor !== "undated") return { items, next: "undated", exhausted: false };
  return { items, next: null, exhausted: true };
}
