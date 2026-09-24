import { describe, expect, it } from "vitest";

import type { AccountType, Expense, Income } from "../types/expense";
import { createEmptyAccountActivityFilters } from "./accountActivityFilters";
import { CSV_LINE_ENDING } from "./csv";
import { buildJournalRecords, type JournalAccount } from "./journalActivities";
import { resolveJournalDateScope } from "./journalDateScope";
import {
  buildJournalReport,
  type JournalReport,
} from "./journalReport";
import {
  journalReportFileName,
  journalReportToCsv,
  journalReportToHtml,
} from "./journalReportExport";
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

function report(options: {
  expenses?: Expense[];
  incomes?: Income[];
  filters?: Partial<ReturnType<typeof createEmptyAccountActivityFilters>>;
  query?: string;
  monthKey?: string;
} = {}): JournalReport {
  const records = buildJournalRecords(
    options.expenses ?? [],
    options.incomes ?? [],
    ACCOUNTS,
    { accountTypes: ACCOUNT_TYPES }
  );
  const filters = { ...createEmptyAccountActivityFilters(), ...options.filters };
  const result = buildJournalReport({
    runningBalance: buildJournalRunningBalance(records),
    totals: summarizeJournalTotals(records),
    periods: summarizeJournalPeriods(records, "month"),
    dateScope: resolveJournalDateScope(options.monthKey ?? "2026-09", filters),
    filters,
    query: options.query ?? "",
    scope: "all",
    currency: "INR",
    timezone: "Asia/Kolkata",
    generatedAt: "2026-09-24T01:30:00+05:30",
    readiness: { expensesComplete: true, incomesComplete: true },
  });
  if (result.status !== "ready") throw new Error("expected a ready report");
  return result.report;
}

function csvLines(model: JournalReport): string[] {
  return journalReportToCsv(model).split(CSV_LINE_ENDING);
}

function gridOf(model: JournalReport): { header: string; body: string[] } {
  const lines = csvLines(model);
  const headerIndex = lines.findIndex((line) => line.startsWith("Date,Time,Type,"));
  return { header: lines[headerIndex], body: lines.slice(headerIndex + 1) };
}

