import type { Firestore } from "firebase/firestore";

import type { connectReadModel } from "@/lib/readModelClient";
import { timestampMillis } from "@/shared/utils/readModel/mapping";
import { READ_MODEL_SLO_MS } from "@/shared/utils/readModelFreshness";
import type { ReadModelMode, ReadModelScreen } from "@/shared/utils/readModelMode";

import type { AuditCursor, AuditPage, CashFlowMonth } from "./analyticsSources";
import { firestoreJournalMonth } from "./journalMonthSource";
import { compareLedgerRows } from "./readPath";
import {
  readModelPath,
  resolveReadModelBackend,
  type ReadModelReadConditions,
  type ReadModelReadUser,
} from "./screenReadPath";

/**
 * SPENDLY-513 — the Phase 3 history reads through the read path, each under
 * its own switch (`system_settings/global.readModel.<screen>`):
 *
 * | screen     | what moves                                   | Firestore source (default and fallback)           |
 * |------------|----------------------------------------------|---------------------------------------------------|
 * | `insights` | the Insights month (expenses + incomes)      | none: the screen uses the rows it holds, as today |
 * | `cashFlow` | the dashboard chart's months before the last two | the same `dashboard_*` summary docs, bounded  |
 * | `audit`    | ledger audit history (all, or one transaction) | the existing bounded listener / cursor pages    |
 * | `cashback` | the purchases cashback rows link to          | none: the rows the screen holds, as today         |
 *
 * Every function returns null when the screen should do exactly what it does
 * today: `firestore` mode (no connection attempted), duress, offline, no read
 * model, or a failure (logged once; the screen stays on Firestore for the
 * session). Totals are always computed by the existing TypeScript helpers
 * over the rows returned, so no number gets a second owner.
 */
type Base = {
  db: Firestore;
  user: ReadModelReadUser;
  conditions: ReadModelReadConditions;
  connect?: typeof connectReadModel;
};

const withoutRemoved = <T extends { id?: string }>(rows: T[], removed: Set<string>) =>
  rows.filter((row) => !row.id || !removed.has(row.id));

/* ------------------------------------------------------------------ insights */

export type InsightsMonth<E, I> = { expenses: E[]; incomes: I[] };

/**
 * `supabase`: the month's complete expenses and incomes from the read model,
 * by month key (`month`, else the date: the rule Insights uses).
 * `shadow`: the same, compared in the background against the bounded
 * Firestore month query, returns null. Shadow only, and it costs that month's
 * reads. The date-range query can't see a row whose `month` differs from its
 * date, so the comparison only covers rows dated inside the month.
 */
export async function readInsightsMonth<E extends { id?: string }, I extends { id?: string }>(
  input: Base & { monthKey: string; locallyRemovedIds: Set<string> }
): Promise<InsightsMonth<E, I> | null> {
  const { mode, backend } = await resolveReadModelBackend("insights", input);
  if (mode === "firestore" || !backend) return null;
  const uid = input.user?.uid ?? "";
  const { value, servedBy } = await readModelPath().read<InsightsMonth<E, I> | null>("insights", mode, {
    firestore: async () =>
      mode === "shadow"
        ? {
            expenses: await firestoreJournalMonth<E>(input.db, uid, "expenses", input.monthKey),
            incomes: await firestoreJournalMonth<I>(input.db, uid, "incomes", input.monthKey),
          }
        : null,
    supabase: async () => ({
      expenses: await backend.byMonthKey<E>("expenses", input.monthKey),
      incomes: await backend.byMonthKey<I>("incomes", input.monthKey),
    }),
    compare: (fs, sb) => {
      if (!fs || !sb) return [];
      const datedIn = <T extends { date?: unknown }>(rows: T[]) => rows.filter((r) => typeof r.date === "string" && r.date.startsWith(input.monthKey));
      return [
        ...compareLedgerRows(datedIn(fs.expenses as never[]) as never, datedIn(sb.expenses as never[]) as never),
        ...compareLedgerRows(datedIn(fs.incomes as never[]) as never, datedIn(sb.incomes as never[]) as never),
      ];
    },
  });
  if (servedBy !== "supabase" || !value) return null;
  return { expenses: withoutRemoved(value.expenses, input.locallyRemovedIds), incomes: withoutRemoved(value.incomes, input.locallyRemovedIds) };
}

/* ------------------------------------------------------------------ cash flow */

/** The months the chart shows, newest first: `activeMonth` and the `count - 1` before it. */
export function cashFlowMonths(activeMonth: string, count: number, shift: (m: string, by: number) => string): string[] {
  return Array.from({ length: count }, (_, i) => shift(activeMonth, -i));
}

/** Shadow comparison: per month, the summary docs vs the read model, to the paisa. */
export function compareCashFlow(firestore: CashFlowMonth[], readModel: CashFlowMonth[], months: string[]): string[] {
  const a = new Map(firestore.map((m) => [m.period, m]));
  const b = new Map(readModel.map((m) => [m.period, m]));
  const diffs: string[] = [];
  for (const month of months) {
    const x = a.get(month);
    const y = b.get(month);
    const fx = (v: number | undefined) => (v ?? 0).toFixed(2);
    if (fx(x?.totalExpenses) !== fx(y?.totalExpenses)) diffs.push(`${month} expenses ${fx(x?.totalExpenses)} vs ${fx(y?.totalExpenses)}`);
    if (fx(x?.totalIncome) !== fx(y?.totalIncome)) diffs.push(`${month} income ${fx(x?.totalIncome)} vs ${fx(y?.totalIncome)}`);
  }
  return diffs;
}

/**
 * `supabase`: the older months (`fromMonth`..`toMonth`) from
 * `v_cash_flow_by_month`; on failure, `firestore()` (the same summary docs,
 * bounded). Other modes: null, and the hook keeps its listener as today.
 */
