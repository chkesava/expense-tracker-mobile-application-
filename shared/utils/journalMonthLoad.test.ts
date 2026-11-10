import { describe, expect, it } from "vitest";

import {
  customRangeMonthsInScope,
  planJournalMonthLoad,
  type JournalMonthLoadInput,
} from "./journalMonthLoad";

const month = (monthKey: string) => ({
  fromDate: `${monthKey}-01`,
  toDate: `${monthKey}-28`,
  monthKey,
  monthOverridden: false,
});

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

describe("planJournalMonthLoad month pills (SPENDLY-748)", () => {
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
});

describe("customRangeMonthsInScope", () => {
  it("returns months newest first for a multi-month range", () => {
    expect(customRangeMonthsInScope("2025-05-15", "2025-07-20", "2026-11")).toEqual({
      months: ["2025-07", "2025-06", "2025-05"],
      truncated: false,
    });
  });

  it("returns a single month for a range within one month", () => {
    expect(customRangeMonthsInScope("2025-06-01", "2025-06-30", "2026-11")).toEqual({
      months: ["2025-06"],
      truncated: false,
    });
  });

  it("uses currentMonthKey when toDate is empty", () => {
    expect(customRangeMonthsInScope("2026-09-01", "", "2026-11")).toEqual({
      months: ["2026-11", "2026-10", "2026-09"],
      truncated: false,
    });
  });

  it("returns empty when fromDate is empty", () => {
    expect(customRangeMonthsInScope("", "2026-05-01", "2026-11")).toEqual({
      months: [],
      truncated: false,
    });
  });

  it("returns empty when fromDate is after toDate", () => {
    expect(customRangeMonthsInScope("2026-08-01", "2026-05-01", "2026-11")).toEqual({
      months: [],
      truncated: false,
    });
  });

  it("caps at MAX_RANGE_MONTHS and marks truncated", () => {
    const res = customRangeMonthsInScope("2024-01-01", "2026-11-30", "2026-11");
    expect(res.months.length).toBe(12);
    expect(res.truncated).toBe(true);
    expect(res.months[0]).toBe("2026-11");
    expect(res.months[11]).toBe("2025-12");
  });
});

