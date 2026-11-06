import type { SupabaseClient } from "@supabase/supabase-js";

import type { GroupFundEvent } from "@/shared/types/groupFund";

import { auditKeysetAfter } from "./analyticsSources";
import { fromReadModelDoc } from "./readModelDoc";

/**
 * SPENDLY-685 — where older Group Funds history pages come from.
 *
 * Read model (Supabase, migration 20261106000000): `group_fund_events` for one
 * fund, keyset by `created_at desc, doc_id desc` (index `(uid, fund_id,
 * created_at desc, doc_id desc)`). Firestore stays the default and the
 * fallback (useGroupFundHistory's cursor pages). Rows only — no total is ever
 * computed from them (READ_MODEL_RULES R4).
 */

export type GroupFundEventsCursor = { createdAt: string; docId: string } | null;
export type GroupFundEventsPage = { items: GroupFundEvent[]; next: GroupFundEventsCursor; exhausted: boolean };
export type GroupFundEventsQuery = { fundId: string; cursor: GroupFundEventsCursor; pageSize: number };

export function groupFundEventsPageFrom(
  rows: { doc_id: string; created_at: string | null; doc: Record<string, unknown> }[],
  pageSize: number
): GroupFundEventsPage {
  const items = rows.map((r) => fromReadModelDoc<GroupFundEvent>(r.doc_id, r.doc));
  const last = rows[rows.length - 1];
  if (rows.length >= pageSize && last) {
    return { items, next: { createdAt: String(last.created_at), docId: last.doc_id }, exhausted: false };
  }
  return { items, next: null, exhausted: true };
}

export async function supabaseGroupFundEventsPage(
  client: SupabaseClient,
  options: GroupFundEventsQuery
): Promise<GroupFundEventsPage> {
  let q = client
    .from("group_fund_events")
    .select("doc_id, created_at, doc")
    .eq("source_deleted", false)
    .eq("fund_id", options.fundId)
    .not("created_at", "is", null);
  if (options.cursor) q = q.or(auditKeysetAfter(options.cursor));
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .order("doc_id", { ascending: false })
    .limit(options.pageSize);
  if (error) throw new Error(`read model group_fund_events: ${error.message}`);
  return groupFundEventsPageFrom(
    (data ?? []) as { doc_id: string; created_at: string | null; doc: Record<string, unknown> }[],
    options.pageSize
  );
}

/** The cursor that starts just below an event already shown (overlap is de-duplicated by id). */
export function groupFundCursorBelow(createdAtMs: number): GroupFundEventsCursor {
  return { createdAt: new Date(createdAtMs + 1).toISOString(), docId: "" };
}

/** SPENDLY-688: the most events one fund can have in one month that a month view reads. */
export const GROUP_FUND_MONTH_LIMIT = 500;

/** SPENDLY-688: one fund's events for one month (`period`), from the read model. Rows only. */
export async function supabaseGroupFundMonthEvents(
  client: SupabaseClient,
  fundId: string,
  period: string
): Promise<GroupFundEvent[]> {
  const { data, error } = await client
    .from("group_fund_events")
    .select("doc_id, doc")
    .eq("source_deleted", false)
    .eq("fund_id", fundId)
    .eq("period", period)
    .order("doc_id")
    .limit(GROUP_FUND_MONTH_LIMIT);
  if (error) throw new Error(`read model group_fund_events: ${error.message}`);
  return ((data ?? []) as { doc_id: string; doc: Record<string, unknown> }[]).map((r) =>
    fromReadModelDoc<GroupFundEvent>(r.doc_id, r.doc)
  );
}
