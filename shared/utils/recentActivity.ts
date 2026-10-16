import type { Expense, Income } from "../types/expense";
import { activeLedgerRows } from "./ledgerRow";

export type RecentActivityItem =
  | { kind: "expense"; key: string; date: string; createdMs: number; row: Expense }
  | { kind: "income"; key: string; date: string; createdMs: number; row: Income };

/** Firestore Timestamp, Date, ISO string or epoch ms → ms (0 when unknown). */
function createdMillis(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value instanceof Date) return value.getTime() || 0;
  if (typeof value === "string") return Date.parse(value) || 0;
  if (typeof value === "object") {
    const ts = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
    if (typeof ts.toMillis === "function") return ts.toMillis() || 0;
    if (typeof ts.seconds === "number") return ts.seconds * 1000 + Math.floor((ts.nanoseconds ?? 0) / 1e6);
  }
  return 0;
}

/**
 * SPENDLY-533 — the Dashboard's "Recent activity": the newest live expenses
 * and incomes together, newest first (date, then created time — the same order
 * as the recent-expenses query). Soft-deleted rows (`deletedAt`) never show.
 *
 * Inputs are what the screen already holds — the limit-N recent-expenses feed
 * and the incomes FinanceDataProvider loads — so this adds no reads.
 */
export function mergeRecentActivity(
  expenses: readonly Expense[],
  incomes: readonly Income[],
  limit: number
): RecentActivityItem[] {
  const items: RecentActivityItem[] = [
    ...activeLedgerRows(expenses).map((row, i) => ({
      kind: "expense" as const,
      key: `expense:${row.id ?? i}`,
      date: row.date ?? "",
      createdMs: createdMillis(row.createdAt),
      row,
    })),
    ...activeLedgerRows(incomes).map((row, i) => ({
      kind: "income" as const,
      key: `income:${row.id ?? i}`,
      date: row.date ?? "",
      createdMs: createdMillis(row.createdAt),
      row,
    })),
  ];

  items.sort((a, b) => (a.date === b.date ? b.createdMs - a.createdMs : a.date < b.date ? 1 : -1));
  return items.slice(0, Math.max(0, limit));
}
