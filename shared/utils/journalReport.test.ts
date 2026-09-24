import { describe, expect, it } from "vitest";

import type { Account, AccountType, Expense, Income } from "../types/expense";
import { createEmptyAccountActivityFilters } from "./accountActivityFilters";
import { buildJournalRecords, type JournalAccount } from "./journalActivities";
import { resolveJournalDateScope } from "./journalDateScope";
import {
  assertJournalReportComplete,
  buildJournalReport,
  type JournalReport,
  type JournalReportInput,
} from "./journalReport";
import {
  summarizeJournalPeriods,
  summarizeJournalTotals,
} from "./journalPeriodSummary";
import { buildJournalRunningBalance } from "./journalRunningBalance";

const ACCOUNTS: JournalAccount[] = [
  { id: "bank-1", name: "HDFC Savings", typeId: "type-bank" },
  { id: "card-1", name: "Regalia Card", typeId: "type-card" },
];

const ACCOUNT_TYPES: Pick<AccountType, "id" | "name">[] = [
  { id: "type-bank", name: "Savings Account" },
  { id: "type-card", name: "Credit Card" },
];

let seq = 0;

function expense(over: Partial<Expense> = {}): Expense {
  seq += 1;
  return {
    id: `exp-${seq}`,
    amount: 250,
    category: "Food",
    note: "Lunch",
    date: "2026-09-10",
    month: "2026-09",
    createdAt: seq,
    ...over,
  };
}

function income(over: Partial<Income> = {}): Income {
  seq += 1;
  return {
    id: `inc-${seq}`,
    amount: 5000,
    source: "Salary",
    note: "September",
    date: "2026-09-01",
    month: "2026-09",
    createdAt: seq,
    ...over,
  };
}

const READY = { expensesComplete: true, incomesComplete: true };

function build(options: {
  expenses?: Expense[];
  incomes?: Income[];
  scope?: JournalReportInput["scope"];
  monthKey?: string;
  filters?: Partial<ReturnType<typeof createEmptyAccountActivityFilters>>;
  query?: string;
  readiness?: JournalReportInput["readiness"];
} = {}) {
  const scope = options.scope ?? "all";
  const records = buildJournalRecords(
    options.expenses ?? [],
    options.incomes ?? [],
    ACCOUNTS,
    { scope, accountTypes: ACCOUNT_TYPES }
  );
  const filters = { ...createEmptyAccountActivityFilters(), ...options.filters };
  return buildJournalReport({
    runningBalance: buildJournalRunningBalance(records),
    totals: summarizeJournalTotals(records),
    periods: summarizeJournalPeriods(records, "month"),
    dateScope: resolveJournalDateScope(options.monthKey ?? "2026-09", filters),
    filters,
    query: options.query ?? "",
    scope,
    currency: "INR",
    timezone: "Asia/Kolkata",
    generatedAt: "2026-09-24T01:30:00+05:30",
    readiness: options.readiness ?? READY,
  });
}

function ready(...args: Parameters<typeof build>): JournalReport {
  const result = build(...args);
  if (result.status !== "ready") throw new Error(`expected ready, got ${result.status}`);
  return result.report;
}

