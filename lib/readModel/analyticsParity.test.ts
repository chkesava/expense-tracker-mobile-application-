import { Timestamp } from "@/lib/firestore";
import { describe, expect, it } from "vitest";

import { fullLedgerFixture } from "@/shared/__fixtures__/readModel/fullLedger";
import type { AccountPayment, Expense, Income } from "@/shared/types/expense";
import { groupByAccount, groupByCategory, groupBySubcategory } from "@/shared/utils/analytics";
import { buildCashbackHistory, missingCashbackLinks } from "@/shared/utils/cashbackHistory";
import { isInMonth } from "@/shared/utils/dates";
import { getSmartInsight } from "@/shared/utils/insights";
import { getPacingMetrics } from "@/shared/utils/insightMetrics";
import { insightsMonthRows } from "@/shared/utils/insightsMonthRows";
import {
  getAnomalies,
  getDailySpendingSeries,
  getDayOfWeekDistribution,
  getTopVendors,
  getWeekendVsWeekdaySplit,
} from "@/shared/utils/rangeAnalytics";
import { calculateDashboardSummaries } from "@/shared/utils/reconciliation";
import { mapDocument, SPEC_BY_COLLECTION, type ReadModelRow } from "@/shared/utils/readModel/mapping";

import { cashFlowFromRows } from "./analyticsSources";
import { fromReadModelDoc } from "./readModelDoc";

/**
 * SPENDLY-513 golden parity on the SPENDLY-503 fixture (cross-month edit,
 * soft delete and restore, card spend, refund, provider cashback, a voided
 * payment). The rows are shaped two ways:
 * - as the provider holds them (Firestore: `Timestamp`s, soft-deleted rows
 *   dropped);
 * - as the read model returns them: each document goes through the real
 *   sync mapping (`mapDocument`), the read model's row rules (live rows, the
 *   `month` column) and back through `fromReadModelDoc`.
 * The app's own helpers then run on both, and must agree to the paisa.
 */
const UPDATED = Timestamp.fromMillis(Date.parse("2026-10-15T12:00:00Z"));

function shaped() {
  const fx = fullLedgerFixture() as unknown as Record<string, Record<string, unknown>[]>;
  const stamp = (rows: Record<string, unknown>[]) =>
    rows.map((row, i) => ({
      ...row,
      createdAt: Timestamp.fromMillis(Date.parse(`${String(row.date)}T0${(i % 9) + 1}:00:00+05:30`)),
      ...(i % 2 ? { updatedAt: UPDATED } : {}),
    }));
  const active = <T extends Record<string, unknown>>(rows: T[]) => rows.filter((r) => !r.deletedAt);
  const firestore = {
    expenses: active(stamp(fx.expenses)) as unknown as Expense[],
    incomes: active(stamp(fx.incomes)) as unknown as Income[],
    payments: stamp(fx.accountPayments) as unknown as AccountPayment[],
  };
  const toRows = (collection: string, rows: Record<string, unknown>[]) =>
    rows.map((r) => mapDocument(SPEC_BY_COLLECTION.get(collection)!, "u1", { id: String(r.id), data: r, updateTime: 0 }));
  const readModelRows = {
    expenses: toRows("expenses", stamp(fx.expenses)).filter((r) => r.soft_deleted_at == null),
    incomes: toRows("incomes", stamp(fx.incomes)).filter((r) => r.soft_deleted_at == null),
  };
  const toApp = <T>(r: ReadModelRow) => fromReadModelDoc<T>(r.doc_id, r.doc as Record<string, unknown>);
  const monthFromReadModel = <T>(rows: ReadModelRow[], monthKey: string) => rows.filter((r) => r.month === monthKey).map((r) => toApp<T>(r));
  return { fx, firestore, readModelRows, monthFromReadModel };
}

