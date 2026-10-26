import type { SupabaseClient } from "@supabase/supabase-js";
import { collection, getDocs, type Firestore } from "firebase/firestore";

import { mapDocument, SPEC_BY_COLLECTION, type ReadModelRow } from "@/shared/utils/readModel/mapping";
import { LEDGER_PAGE_SIZE } from "@/shared/utils/ledgerSnapshot";

import {
  auditPageFrom,
  cashFlowFromRows,
  supabaseAuditPage,
  supabaseByIds,
  supabaseByMonthKey,
  supabaseCashFlow,
  type AuditCursor,
  type AuditPage,
  type CashFlowMonth,
} from "./analyticsSources";
import { goalEventsPageFrom, supabaseGoalEventsPage, type GoalEventsPage, type GoalEventsQuery } from "./goalSources";
import { supabaseJournalPage, type SupabaseCursor, type SupabasePage } from "./journalHistorySource";
import { journalMonthRange, supabaseJournalMonth, type JournalCollection } from "./journalMonthSource";
import { fromReadModelDoc } from "./readModelDoc";

/**
 * SPENDLY-512 — what a read-model screen reads, behind one interface.
 *
 * - `supabaseBackend`: the real read model (RLS: the caller's own rows).
 * - `loopbackBackend`: **local test builds only** (Spendly Test on the
 *   Firebase emulator). Emulator tokens are unsigned, so the real read model
 *   can't trust them, and a test build must never see production data.
 *   Instead the loopback reads the emulator and puts every document through
 *   the same round trip as the real sync (`mapDocument` → JSON → `fromReadModelDoc`),
 *   then applies the same row rules as the SQL (live rows, date keyset order,
 *   filters). The switch, fallback, badges, paging, filtering and export can
 *   then all be tried on a phone. Postgres and RLS themselves are covered by
 *   the SQL tests.
 */

/** Necessary conditions of the Journal filter that SQL can apply (a superset of the screen's result). */
export type JournalMatch = {
  categories?: string[];
  accountIds?: string[];
  minAmount?: number;
  maxAmount?: number;
  fromDate?: string;
  toDate?: string;
};

export type ReadModelBackend = {
  kind: "supabase" | "loopback";
  month<T extends { id?: string }>(collectionName: JournalCollection, monthKey: string): Promise<T[]>;
  page<T extends { id?: string }>(collectionName: JournalCollection, cursor: SupabaseCursor, pageSize?: number): Promise<SupabasePage<T>>;
  matching<T extends { id?: string }>(collectionName: JournalCollection, match: JournalMatch): Promise<T[]>;
  /**
   * SPENDLY-513: active rows whose month key is `monthKey`: the `month`
   * column, which the sync fills by the app's rule (`monthKeyOf`: the row's
   * `month`, else its date). This is how Insights assigns rows to a month,
   * unlike `month()`, which is the Journal's date range.
   */
  byMonthKey<T extends { id?: string }>(collectionName: JournalCollection, monthKey: string): Promise<T[]>;
  /** SPENDLY-513: income/expense totals per month, `fromMonth`..`toMonth` inclusive (months with no rows absent). */
  cashFlow(fromMonth: string, toMonth: string): Promise<CashFlowMonth[]>;
  /** SPENDLY-513: ledger audit events, newest first; one transaction's when `targetDocId` is set. */
  auditPage<T>(cursor: AuditCursor, options: { targetDocId?: string; pageSize: number }): Promise<AuditPage<T>>;
  /** SPENDLY-513: active rows with these ids. */
  byIds<T extends { id?: string }>(collectionName: JournalCollection, ids: string[]): Promise<T[]>;
  /** SPENDLY-611: goal events in a created-at range (optionally one goal), newest first, keyset paged. */
  goalEventsPage(options: GoalEventsQuery): Promise<GoalEventsPage>;
  /** The stalest `last_synced_at` (ms) of these collections, or null if any was never synced. */
  lastSyncedAt(collections: string[]): Promise<number | null>;
};

/** Paisa rounding in numeric(18,2) must never drop a row the screen would keep. */
const AMOUNT_MARGIN = 0.01;
const MATCH_PAGE = 1000;