describe("planJournalMonthLoad custom ranges (SPENDLY-749)", () => {
  it("a back-dated row in the live window does not falsely mark an older custom range complete", () => {
    const scope = { fromDate: "2025-06-01", toDate: "2025-06-30", monthKey: "2025-03", monthOverridden: true };
    // The bug: oldestLoadedDate reached 2024 because of a back-dated row, so the custom range was marked complete!
    expect(plan({ scope, oldestLoadedDate: "2024-01-05" })).toEqual({
      periodComplete: false,
      loadExpensesMonth: "2025-06",
      loadIncomesMonth: "2025-06",
    });
  });

  it("loads missing months of a multi-month range sequentially from newest to oldest", () => {
    const scope = { fromDate: "2025-05-15", toDate: "2025-07-20", monthKey: "2025-03", monthOverridden: true };

    // Initial state: nothing loaded, requests newest month (2025-07)
    expect(plan({ scope })).toEqual({
      periodComplete: false,
      loadExpensesMonth: "2025-07",
      loadIncomesMonth: "2025-07",
    });

    // 2025-07 loaded: requests 2025-06
    expect(
      plan({
        scope,
        expenseMonthsLoaded: new Set(["2025-07"]),
        incomeMonthsLoaded: new Set(["2025-07"]),
      })
    ).toEqual({
      periodComplete: false,
      loadExpensesMonth: "2025-06",
      loadIncomesMonth: "2025-06",
    });

    // 2025-07 and 2025-06 loaded: requests 2025-05
    expect(
      plan({
        scope,
        expenseMonthsLoaded: new Set(["2025-07", "2025-06"]),
        incomeMonthsLoaded: new Set(["2025-07", "2025-06"]),
      })
    ).toEqual({
      periodComplete: false,
      loadExpensesMonth: "2025-05",
      loadIncomesMonth: "2025-05",
    });

    // All three loaded: complete!
    expect(
      plan({
        scope,
        expenseMonthsLoaded: new Set(["2025-07", "2025-06", "2025-05"]),
        incomeMonthsLoaded: new Set(["2025-07", "2025-06", "2025-05"]),
      })
    ).toEqual({
      periodComplete: true,
      loadExpensesMonth: null,
      loadIncomesMonth: null,
    });
  });

  it("only requests missing collections in a custom range", () => {
    const scope = { fromDate: "2025-06-01", toDate: "2025-06-30", monthKey: "2025-03", monthOverridden: true };
    expect(plan({ scope, incomeMonthsLoaded: new Set(["2025-06"]) })).toEqual({
      periodComplete: false,
      loadExpensesMonth: "2025-06",
      loadIncomesMonth: null,
    });
  });

  it("the income sub-tab only requests incomes for a custom range", () => {
    const scope = { fromDate: "2025-06-01", toDate: "2025-06-30", monthKey: "2025-03", monthOverridden: true };
    expect(plan({ scope, needsExpenses: false })).toEqual({
      periodComplete: false,
      loadExpensesMonth: null,
      loadIncomesMonth: "2025-06",
    });
    expect(
      plan({
        scope,
        needsExpenses: false,
        incomeMonthsLoaded: new Set(["2025-06"]),
      }).periodComplete
    ).toBe(true);
  });

  it("a custom range within the current month is complete when the live window covers it", () => {
    const scope = { fromDate: "2026-11-05", toDate: "2026-11-10", monthKey: "2026-11", monthOverridden: true };
    expect(plan({ scope, oldestLoadedDate: "2026-10-15" })).toEqual({
      periodComplete: true,
      loadExpensesMonth: null,
      loadIncomesMonth: null,
    });
  });

  it("a custom range within the current month loads directly when the live window does not reach the month start", () => {
    const scope = { fromDate: "2026-11-05", toDate: "2026-11-10", monthKey: "2026-11", monthOverridden: true };
    expect(plan({ scope, oldestLoadedDate: "2026-11-06" })).toMatchObject({
      periodComplete: false,
      loadExpensesMonth: "2026-11",
      loadIncomesMonth: "2026-11",
    });
  });

  it("an open-ended past range (no fromDate) is never complete until the ledger is complete and triggers no month reads", () => {
    const scope = { fromDate: "", toDate: "2026-05-01", monthKey: "2026-11", monthOverridden: true };
    expect(plan({ scope })).toEqual({
      periodComplete: false,
      loadExpensesMonth: null,
      loadIncomesMonth: null,
    });
    expect(plan({ scope, ledgerComplete: true })).toEqual({
      periodComplete: true,
      loadExpensesMonth: null,
      loadIncomesMonth: null,
    });
  });

  it("an open-ended future range (fromDate set, no toDate) spans up to the current month", () => {
    const scope = { fromDate: "2026-09-01", toDate: "", monthKey: "2026-11", monthOverridden: true };
    // Current month (2026-11) is covered by live window (oldestLoadedDate 2026-09-20 <= 2026-11-01),
    // so it immediately requests 2026-10!
    expect(plan({ scope, oldestLoadedDate: "2026-09-20" })).toEqual({
      periodComplete: false,
      loadExpensesMonth: "2026-10",
      loadIncomesMonth: "2026-10",
    });
  });

  it("a custom range spanning more than 12 months is capped and remains incomplete without ledgerComplete", () => {
    const scope = { fromDate: "2024-01-01", toDate: "2026-11-10", monthKey: "2026-11", monthOverridden: true };
    const all12Months = customRangeMonthsInScope("2024-01-01", "2026-11-10", "2026-11").months;
    expect(all12Months.length).toBe(12);

    // All 12 loaded, but because the range spans 35 months, it remains incomplete
    expect(
      plan({
        scope,
        expenseMonthsLoaded: new Set(all12Months),
        incomeMonthsLoaded: new Set(all12Months),
      })
    ).toEqual({
      periodComplete: false,
      loadExpensesMonth: null,
      loadIncomesMonth: null,
    });

    // But with ledgerComplete: true, it is complete
    expect(plan({ scope, ledgerComplete: true })).toEqual({
      periodComplete: true,
      loadExpensesMonth: null,
      loadIncomesMonth: null,
    });
  });
});