function insights(monthExpenses: Expense[], monthIncomes: Income[], allExpenses: Expense[], monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  const end = `${monthKey}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  const sum = (rows: { amount: number }[]) => rows.reduce((s, r) => s + r.amount, 0);
  const sortById = <T extends { id?: string }>(rows: T[]) => [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return {
    totalExpense: sum(monthExpenses).toFixed(2),
    totalIncome: sum(monthIncomes).toFixed(2),
    categories: groupByCategory(monthExpenses).sort((a, b) => a.category.localeCompare(b.category)),
    subcategories: groupBySubcategory(monthExpenses),
    accounts: groupByAccount(monthExpenses),
    daily: getDailySpendingSeries(monthExpenses, `${monthKey}-01`, end),
    weekend: getWeekendVsWeekdaySplit(monthExpenses),
    dayOfWeek: getDayOfWeekDistribution(monthExpenses, "monday"),
    vendors: getTopVendors(monthExpenses),
    anomalies: getAnomalies(sortById(monthExpenses)).map((a) => a.id),
    insight: getSmartInsight(monthExpenses, 5000, monthKey),
    pacing: getPacingMetrics(allExpenses, monthKey),
  };
}

describe("Insights on read-model rows equal the TypeScript helpers (SPENDLY-513)", () => {
  for (const monthKey of ["2026-09", "2026-10", "2026-11"]) {
    it(`${monthKey}: every Insights figure is identical`, () => {
      const { firestore, readModelRows, monthFromReadModel } = shaped();
      const fsMonth = firestore.expenses.filter((e) => isInMonth(e, monthKey));
      const fsIncomes = firestore.incomes.filter((i) => isInMonth(i, monthKey));
      const rmMonth = monthFromReadModel<Expense>(readModelRows.expenses, monthKey);
      const rmIncomes = monthFromReadModel<Income>(readModelRows.incomes, monthKey);
      const rmAll = [...firestore.expenses.filter((e) => !isInMonth(e, monthKey)), ...rmMonth];
      if (monthKey !== "2026-11") expect(fsMonth.length).toBeGreaterThan(0); // 2026-11: an empty month
      expect(rmMonth.map((r) => r.id).sort()).toEqual(fsMonth.map((r) => r.id).sort());
      expect(insights(rmMonth, rmIncomes, rmAll, monthKey)).toEqual(insights(fsMonth, fsIncomes, firestore.expenses, monthKey));
    });
  }

  it("the cross-month edit lands in the month its `month` says (e5: dated 30 Sep, booked to October)", () => {
    const { readModelRows, monthFromReadModel } = shaped();
    expect(monthFromReadModel<Expense>(readModelRows.expenses, "2026-10").map((r) => r.id)).toContain("e5");
    expect(monthFromReadModel<Expense>(readModelRows.expenses, "2026-09").map((r) => r.id)).not.toContain("e5");
  });

  it("is sensitive: a one-paisa change in the read model changes the result", () => {
    const { firestore, readModelRows, monthFromReadModel } = shaped();
    const rmMonth = monthFromReadModel<Expense>(readModelRows.expenses, "2026-09").map((r) => (r.id === "e1" ? { ...r, amount: r.amount + 0.01 } : r));
    const fsMonth = firestore.expenses.filter((e) => isInMonth(e, "2026-09"));
    expect(insights(rmMonth, [], firestore.expenses, "2026-09").totalExpense).not.toEqual(insights(fsMonth, [], firestore.expenses, "2026-09").totalExpense);
  });

  it("overlay: a just-saved row counts at once, an edited row isn't double-counted, a removed row is dropped", () => {
    const { firestore, readModelRows, monthFromReadModel } = shaped();
    const rm = monthFromReadModel<Expense>(readModelRows.expenses, "2026-09");
    const fresh = { id: "new", amount: 10, date: "2026-09-12", category: "Food & Groceries", createdAt: Timestamp.fromMillis(Date.parse("2026-10-20T00:00:00Z")) } as unknown as Expense;
    const edited = { ...firestore.expenses.find((e) => e.id === "e1")!, amount: 1300, updatedAt: Timestamp.fromMillis(Date.parse("2026-10-21T00:00:00Z")) } as Expense;
    const movedAway = { ...firestore.expenses.find((e) => e.id === "e2")!, date: "2026-11-01", month: "2026-11" } as Expense;
    const localAll = [fresh, edited, movedAway];
    const localMonth = [fresh, edited];
    const rows = insightsMonthRows(rm, localAll, localMonth, new Set(["c2"]));
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect([...byId.keys()].sort()).toEqual(["c1", "e1", "new"]);
    expect(byId.get("e1")?.amount).toBe(1300);
    expect(rows).toHaveLength(3);
  });
});

describe("cash-flow history equals the dashboard summaries' rule (SPENDLY-513)", () => {
  it("every month's totals and count match calculateDashboardSummaries to the paisa", () => {
    const { fx, readModelRows } = shaped();
    const reference = calculateDashboardSummaries(fx.expenses as unknown as Expense[], fx.incomes as unknown as Income[]);
    const months = cashFlowFromRows(readModelRows.expenses, readModelRows.incomes, "2000-01", "2999-12");
    expect(months.map((m) => m.period).sort()).toEqual([...reference.keys()].sort());
    for (const m of months) {
      const ref = reference.get(m.period)!;
      expect([m.totalExpenses.toFixed(2), m.totalIncome.toFixed(2), m.transactionCount]).toEqual([
        Number(ref.totalExpenses).toFixed(2),
        Number(ref.totalIncome).toFixed(2),
        ref.transactionCount,
      ]);
    }
  });
});

describe("cashback history with read-model linked purchases (SPENDLY-513)", () => {
  it("each cashback appears once, totals are unchanged, and a linked purchase's note fills in", () => {
    const { firestore } = shaped();
    const card = "card";
    const linked = { ...firestore.payments.find((p) => p.id === "p2")!, linkedExpenseId: "c1" } as AccountPayment;
    const payments = firestore.payments.map((p) => (p.id === "p2" ? linked : p));
    const withNote = firestore.expenses.map((e) => (e.id === "c1" ? { ...e, note: "Laptop" } : e));
    const loadedWindow = withNote.filter((e) => e.id !== "c1"); // c1 is older than the loaded window
    expect(missingCashbackLinks(card, payments, loadedWindow)).toEqual(["c1"]);

    const full = buildCashbackHistory(card, payments, withNote);
    const fromReadModel = fromReadModelDoc<Expense>("c1", JSON.parse(JSON.stringify({ ...withNote.find((e) => e.id === "c1"), createdAt: "2026-09-05T00:00:00.000Z" })));
    const filled = buildCashbackHistory(card, payments, [...loadedWindow, fromReadModel]);
    const without = buildCashbackHistory(card, payments, loadedWindow);

    expect(filled).toEqual(full);
    expect(filled.entries.map((e) => e.id)).toEqual(["p2"]);
    expect(filled.entries[0].linkedExpenseNote).toBe("Laptop");
    expect(without.entries[0].linkedExpenseNote).toBeUndefined();
    expect([without.totalReceived, without.statementCredits, without.rewards, without.totalVoided]).toEqual([
      filled.totalReceived, filled.statementCredits, filled.rewards, filled.totalVoided,
    ]);
  });
});
