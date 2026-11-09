import { describe, expect, it } from "vitest";

import { planJournalMonthLoad, type JournalMonthLoadInput } from "./journalMonthLoad";

const month = (monthKey: string) => ({ fromDate: `${monthKey}-01`, monthKey, monthOverridden: false });

function plan(overrides: Partial<JournalMonthLoadInput>) {
  return planJournalMonthLoad({
    scope: month("2025-03"),
    currentMonthKey: "2026-11",
    ledgerComplete: false,
    oldestLoadedDate: "2026-09-20",
    needsExpenses: true,
    expenseMonthsLoaded: new Set(),
    incomeMonthsLoaded: new Set(),
    ...overrides,
  });
}

describe("planJournalMonthLoad (SPENDLY-748)", () => {
  it("an older month outside the live window is loaded on demand, one month-scoped read per collection", () => {
    expect(plan({})).toEqual({ periodComplete: false, loadExpensesMonth: "2025-03", loadIncomesMonth: "2025-03" });
  });

  it("a back-dated row in the window no longer passes an older month off as loaded", () => {
    // The bug: the window's oldest *date* reached 2024, so 2025-03 looked covered and was never read.
    expect(plan({ oldestLoadedDate: "2024-01-05" })).toMatchObject({
      periodComplete: false,
      loadExpensesMonth: "2025-03",
      loadIncomesMonth: "2025-03",
    });
  });

  it("is complete, with nothing to read, once the month is cached", () => {
    expect(plan({ expenseMonthsLoaded: new Set(["2025-03"]), incomeMonthsLoaded: new Set(["2025-03"]) })).toEqual({
      periodComplete: true,
      loadExpensesMonth: null,
      loadIncomesMonth: null,
    });
  });

  it("reads only the collection still missing", () => {
    expect(plan({ incomeMonthsLoaded: new Set(["2025-03"]) })).toEqual({
      periodComplete: false,
      loadExpensesMonth: "2025-03",
      loadIncomesMonth: null,
    });
  });

  it("the income sub-tab never reads expenses", () => {
    expect(plan({ needsExpenses: false })).toEqual({ periodComplete: false, loadExpensesMonth: null, loadIncomesMonth: "2025-03" });
    expect(plan({ needsExpenses: false, incomeMonthsLoaded: new Set(["2025-03"]) }).periodComplete).toBe(true);
  });

  it("a complete ledger reads nothing", () => {
    expect(plan({ ledgerComplete: true })).toEqual({ periodComplete: true, loadExpensesMonth: null, loadIncomesMonth: null });
  });

  it("the current month keeps the newest-300 window when it reaches the month start (SPENDLY-585)", () => {
    expect(plan({ scope: month("2026-11"), oldestLoadedDate: "2026-10-12" })).toEqual({
      periodComplete: true,
      loadExpensesMonth: null,
      loadIncomesMonth: null,
    });
  });

  it("the current month is read directly when the window does not reach its start", () => {
    expect(plan({ scope: month("2026-11"), oldestLoadedDate: "2026-11-04" })).toMatchObject({
      periodComplete: false,
      loadExpensesMonth: "2026-11",
    });
  });

  it("a custom range never triggers a month read and keeps the window rule", () => {
    const scope = { fromDate: "2025-01-10", monthKey: "2025-03", monthOverridden: true };
    expect(plan({ scope, oldestLoadedDate: "2026-01-01" })).toEqual({ periodComplete: false, loadExpensesMonth: null, loadIncomesMonth: null });
    expect(plan({ scope, oldestLoadedDate: "2024-12-01" }).periodComplete).toBe(true);
  });
});