describe("journal report renderers (SPENDLY-113)", () => {
  describe("the report header", () => {
    it("carries the resolved date range, the generated time and every applied filter", () => {
      const csv = journalReportToCsv(
        report({
          expenses: [expense()],
          filters: { kind: "expense", tags: ["work"] },
          query: "coffee",
        })
      );
      expect(csv).toContain("Period,2026-09-01 to 2026-09-30");
      expect(csv).toContain("Generated,2026-09-24T01:30:00+05:30");
      expect(csv).toContain("Filter,Expense");
      expect(csv).toContain("Filter,Tag: work");
      expect(csv).toContain("Search,coffee");
      expect(csv).toContain("Currency,INR");
      expect(csv).toContain("Timezone,Asia/Kolkata");
    });

    it("says so explicitly when no filters are applied", () => {
      expect(journalReportToCsv(report({ expenses: [expense()] }))).toContain(
        "Filters,None"
      );
    });

    it("states that the file runs oldest-first while the app does not", () => {
      expect(journalReportToCsv(report({ expenses: [expense()] }))).toContain(
        "Order,Oldest first — the app lists them newest first"
      );
    });

    it("flags that a date range overrode the month pill", () => {
      const csv = journalReportToCsv(
        report({ expenses: [expense()], filters: { fromDate: "2026-01-15" } })
      );
      expect(csv).toContain("Period,From 2026-01-15");
      expect(csv).toContain("overridden by the date range");
    });

    it("carries the row count", () => {
      expect(
        journalReportToCsv(report({ expenses: [expense(), expense()] }))
      ).toContain("Rows,2");
    });

    it("prints every note", () => {
      const model = report({ expenses: [expense()] });
      const csv = journalReportToCsv(model);
      for (const note of model.notes) expect(csv).toContain(note);
    });
  });

  describe("the grid", () => {
    it("has no Counterparty column at all", () => {
      // Journal rows have no other side; a column of blanks would invite
      // someone to fill it with the account name.
      const { header } = gridOf(report({ expenses: [expense()] }));
      expect(header).not.toContain("Counterparty");
      expect(header).toContain("Account");
    });

    it("emits one body row per transaction", () => {
      const model = report({ expenses: [expense(), expense()], incomes: [income()] });
      expect(gridOf(model).body).toHaveLength(3);
    });

    it("leaves Category empty on an income row and fills Source instead", () => {
      const model = report({ incomes: [income({ source: "Freelance" })] });
      const [row] = gridOf(model).body;
      const cells = row.split(",");
      const header = gridOf(model).header.split(",");
      expect(cells[header.indexOf("Category")]).toBe("");
      expect(cells[header.indexOf("Source")]).toBe("Freelance");
    });

    it("writes the raw number into an amount cell, never a formatted currency string", () => {
      const model = report({ expenses: [expense({ amount: 1250.5 })] });
      const csv = journalReportToCsv(model);
      expect(gridOf(model).body[0]).toContain("1250.5");
      expect(csv).not.toContain("₹");
      expect(csv).not.toContain("1,250");
    });

    it("leaves the other side of the ledger blank rather than writing a zero", () => {
      const model = report({ expenses: [expense()] });
      const header = gridOf(model).header.split(",");
      const cells = gridOf(model).body[0].split(",");
      expect(cells[header.indexOf("Debit")]).toBe("250");
      expect(cells[header.indexOf("Credit")]).toBe("");
    });

    it("names the account type so card spend can be reconciled from the grid", () => {
      const model = report({ expenses: [expense({ accountId: "card-1" })] });
      expect(gridOf(model).body[0]).toContain("Credit card");
      expect(gridOf(model).body[0]).toContain("Regalia Card");
    });

    it("carries the currency on every row", () => {
      const model = report({ expenses: [expense(), expense()] });
      for (const row of gridOf(model).body) expect(row).toContain("INR");
    });

    it("joins tags and flags with a semicolon so neither breaks the comma grid", () => {
      const model = report({
        expenses: [expense({ tags: ["work", "team"], isRecurring: true })],
      });
      expect(gridOf(model).body[0]).toContain("work; team");
    });

    it("carries the document id so a row can be found again", () => {
      const model = report({ expenses: [expense({ id: "exp-traceable" })] });
      expect(gridOf(model).body[0]).toContain("exp-traceable");
    });

    it("runs oldest-first", () => {
      const model = report({
        expenses: [expense({ date: "2026-09-20" }), expense({ date: "2026-09-05" })],
      });
      const body = gridOf(model).body;
      expect(body[0]).toContain("2026-09-05");
      expect(body[1]).toContain("2026-09-20");
    });
  });

  describe("safety of free text", () => {
    it("neutralises a note starting with = in the CSV", () => {
      const model = report({ expenses: [expense({ note: "=1+1" })] });
      expect(journalReportToCsv(model)).toContain("\"'=1+1\"");
    });

    it("quotes a note containing a comma without losing it", () => {
      const model = report({ expenses: [expense({ note: 'Dinner, "Special"' })] });
      expect(journalReportToCsv(model)).toContain('"Dinner, ""Special"""');
    });

    it("escapes a note containing HTML in the printed report", () => {
      const model = report({ expenses: [expense({ note: "<script>x</script>" })] });
      const html = journalReportToHtml(model);
      expect(html).toContain("&lt;script&gt;");
      expect(html).not.toContain("<script>x</script>");
    });
  });

  describe("CSV and HTML agree", () => {
    it("report the same totals because neither computes one", () => {
      const model = report({
        expenses: [
          expense({ amount: 400, accountId: "card-1" }),
          expense({ amount: 100, accountId: "bank-1" }),
        ],
        incomes: [income({ amount: 1000, accountId: "bank-1" })],
      });
      const csv = journalReportToCsv(model);
      const html = journalReportToHtml(model);

      expect(csv).toContain("Spent,500");
      expect(csv).toContain("Of which on cards,400");
      expect(csv).toContain("Income,1000");
      // The HTML formats for the eye but is rendering the same model fields.
      expect(html).toContain("Of which on cards");
      expect(html).toContain("500.00");
      expect(html).toContain("400.00");
    });

    it("both refuse a report whose rowCount disagrees with its rows", () => {
      const model = report({ expenses: [expense()] });
      const tampered = { ...model, rowCount: 7 };
      expect(() => journalReportToCsv(tampered)).toThrow(/truncated/);
      expect(() => journalReportToHtml(tampered)).toThrow(/truncated/);
    });

    it("never calls the cumulative column a balance", () => {
      const model = report({ expenses: [expense()] });
      expect(gridOf(model).header).toContain("Cumulative net cash movement");
      expect(gridOf(model).header).not.toMatch(/balance/i);
      expect(journalReportToHtml(model)).toContain("Cumulative cash movement");
    });
  });

  describe("the printed report", () => {
    it("repeats the table header on every page and never splits a row", () => {
      const html = journalReportToHtml(report({ expenses: [expense()] }));
      expect(html).toContain("thead { display: table-header-group; }");
      expect(html).toContain(".txns tr { page-break-inside: avoid; }");
      expect(html).toContain("@page { margin: 16mm 12mm; }");
      expect(html).toContain(".summary { page-break-inside: avoid; }");
    });

    it("prints the notes above the summary", () => {
      // A caveat found on the last page, after the totals have been taken at
      // face value, is a caveat that has already misled the reader.
      const html = journalReportToHtml(report({ expenses: [expense()] }));
      expect(html.indexOf('class="note"')).toBeLessThan(html.indexOf("<h2>Summary</h2>"));
    });

    it("adds the period breakdown, which the CSV deliberately omits", () => {
      const model = report({ expenses: [expense()] });
      expect(journalReportToHtml(model)).toContain("<h2>By period</h2>");
      expect(journalReportToCsv(model)).not.toContain("By period");
    });

    it("renders the applied filters as chips, and says so when there are none", () => {
      expect(
        journalReportToHtml(report({ expenses: [expense()], filters: { tags: ["work"] } }))
      ).toContain('<span class="chip">Tag: work</span>');
      expect(journalReportToHtml(report({ expenses: [expense()] }))).toContain(
        "No filters applied."
      );
    });

    it("says so plainly when the view is empty", () => {
      expect(journalReportToHtml(report())).toContain("No transactions in this view.");
    });

    it("carries the generated stamp in the footer", () => {
      expect(journalReportToHtml(report({ expenses: [expense()] }))).toContain(
        "Generated 2026-09-24T01:30:00+05:30"
      );
    });
  });

  describe("the file name", () => {
    it("states a closed range", () => {
      expect(journalReportFileName(report({ expenses: [expense()] }), "csv")).toBe(
        "spendly-journal-2026-09-01-to-2026-09-30.csv"
      );
    });

    it("states an open-ended range rather than inventing a bound", () => {
      expect(
        journalReportFileName(
          report({ expenses: [expense()], filters: { fromDate: "2026-01-15" } }),
          "csv"
        )
      ).toBe("spendly-journal-from-2026-01-15-filtered.csv");
    });

    it("states an unscoped view as all-dates", () => {
      expect(
        journalReportFileName(report({ expenses: [expense()], monthKey: "" }), "pdf")
      ).toBe("spendly-journal-all-dates.pdf");
    });

    it("distinguishes a filtered export from an unfiltered one for the same period", () => {
      const plain = journalReportFileName(report({ expenses: [expense()] }), "csv");
      const filtered = journalReportFileName(
        report({ expenses: [expense()], filters: { tags: ["work"] } }),
        "csv"
      );
      expect(plain).not.toBe(filtered);
      expect(filtered).toContain("-filtered");
    });

    it("marks a search-narrowed export as filtered too", () => {
      expect(
        journalReportFileName(report({ expenses: [expense()], query: "coffee" }), "csv")
      ).toContain("-filtered");
    });
  });
});
