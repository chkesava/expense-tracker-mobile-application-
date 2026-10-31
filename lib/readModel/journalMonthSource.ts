import type { SupabaseClient } from "@supabase/supabase-js";
import { collection, getDocs, query, where, type Firestore } from "@/lib/firestore";

import { logDirectRead } from "@/lib/firestoreReadDebug";
import { resolveJournalDateScope } from "@/shared/utils/journalDateScope";
import { foldLedgerSnapshot } from "@/shared/utils/ledgerSnapshot";

import { fromReadModelDoc } from "./readModelDoc";

/**
 * SPENDLY-511 — the template read-model data need: one month of Journal
 * history (expenses or incomes), as `FinanceDataProvider.loadExpensesForMonth`
 * / `loadIncomesForMonth` load it.
 *
 * Two sources with the same contract: active rows (soft-deleted excluded) of
 * one month, as app objects with `id`.
 * - firestore: the provider's existing query, moved here unchanged: one
 *   bounded `date` range read, logged by `logDirectRead`.
 * - supabase: the same month from the read model (RLS: own rows only). Each
 *   row's `doc` is the source document, so the objects match; timestamps
 *   arrive as ISO strings.
 */
export type JournalCollection = "expenses" | "incomes";

export function journalMonthRange(monthKey: string): { fromDate: string; toDate: string } | null {
  const scope = resolveJournalDateScope(monthKey, { fromDate: "", toDate: "" });
  return scope.fromDate && scope.toDate ? { fromDate: scope.fromDate, toDate: scope.toDate } : null;
}

export async function firestoreJournalMonth<T extends { id?: string }>(
  db: Firestore,
  uid: string,
  collectionName: JournalCollection,
  monthKey: string
): Promise<T[]> {
  const range = journalMonthRange(monthKey);
  if (!range) return [];
  const q = query(
    collection(db, "users", uid, collectionName),
    where("date", ">=", range.fromDate),
    where("date", "<=", range.toDate)
  );
  const snap = await getDocs(q);
  logDirectRead(
    `users/${uid}/${collectionName}`,
    snap.docs.length,
    snap.metadata.fromCache ? "cache" : "server",
    { feature: "ledger_month_query", queryShape: `date range ${monthKey}` }
  );
  return foldLedgerSnapshot<T>(snap.docs, { activeOnly: true }).items;
}

const PAGE = 1000;

export async function supabaseJournalMonth<T extends { id?: string }>(
  client: SupabaseClient,
  collectionName: JournalCollection,
  monthKey: string
): Promise<T[]> {
  const range = journalMonthRange(monthKey);
  if (!range) return [];
  const out: T[] = [];
  // RLS returns only the caller's rows; `uid` needs no filter here.
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from(collectionName)
      .select("doc_id, doc")
      .gte("date", range.fromDate)
      .lte("date", range.toDate)
      .eq("source_deleted", false)
      .is("soft_deleted_at", null)
      .order("doc_id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`read model ${collectionName}: ${error.message}`);
    const rows = (data ?? []) as { doc_id: string; doc: Record<string, unknown> }[];
    for (const row of rows) out.push(fromReadModelDoc<T>(row.doc_id, row.doc));
    if (rows.length < PAGE) return out;
  }
}