export function supabaseBackend(client: SupabaseClient): ReadModelBackend {
  return {
    kind: "supabase",
    month: (c, m) => supabaseJournalMonth(client, c, m),
    page: (c, cursor, size) => supabaseJournalPage(client, c, cursor, size),
    async matching<T extends { id?: string }>(collectionName: JournalCollection, match: JournalMatch) {
      const out: T[] = [];
      for (let from = 0; ; from += MATCH_PAGE) {
        let q = client.from(collectionName).select("doc_id, doc").eq("source_deleted", false).is("soft_deleted_at", null);
        if (match.categories?.length) q = q.in("category", match.categories);
        if (match.accountIds?.length) q = q.in("account_id", match.accountIds);
        if (match.minAmount !== undefined) q = q.gte("amount", match.minAmount - AMOUNT_MARGIN);
        if (match.maxAmount !== undefined) q = q.lte("amount", match.maxAmount + AMOUNT_MARGIN);
        if (match.fromDate) q = q.gte("date", match.fromDate);
        if (match.toDate) q = q.lte("date", match.toDate);
        const { data, error } = await q.order("doc_id").range(from, from + MATCH_PAGE - 1);
        if (error) throw new Error(`read model ${collectionName}: ${error.message}`);
        const rows = (data ?? []) as { doc_id: string; doc: Record<string, unknown> }[];
        out.push(...rows.map((r) => fromReadModelDoc<T>(r.doc_id, r.doc)));
        if (rows.length < MATCH_PAGE) return out;
      }
    },
    byMonthKey: (c, m) => supabaseByMonthKey(client, c, m),
    cashFlow: (from, to) => supabaseCashFlow(client, from, to),
    auditPage: (cursor, options) => supabaseAuditPage(client, cursor, options),
    byIds: (c, ids) => supabaseByIds(client, c, ids),
    goalEventsPage: (options) => supabaseGoalEventsPage(client, options),
    async lastSyncedAt(collections) {
      const { data, error } = await client.from("sync_status").select("collection, last_synced_at").in("collection", collections);
      if (error) throw new Error(error.message);
      const times = (data ?? []).map((r: { last_synced_at: string | null }) => (r.last_synced_at ? Date.parse(r.last_synced_at) : null));
      return times.length === 0 || times.some((t) => t === null) ? null : Math.min(...(times as number[]));
    },
  };
}

/** Test-only knobs, read from the emulator's `system_settings/global.readModel`. */
export type LoopbackKnobs = { fail?: boolean; lagMinutes?: number };

