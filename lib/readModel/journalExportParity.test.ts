import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";

import { createEmptyAccountActivityFilters } from "@/shared/utils/accountActivityFilters";
import { runJournalFilterPipeline } from "@/shared/utils/journalFilterPipeline";
import { buildJournalReport } from "@/shared/utils/journalReport";
import { journalReportToCsv, journalReportToHtml } from "@/shared/utils/journalReportExport";
import { toJsonDoc } from "@/shared/utils/readModel/mapping";
import { fullLedgerFixture } from "@/shared/__fixtures__/readModel/fullLedger";

import { fromReadModelDoc } from "./readModelDoc";

/**
 * SPENDLY-512 — the Journal export and its running balance are the same
 * whether the rows came from Firestore or from the read model.
 *
 * The same ledger (the SPENDLY-503 golden fixture: transfers both ways,
 * soft delete, restore, cross-month edit, card spend, refund, cashback) is
 * shaped two ways:
 * - as Firestore returns it: `createdAt` / `updatedAt` are `Timestamp`s;
 * - as the read model returns it: the sync stores the document as JSON
 *   (`toJsonDoc`), and `fromReadModelDoc` turns it back into an app object.
 * Both run through the Journal's real pipeline, report model and renderers.
 */
function ledgers() {
  const fx = fullLedgerFixture() as unknown as Record<string, Record<string, unknown>[]>;
  // Give rows real creation times (with times of day, which order same-day rows).
  const stamp = (rows: Record<string, unknown>[]): Record<string, unknown>[] =>
    rows.map((row, i) => ({
      ...row,
      createdAt: Timestamp.fromMillis(Date.parse(`${String(row.date)}T0${(i % 9) + 1}:1${i % 6}:00+05:30`)),
      ...(i % 2 ? { updatedAt: Timestamp.fromMillis(Date.parse("2026-10-15T12:00:00Z")) } : {}),
    }));
  const firestore = { expenses: stamp(fx.expenses), incomes: stamp(fx.incomes) };
  const readModel = {
    expenses: firestore.expenses.map((r) => fromReadModelDoc<Record<string, unknown>>(String(r.id), toJsonDoc(r) as Record<string, unknown>)),
    incomes: firestore.incomes.map((r) => fromReadModelDoc<Record<string, unknown>>(String(r.id), toJsonDoc(r) as Record<string, unknown>)),
  };
  return { fx, firestore, readModel };
}

function exportFor(rows: { expenses: Record<string, unknown>[]; incomes: Record<string, unknown>[] }, accounts: unknown[], accountTypes: unknown[], monthKey: string | undefined) {
  const filters = createEmptyAccountActivityFilters();
  const journal = runJournalFilterPipeline({
    expenses: rows.expenses as never,
    incomes: rows.incomes as never,
    accounts: accounts as never,
    accountTypes: accountTypes as never,
    query: "",
    filters,
    monthKey,
    scope: "all",
  });
  const result = buildJournalReport({
    runningBalance: journal.runningBalance,
    totals: journal.totals,
    periods: journal.periods,
    dateScope: journal.dateScope,
    filters,
    query: "",
    scope: "all",
    currency: "INR",
    timezone: "Asia/Kolkata",
    generatedAt: "2026-10-20T10:00:00+05:30",
    readiness: { expensesComplete: true, incomesComplete: true },
  });
  if (result.status !== "ready") throw new Error(`report not ready: ${JSON.stringify(result)}`);
  return { journal, csv: journalReportToCsv(result.report), html: journalReportToHtml(result.report) };
}

describe("Journal export: read model = Firestore (SPENDLY-512)", () => {
  it.each([["September 2026", "2026-09"], ["October 2026", "2026-10"]])("%s: same CSV, same PDF HTML, same totals", (_label, monthKey) => {
    const { fx, firestore, readModel } = ledgers();
    const a = exportFor(firestore, fx.accounts, fx.accountTypes, monthKey);
    const b = exportFor(readModel, fx.accounts, fx.accountTypes, monthKey);
    expect(a.csv.length).toBeGreaterThan(200);
    expect(b.csv).toBe(a.csv);
    expect(b.html).toBe(a.html);
    expect(b.journal.totals).toEqual(a.journal.totals);
  });

  it("the anchored running balance (SPENDLY-487) is identical row by row", () => {
    const { fx, firestore, readModel } = ledgers();
    const a = exportFor(firestore, fx.accounts, fx.accountTypes, "2026-10").journal.runningBalance;
    const b = exportFor(readModel, fx.accounts, fx.accountTypes, "2026-10").journal.runningBalance;
    const anchor = (rows: typeof a.rows) => rows.map((r) => [r.record.activity.id, r.cashFlowToDate, r.cardSpendToDate]);
    expect(a.rows.length).toBeGreaterThan(0);
    // Not vacuous: the fixture has real cash flow and card spend.
    expect(a.rows.some((r) => r.cashFlowToDate !== 0)).toBe(true);
    expect(a.rows.some((r) => r.cardSpendToDate !== 0)).toBe(true);
    expect(anchor(b.rows)).toEqual(anchor(a.rows));
  });

  it("the displayed order is the same (same-day rows ordered by time of creation)", () => {
    const { fx, firestore, readModel } = ledgers();
    const order = (rows: typeof firestore) =>
      exportFor(rows, fx.accounts, fx.accountTypes, "2026-09").journal.filtered.map((r) => r.activity.id);
    expect(order(readModel)).toEqual(order(firestore));
  });
});