describe("journal report (SPENDLY-113)", () => {
  describe("the truncation gate", () => {
    it("refuses a staged ledger, returning unavailable and specifically not an empty ready report", () => {
      // Zero rows because nothing loaded is not the same claim as zero rows
      // because nothing matched, and a file cannot carry the difference.
      const result = build({
        expenses: [expense(), expense()],
        readiness: { expensesComplete: false, incomesComplete: true },
      });
      expect(result.status).toBe("unavailable");
      expect(result).not.toHaveProperty("report");
      if (result.status === "unavailable") {
        expect(result.reason).toBe("expenses_incomplete");
      }
    });

    it("refuses when incomes are truncated even though expenses are complete", () => {
      const result = build({
        readiness: { expensesComplete: true, incomesComplete: false },
      });
      expect(result.status).toBe("unavailable");
      if (result.status === "unavailable") {
        expect(result.reason).toBe("incomes_incomplete");
      }
    });

    it("gates the income scope on incomesComplete alone, so it never waits on expenses", () => {
      const result = build({
        scope: "incomes",
        incomes: [income()],
        readiness: { expensesComplete: false, incomesComplete: true },
      });
      expect(result.status).toBe("ready");
    });

    it("gates the expenses scope on expensesComplete alone", () => {
      const result = build({
        scope: "expenses",
        expenses: [expense()],
        readiness: { expensesComplete: true, incomesComplete: false },
      });
      expect(result.status).toBe("ready");
    });

    it("builds the same view once the ledger is complete", () => {
      const report = ready({ expenses: [expense(), expense()] });
      expect(report.rowCount).toBe(2);
    });
  });

  describe("the row set", () => {
    it("emits one row per journal record and never pulls in another leg", () => {
      // The Journal is exactly one record per Expense and one per Income.
      // An export that "completed the picture" with transfer or payment legs
      // would double-count the money already in the grid.
      const report = ready({
        expenses: [expense(), expense()],
        incomes: [income()],
      });
      expect(report.rows).toHaveLength(3);
      expect(report.rows.filter((row) => row.kind === "expense")).toHaveLength(2);
      expect(report.rows.filter((row) => row.kind === "income")).toHaveLength(1);
    });

    it("orders rows oldest-first even though filtered arrives as all expenses then all incomes", () => {
      const report = ready({
        expenses: [expense({ date: "2026-09-20" }), expense({ date: "2026-09-05" })],
        incomes: [income({ date: "2026-09-10" })],
      });
      expect(report.rows.map((row) => row.date)).toEqual([
        "2026-09-05",
        "2026-09-10",
        "2026-09-20",
      ]);
      expect(report.order).toBe("oldest-first");
    });

    it("excludes a soft-deleted row", () => {
      const report = ready({
        expenses: [expense(), expense({ deletedAt: "2026-09-12T00:00:00Z" })],
      });
      expect(report.rowCount).toBe(1);
    });

    it("sets exactly one of debit and credit per row", () => {
      const report = ready({ expenses: [expense()], incomes: [income()] });
      for (const row of report.rows) {
        expect(row.debit === undefined).toBe(row.credit !== undefined);
      }
    });
  });

  describe("row fields", () => {
    it("leaves category empty on an income row and fills source instead", () => {
      // Income has no category by design; mapping `source` onto it would put
      // payer names in the category facet.
      const report = ready({ incomes: [income({ source: "Freelance" })] });
      const [row] = report.rows;
      expect(row.category).toBeUndefined();
      expect(row.subcategory).toBeUndefined();
      expect(row.source).toBe("Freelance");
    });

    it("leaves source empty on an expense row and fills category instead", () => {
      const report = ready({
        expenses: [expense({ category: "Travel", subcategory: "Taxi" })],
      });
      const [row] = report.rows;
      expect(row.source).toBeUndefined();
      expect(row.category).toBe("Travel");
      expect(row.subcategory).toBe("Taxi");
    });

    it("marks a card row so cardSpent can be reconciled from the grid", () => {
      const report = ready({ expenses: [expense({ accountId: "card-1" })] });
      expect(report.rows[0].isCard).toBe(true);
      expect(report.rows[0].accountTypeLabel).toBe("Credit card");
      expect(report.rows[0].accountName).toBe("Regalia Card");
    });

    it("leaves the account type blank rather than guessing for an account-less cash row", () => {
      const report = ready({ expenses: [expense()] });
      expect(report.rows[0].accountName).toBeUndefined();
      expect(report.rows[0].accountTypeLabel).toBe("");
      expect(report.rows[0].isCard).toBe(false);
    });

    it("carries the audit status on expenses and never on income", () => {
      const report = ready({
        expenses: [expense({ isAudited: true })],
        incomes: [income()],
      });
      const expenseRow = report.rows.find((row) => row.kind === "expense");
      const incomeRow = report.rows.find((row) => row.kind === "income");
      expect(expenseRow?.status).toBe("audited");
      expect(incomeRow?.status).toBeUndefined();
    });

    it("carries tags on expenses and an empty list on income", () => {
      const report = ready({
        expenses: [expense({ tags: ["work", "team"] })],
        incomes: [income()],
      });
      expect(report.rows.find((row) => row.kind === "expense")?.tags).toEqual([
        "work",
        "team",
      ]);
      expect(report.rows.find((row) => row.kind === "income")?.tags).toEqual([]);
    });

    it("omits a time the row never carried rather than inventing one", () => {
      const report = ready({ expenses: [expense({ time: "", createdAt: null })] });
      expect(report.rows[0].time).toBeUndefined();
    });
  });

  describe("the cumulative columns", () => {
    it("ties the last row's cumulative figure to the totals", () => {
      const report = ready({
        expenses: [expense({ amount: 300, accountId: "bank-1" })],
        incomes: [income({ amount: 1000, accountId: "bank-1" })],
      });
      const last = report.rows[report.rows.length - 1];
      expect(last.cashFlowToDate).toBe(report.totals.netCash);
    });

    it("accumulates downward, so the first row is its own contribution", () => {
      const report = ready({
        expenses: [
          expense({ amount: 100, date: "2026-09-02", accountId: "bank-1" }),
          expense({ amount: 200, date: "2026-09-03", accountId: "bank-1" }),
        ],
      });
      expect(report.rows[0].cashFlowToDate).toBe(-100);
      expect(report.rows[1].cashFlowToDate).toBe(-300);
    });

    it("keeps a card purchase out of the cash line but in card spend", () => {
      const report = ready({ expenses: [expense({ amount: 400, accountId: "card-1" })] });
      expect(report.rows[0].cashFlowToDate).toBe(0);
      expect(report.rows[0].cardSpendToDate).toBe(400);
    });
  });

  describe("totals, under the epic's invariants", () => {
    it("carries both spent and cashOut so a card purchase is never read as cash", () => {
      const report = ready({
        expenses: [
          expense({ amount: 400, accountId: "card-1" }),
          expense({ amount: 100, accountId: "bank-1" }),
        ],
      });
      expect(report.totals.spent).toBe(500);
      expect(report.totals.cardSpent).toBe(400);
      expect(report.totals.cashOut).toBe(100);
    });

    it("never labels the cumulative figure a balance", () => {
      const report = ready({ expenses: [expense()] });
      const balanceNote = report.notes.find((note) => note.includes("balance"));
      expect(balanceNote).toContain("not an account balance");
      expect(JSON.stringify(report.rows)).not.toMatch(/balance/i);
    });

    it("warns that credit-card payments are not journal rows", () => {
      const report = ready({ expenses: [expense()] });
      expect(report.notes.join(" ")).toContain(
        "Payments made to a credit card are not journal rows"
      );
    });

    it("says journal rows have no counterparty", () => {
      const report = ready({ expenses: [expense()] });
      expect(report.notes.join(" ")).toContain("no counterparty");
    });
  });

  describe("the report header", () => {
    it("states a closed range", () => {
      const report = ready({ expenses: [expense()] });
      expect(report.period.label).toBe("2026-09-01 to 2026-09-30");
      expect(report.period.monthOverridden).toBe(false);
    });

    it("states an open-ended range as 'From X' rather than inventing a closing date", () => {
      const report = ready({
        expenses: [expense()],
        filters: { fromDate: "2026-01-15" },
      });
      expect(report.period.label).toBe("From 2026-01-15");
      expect(report.period.openEnd).toBe(true);
      expect(report.period.monthOverridden).toBe(true);
    });

    it("states a range open at the start as 'Up to X'", () => {
      const report = ready({ expenses: [expense()], filters: { toDate: "2026-03-31" } });
      expect(report.period.label).toBe("Up to 2026-03-31");
      expect(report.period.openStart).toBe(true);
    });

    it("states an unscoped view as 'All dates' rather than as today", () => {
      const report = ready({ expenses: [expense()], monthKey: "" });
      expect(report.period.label).toBe("All dates");
    });

    it("collapses a single-day range to that day", () => {
      const report = ready({
        expenses: [expense()],
        filters: { fromDate: "2026-09-10", toDate: "2026-09-10" },
      });
      expect(report.period.label).toBe("2026-09-10");
    });

    it("lists the applied filters in the same words as the filter chips", () => {
      const report = ready({
        expenses: [expense()],
        filters: { kind: "expense", tags: ["work"], accounts: ["HDFC Savings"] },
      });
      expect(report.appliedFilters).toEqual([
        "Expense",
        "Account: HDFC Savings",
        "Tag: work",
      ]);
    });

    it("carries the search query, trimmed, and an empty string when there is none", () => {
      expect(ready({ expenses: [expense()], query: "  coffee " }).searchQuery).toBe(
        "coffee"
      );
      expect(ready({ expenses: [expense()] }).searchQuery).toBe("");
    });

    it("carries the caller's stamp rather than inventing a clock", () => {
      const report = ready({ expenses: [expense()] });
      expect(report.generatedAt).toBe("2026-09-24T01:30:00+05:30");
      expect(report.timezone).toBe("Asia/Kolkata");
      expect(report.currency).toBe("INR");
    });

    it("names the scope", () => {
      expect(ready({ expenses: [expense()] }).scopeLabel).toBe("All transactions");
      expect(ready({ scope: "incomes", incomes: [income()] }).scopeLabel).toBe(
        "Income only"
      );
    });
  });

  describe("the row-count assertion", () => {
    it("throws when the count disagrees with what the caller expected", () => {
      const report = ready({ expenses: [expense()] });
      expect(() => assertJournalReportComplete(report, 2)).toThrow(
        /Journal export truncated: expected 2 rows, got 1/
      );
    });

    it("throws when the row list disagrees with rowCount", () => {
      const report = ready({ expenses: [expense()] });
      const tampered = { ...report, rowCount: 5 };
      expect(() => assertJournalReportComplete(tampered, 5)).toThrow(
        /disagrees with rowCount/
      );
    });

    it("passes on a well-formed report", () => {
      const report = ready({ expenses: [expense(), expense()] });
      expect(() => assertJournalReportComplete(report, 2)).not.toThrow();
    });
  });

  describe("purity", () => {
    it("does not mutate the running-balance rows it was handed", () => {
      const records = buildJournalRecords([expense(), expense()], [], ACCOUNTS, {
        accountTypes: ACCOUNT_TYPES,
      });
      const runningBalance = buildJournalRunningBalance(records);
      const order = runningBalance.rows.map((row) => row.record.activity.id);

      buildJournalReport({
        runningBalance,
        totals: summarizeJournalTotals(records),
        periods: [],
        dateScope: resolveJournalDateScope("2026-09", createEmptyAccountActivityFilters()),
        filters: createEmptyAccountActivityFilters(),
        query: "",
        scope: "all",
        currency: "INR",
        generatedAt: "2026-09-24T01:30:00+05:30",
        readiness: READY,
      });

      expect(runningBalance.rows.map((row) => row.record.activity.id)).toEqual(order);
    });

    it("builds an empty report rather than throwing when nothing matched", () => {
      const report = ready();
      expect(report.rowCount).toBe(0);
      expect(report.rows).toEqual([]);
      expect(report.totals.transactionCount).toBe(0);
    });
  });
});