export function loopbackBackend(db: Firestore, uid: string, knobs: LoopbackKnobs = {}, now: () => number = Date.now): ReadModelBackend {
  /** The collection as the read model would hold it: live rows, mapped and round-tripped. */
  async function rows(collectionName: JournalCollection | "ledgerEvents" | "goalEvents"): Promise<ReadModelRow[]> {
    if (knobs.fail) throw new Error("loopback read model: simulated outage (readModel.loopbackFail)");
    const spec = SPEC_BY_COLLECTION.get(collectionName)!;
    const snap = await getDocs(collection(db, "users", uid, collectionName));
    const at = now();
    return snap.docs
      .map((d) => mapDocument(spec, uid, { id: d.id, data: d.data() as Record<string, unknown>, updateTime: at }))
      .filter((r) => r.soft_deleted_at == null);
  }
  const toApp = <T>(r: ReadModelRow) => fromReadModelDoc<T>(r.doc_id, r.doc as Record<string, unknown>);
  const byDateDesc = (a: ReadModelRow, b: ReadModelRow) =>
    String(b.date ?? "").localeCompare(String(a.date ?? "")) || b.doc_id.localeCompare(a.doc_id);

  return {
    kind: "loopback",
    async month(collectionName, monthKey) {
      const range = journalMonthRange(monthKey);
      if (!range) return [];
      return (await rows(collectionName))
        .filter((r) => typeof r.date === "string" && r.date >= range.fromDate && r.date <= range.toDate)
        .map((r) => toApp(r));
    },
    async page(collectionName, cursor, pageSize = LEDGER_PAGE_SIZE) {
      const all = await rows(collectionName);
      if (cursor === "undated") {
        return { items: all.filter((r) => r.date == null).map((r) => toApp(r)), next: null, exhausted: true };
      }
      const dated = all
        .filter((r) => r.date != null)
        .sort(byDateDesc)
        .filter((r) => !cursor || String(r.date) < cursor.date || (r.date === cursor.date && r.doc_id < cursor.docId));
      const page = dated.slice(0, pageSize);
      const last = page[page.length - 1];
      if (page.length === pageSize) return { items: page.map((r) => toApp(r)), next: { date: String(last.date), docId: last.doc_id }, exhausted: false };
      return { items: page.map((r) => toApp(r)), next: "undated", exhausted: false };
    },
    async matching(collectionName, match) {
      return (await rows(collectionName))
        .filter((r) => !match.categories?.length || match.categories.includes(String(r.category)))
        .filter((r) => !match.accountIds?.length || match.accountIds.includes(String(r.account_id)))
        .filter((r) => match.minAmount === undefined || (r.amount != null && Number(r.amount) >= match.minAmount - AMOUNT_MARGIN))
        .filter((r) => match.maxAmount === undefined || (r.amount != null && Number(r.amount) <= match.maxAmount + AMOUNT_MARGIN))
        .filter((r) => !match.fromDate || (r.date != null && String(r.date) >= match.fromDate))
        .filter((r) => !match.toDate || (r.date != null && String(r.date) <= match.toDate))
        .map((r) => toApp(r));
    },
    async byMonthKey(collectionName, monthKey) {
      return (await rows(collectionName)).filter((r) => r.month === monthKey).map((r) => toApp(r));
    },
    async cashFlow(fromMonth, toMonth) {
      return cashFlowFromRows(await rows("expenses"), await rows("incomes"), fromMonth, toMonth);
    },
    async auditPage<T>(cursor: AuditCursor, options: { targetDocId?: string; pageSize: number }) {
      const all = (await rows("ledgerEvents")).filter((r) => !options.targetDocId || r.target_doc_id === options.targetDocId);
      const asPage = (list: ReadModelRow[]) =>
        list.map((r) => ({ doc_id: r.doc_id, created_at: (r.created_at as string | null) ?? null, doc: r.doc as Record<string, unknown> }));
      if (cursor === "undated") return auditPageFrom<T>(asPage(all.filter((r) => r.created_at == null)), cursor, Number.MAX_SAFE_INTEGER);
      const dated = all
        .filter((r) => r.created_at != null)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || b.doc_id.localeCompare(a.doc_id))
        .filter((r) => !cursor || String(r.created_at) < cursor.createdAt || (r.created_at === cursor.createdAt && r.doc_id < cursor.docId));
      return auditPageFrom<T>(asPage(dated.slice(0, options.pageSize)), cursor, options.pageSize);
    },
    async byIds(collectionName, ids) {
      const wanted = new Set(ids);
      return (await rows(collectionName)).filter((r) => wanted.has(r.doc_id)).map((r) => toApp(r));
    },
    async goalEventsPage(options) {
      // The SQL's rules over the mapped rows: live, dated, in range, keyset desc.
      const from = new Date(options.fromMs).toISOString();
      const to = new Date(options.toMs).toISOString();
      const c = options.cursor;
      const page = (await rows("goalEvents"))
        .filter((r) => typeof r.created_at === "string" && r.created_at >= from && r.created_at < to)
        .filter((r) => !options.goalId || r.goal_id === options.goalId)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || b.doc_id.localeCompare(a.doc_id))
        .filter((r) => !c || String(r.created_at) < c.createdAt || (r.created_at === c.createdAt && r.doc_id < c.docId))
        .slice(0, options.pageSize);
      return goalEventsPageFrom(
        page.map((r) => ({ doc_id: r.doc_id, created_at: r.created_at as string, doc: r.doc as Record<string, unknown> })),
        options.pageSize
      );
    },
    async lastSyncedAt() {
      if (knobs.fail) throw new Error("loopback read model: simulated outage (readModel.loopbackFail)");
      return now() - (knobs.lagMinutes ?? 0) * 60 * 1000;
    },
  };
}