export async function readCashFlowHistory(
  input: Base & { fromMonth: string; toMonth: string; firestore: () => Promise<CashFlowMonth[]> }
): Promise<{ months: CashFlowMonth[]; servedBy: "firestore" | "supabase" } | null> {
  const { mode, backend } = await resolveReadModelBackend("cashFlow", input);
  if (mode !== "supabase" || !backend) return null;
  const { value, servedBy } = await readModelPath().read<CashFlowMonth[]>("cashFlow", "supabase", {
    firestore: input.firestore,
    supabase: () => backend.cashFlow(input.fromMonth, input.toMonth),
  });
  return { months: value, servedBy };
}

/**
 * `shadow` only: compares what the chart shows with the read model in the
 * background; differences are logged by the read path. Returns whether a
 * comparison was started.
 */
export async function shadowCompareCashFlow(input: Base & { shown: CashFlowMonth[]; months: string[] }): Promise<boolean> {
  const { mode, backend } = await resolveReadModelBackend("cashFlow", input);
  if (mode !== "shadow" || !backend || input.months.length === 0) return false;
  const sorted = [...input.months].sort();
  await readModelPath().read<string[]>("cashFlow", "shadow", {
    firestore: async () => [],
    supabase: async () => compareCashFlow(input.shown, await backend.cashFlow(sorted[0], sorted[sorted.length - 1]), input.months),
    compare: (_none, diffs) => diffs,
  });
  return true;
}

/* ------------------------------------------------------------------ audit */

/** The resolved mode for a screen, for hooks that switch strategy (listener vs pages). */
export async function readModelModeFor(screen: ReadModelScreen, input: Base): Promise<ReadModelMode> {
  return (await resolveReadModelBackend(screen, input)).mode;
}

/**
 * `supabase` only: one page of audit events from the read model (newest
 * first; one transaction's when `targetDocId` is set). Null when the screen
 * should use its Firestore path (any other mode, or a failure; after a
 * failure `readModelModeFor("audit")` answers `firestore` for the session).
 */
export async function readAuditPage<T>(
  input: Base & { cursor: AuditCursor; targetDocId?: string; pageSize: number }
): Promise<AuditPage<T> | null> {
  const { mode, backend } = await resolveReadModelBackend("audit", input);
  if (mode !== "supabase" || !backend) return null;
  const { value } = await readModelPath().read<AuditPage<T> | null>("audit", "supabase", {
    firestore: async () => null,
    supabase: () => backend.auditPage<T>(input.cursor, { targetDocId: input.targetDocId, pageSize: input.pageSize }),
  });
  return value;
}

/**
 * Shadow comparison for one row's events: ids on one side only. Events newer
 * than the sync SLO are left out (the read model may not have them yet, which
 * is expected, not a difference).
 */
export function compareAuditIds(
  firestore: { id: string; createdAt?: unknown }[],
  readModel: { id?: string }[],
  nowMs: number,
  sloMs = READ_MODEL_SLO_MS
): string[] {
  const settled = firestore.filter((e) => {
    const ms = timestampMillis(e.createdAt);
    return ms !== null && nowMs - ms > sloMs;
  });
  const theirs = new Set(readModel.map((e) => e.id));
  const mine = new Set(firestore.map((e) => e.id));
  const diffs: string[] = [];
  for (const e of settled) if (!theirs.has(e.id)) diffs.push(`missing in read model: ${e.id}`);
  for (const id of theirs) if (id && !mine.has(id)) diffs.push(`only in read model: ${id}`);
  return diffs;
}

/** `shadow` only: compares one row's Firestore events with the read model in the background. */
export async function shadowCompareAudit(
  input: Base & { docId: string; firestoreEvents: { id: string; createdAt?: unknown }[]; now?: () => number }
): Promise<boolean> {
  const { mode, backend } = await resolveReadModelBackend("audit", input);
  if (mode !== "shadow" || !backend) return false;
  const now = input.now ?? Date.now;
  await readModelPath().read<string[]>("audit", "shadow", {
    firestore: async () => [],
    supabase: async () => {
      const page = await backend.auditPage<{ id?: string }>(null, { targetDocId: input.docId, pageSize: 1000 });
      return compareAuditIds(input.firestoreEvents, page.items, now());
    },
    compare: (_none, diffs) => diffs,
  });
  return true;
}

/** The first read-model cursor below a Firestore window ending at `oldestMs`: every row at or before that ms (overlap is de-duplicated by id). */
export function auditCursorBelow(oldestMs: number): AuditCursor {
  return { createdAt: new Date(oldestMs + 1).toISOString(), docId: "" };
}

/* ------------------------------------------------------------------ cashback */

/**
 * The purchases cashback rows link to that the screen doesn't hold (older
 * than the loaded Journal window), so their notes show.
 * `supabase`: fetched from the read model. `shadow`: fetched and logged
 * (which ids the screen is missing), returns null. Otherwise null.
 */
export async function readCashbackLinkedExpenses<E extends { id?: string }>(
  input: Base & { missingIds: string[]; locallyRemovedIds: Set<string> }
): Promise<E[] | null> {
  if (input.missingIds.length === 0) return null;
  const { mode, backend } = await resolveReadModelBackend("cashback", input);
  if (mode === "firestore" || !backend) return null;
  const { value, servedBy } = await readModelPath().read<E[]>("cashback", mode, {
    firestore: async () => [],
    supabase: () => backend.byIds<E>("expenses", input.missingIds),
    compare: (_none, found) => (found.length ? [`linked purchases not loaded on device: ${found.length}`] : []),
  });
  if (servedBy !== "supabase") return null;
  return withoutRemoved(value, input.locallyRemovedIds);
}
