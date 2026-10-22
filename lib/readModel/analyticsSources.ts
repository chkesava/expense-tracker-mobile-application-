import type { SupabaseClient } from "@supabase/supabase-js";

import type { ReadModelRow } from "@/shared/utils/readModel/mapping";
import { roundMoney } from "@/shared/utils/money";

import { fromReadModelDoc } from "./readModelDoc";

/**
 * SPENDLY-513 — the Phase 3 read-model queries (Supabase side) and the pure
 * rules the loopback shares with them.
 *
 * - Cash-flow history: `v_cash_flow_by_month` (SPENDLY-510, golden-tested
 *   against `calculateDashboardSummaries`). A month with a missing amount
 *   totals null in SQL; that is never shown as 0: the read throws and the
 *   screen falls back to Firestore.
 * - Audit history: `ledger_events`, keyset by `created_at desc, doc_id desc`,
 *   optionally for one transaction (`target_doc_id`).
 * - Rows by id: linked purchases for cashback history.
 */

export type CashFlowMonth = {
  period: string;
  totalExpenses: number;
  totalIncome: number;
  transactionCount: number;
};

export class ReadModelMissingAmount extends Error {
  constructor(period: string) {
    super(`read model: a ${period} amount is missing, so its total is unknown`);
    this.name = "ReadModelMissingAmount";
  }
}

type CashFlowViewRow = { month: string; total_expenses: number | string | null; total_income: number | string | null; transaction_count: number };

export function cashFlowFromView(rows: CashFlowViewRow[]): CashFlowMonth[] {
  return rows
    .map((r) => {
      if (r.total_expenses === null || r.total_income === null) throw new ReadModelMissingAmount(r.month);
      return {
        period: r.month,
        totalExpenses: roundMoney(Number(r.total_expenses)),
        totalIncome: roundMoney(Number(r.total_income)),
        transactionCount: r.transaction_count,
      };
    })
    .sort((a, b) => b.period.localeCompare(a.period));
}

export async function supabaseCashFlow(client: SupabaseClient, fromMonth: string, toMonth: string): Promise<CashFlowMonth[]> {
  const { data, error } = await client
    .from("v_cash_flow_by_month")
    .select("month, total_expenses, total_income, transaction_count")
    .gte("month", fromMonth)
    .lte("month", toMonth);
  if (error) throw new Error(`read model v_cash_flow_by_month: ${error.message}`);
  return cashFlowFromView((data ?? []) as CashFlowViewRow[]);
}

/** The view's rule over read-model rows (the loopback uses this; SQL is golden-tested to agree). */
export function cashFlowFromRows(expenses: ReadModelRow[], incomes: ReadModelRow[], fromMonth: string, toMonth: string): CashFlowMonth[] {
  const byMonth = new Map<string, { e: number | null; i: number | null; n: number }>();
  const add = (row: ReadModelRow, kind: "e" | "i") => {
    const month = typeof row.month === "string" ? row.month : null;
    if (!month || month < fromMonth || month > toMonth) return;
    const acc = byMonth.get(month) ?? { e: 0, i: 0, n: 0 };
    const amount = row.amount == null ? null : Number(row.amount);
    acc[kind] = acc[kind] === null || amount === null ? null : (acc[kind] as number) + amount;
    acc.n += 1;
    byMonth.set(month, acc);
  };
  expenses.forEach((r) => add(r, "e"));
  incomes.forEach((r) => add(r, "i"));
  return cashFlowFromView(
    [...byMonth.entries()].map(([month, v]) => ({ month, total_expenses: v.e, total_income: v.i, transaction_count: v.n }))
  );
}

/** Where the next audit page starts. `"undated"` = events with no `created_at`. */
export type AuditCursor = { createdAt: string; docId: string } | "undated" | null;
export type AuditPage<T> = { items: T[]; next: AuditCursor; exhausted: boolean };

/** PostgREST `or` filter for "strictly after this row" in created_at desc, doc_id desc order. */
export function auditKeysetAfter(cursor: { createdAt: string; docId: string }): string {
  const q = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return `created_at.lt.${q(cursor.createdAt)},and(created_at.eq.${q(cursor.createdAt)},doc_id.lt.${q(cursor.docId)})`;
}

export async function supabaseAuditPage<T>(
  client: SupabaseClient,
  cursor: AuditCursor,
  options: { targetDocId?: string; pageSize: number }
): Promise<AuditPage<T>> {
  let q = client.from("ledger_events").select("doc_id, created_at, doc").eq("source_deleted", false);
  if (options.targetDocId) q = q.eq("target_doc_id", options.targetDocId);
  if (cursor === "undated") {
    q = q.is("created_at", null);
  } else {
    q = q.not("created_at", "is", null);
    if (cursor) q = q.or(auditKeysetAfter(cursor));
  }
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .order("doc_id", { ascending: false })
    .limit(options.pageSize);
  if (error) throw new Error(`read model ledger_events: ${error.message}`);
  const rows = (data ?? []) as { doc_id: string; created_at: string | null; doc: Record<string, unknown> }[];
  return auditPageFrom(rows, cursor, options.pageSize);
}

export function auditPageFrom<T>(
  rows: { doc_id: string; created_at: string | null; doc: Record<string, unknown> }[],
  cursor: AuditCursor,
  pageSize: number
): AuditPage<T> {
  const items = rows.map((r) => fromReadModelDoc<T>(r.doc_id, r.doc));
  const last = rows[rows.length - 1];
  if (rows.length === pageSize) {
    return { items, next: cursor === "undated" ? "undated" : { createdAt: String(last.created_at), docId: last.doc_id }, exhausted: false };
  }
  if (cursor !== "undated") return { items, next: "undated", exhausted: false };
  return { items, next: null, exhausted: true };
}

const PAGE = 1000;

/** Active rows of one month key (the `month` column), paged. */
export async function supabaseByMonthKey<T>(client: SupabaseClient, table: "expenses" | "incomes", monthKey: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from(table)
      .select("doc_id, doc")
      .eq("source_deleted", false)
      .is("soft_deleted_at", null)
      .eq("month", monthKey)
      .order("doc_id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`read model ${table}: ${error.message}`);
    const rows = (data ?? []) as { doc_id: string; doc: Record<string, unknown> }[];
    out.push(...rows.map((r) => fromReadModelDoc<T>(r.doc_id, r.doc)));
    if (rows.length < PAGE) return out;
  }
}

const ID_CHUNK = 200;

/** Active expenses or incomes with these ids (soft-deleted rows excluded, as the provider does). */
export async function supabaseByIds<T>(client: SupabaseClient, table: "expenses" | "incomes", ids: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await client
      .from(table)
      .select("doc_id, doc")
      .eq("source_deleted", false)
      .is("soft_deleted_at", null)
      .in("doc_id", ids.slice(i, i + ID_CHUNK));
    if (error) throw new Error(`read model ${table}: ${error.message}`);
    out.push(...((data ?? []) as { doc_id: string; doc: Record<string, unknown> }[]).map((r) => fromReadModelDoc<T>(r.doc_id, r.doc)));
  }
  return out;
}
