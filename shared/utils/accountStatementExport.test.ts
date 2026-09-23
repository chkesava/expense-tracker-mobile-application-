import { describe, expect, it } from "vitest";

import type { AccountActivity } from "@/shared/types/expense";
import { enrichAccountActivities } from "./accountActivityFilters";
import {
  buildAccountStatement,
  type AccountStatement,
  type AccountStatementMeta,
  type StatementPeriod,
} from "./accountStatement";
import {
  statementFileName,
  statementToCsv,
  statementToHtml,
} from "./accountStatementExport";

const ACCOUNT: AccountStatementMeta = {
  name: "HDFC Savings",
  institution: "HDFC Bank",
  last4: "4821",
  typeLabel: "Personal Account",
  currency: "INR",
  timezone: "Asia/Kolkata",
};

const PERIOD: StatementPeriod = {
  preset: "this-month",
  fromDate: "2026-09-01",
  toDate: "2026-09-30",
  label: "2026-09-01 to 2026-09-30",
};

function make(
  activities: AccountActivity[],
  options: { supportsRunningBalance?: boolean } = {}
): AccountStatement {
  return buildAccountStatement(
    enrichAccountActivities(activities, [], [], []),
    ACCOUNT,
    PERIOD,
    { generatedAt: "2026-09-22", ...options }
  );
}

const ACTIVITIES: AccountActivity[] = [
  {
    id: "t1",
    date: "2026-09-20",
    amount: 500,
    type: "debit",
    linkedTransferId: "tr1",
    isTransfer: true,
    counterpartyName: "ICICI Savings",
    runningBalance: 5500,
  },
  {
    id: "e1",
    date: "2026-09-15",
    amount: 1000,
    type: "debit",
    linkedExpenseId: "e1",
    category: "Food & Groceries",
    note: "Weekly groceries",
    runningBalance: 6000,
  },
  {
    id: "i1",
    date: "2026-09-10",
    amount: 3000,
    type: "credit",
    linkedIncomeId: "i1",
    source: "Salary",
    runningBalance: 7000,
  },
];

/** The data rows of the CSV's transaction block, as split cells. */
function csvTransactionRows(csv: string): string[][] {
  const lines = csv.split("\r\n");
  const header = lines.findIndex((line) => line.startsWith("Date,Time,"));
  return lines
    .slice(header + 1)
    .filter((line) => line.length > 0)
    .map((line) => line.split(","));
}

function csvSummaryValue(csv: string, label: string): string | undefined {
  const line = csv
    .split("\r\n")
    .find((candidate) => candidate.startsWith(`${label},`));
  return line?.slice(label.length + 1);
}

describe("statement CSV", () => {
  const statement = make(ACTIVITIES);
  const csv = statementToCsv(statement);

  it("carries the account, period, currency and timezone with the data", () => {
    expect(csv).toContain("HDFC Savings · HDFC Bank · ••4821");
    expect(csv).toContain("2026-09-01 to 2026-09-30");
    expect(csvSummaryValue(csv, "Currency")).toBe("INR");
    expect(csvSummaryValue(csv, "Timezone")).toBe("Asia/Kolkata");
  });

  it("uses CRLF line endings, as RFC-4180 asks", () => {
    expect(csv).toContain("\r\n");
    expect(csv.split("\r\n").length).toBeGreaterThan(5);
  });

  it("writes one data row per transaction, oldest first", () => {
    const rows = csvTransactionRows(csv);

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row[0])).toEqual([
      "2026-09-10",
      "2026-09-15",
      "2026-09-20",
    ]);
  });

  it("leaves the unused side of the ledger blank rather than writing zero", () => {
    const [creditRow, debitRow] = csvTransactionRows(csv);

    // Columns: date, time, description, type, category, counterparty, debit, credit, balance
    expect(creditRow[6]).toBe("");
    expect(creditRow[7]).toBe("3000");
    expect(debitRow[6]).toBe("1000");
    expect(debitRow[7]).toBe("");
  });

  it("escapes a description containing a comma", () => {
    const withComma = make([
      {
        id: "e2",
        date: "2026-09-12",
        amount: 200,
        type: "debit",
        linkedExpenseId: "e2",
        note: 'Coffee, milk and "eggs"',
        runningBalance: 6800,
      },
    ]);

    expect(statementToCsv(withComma)).toContain(
      '"Coffee, milk and ""eggs"""'
    );
  });

  it("records the notes so a caveat survives the export", () => {
    const empty = make([]);

    expect(statementToCsv(empty)).toContain("Note,No transactions were recorded");
  });
});

describe("statement HTML", () => {
  const statement = make(ACTIVITIES);
  const html = statementToHtml(statement);

  it("names the account, its period and its currency", () => {
    expect(html).toContain("HDFC Savings");
    expect(html).toContain("2026-09-01 to 2026-09-30");
    expect(html).toContain("All amounts in INR");
  });

  it("renders one table row per transaction", () => {
    const bodyRows = html.split("<tbody>")[1].split("</tbody>")[0];

    expect(bodyRows.match(/<tr>/g)).toHaveLength(3);
  });

  it("repeats the table header across printed pages", () => {
    expect(html).toContain("thead { display: table-header-group; }");
  });

  it("keeps a transaction row from splitting across a page break", () => {
    expect(html).toContain(".txns tr { page-break-inside: avoid; }");
  });

  it("escapes a description that contains markup", () => {
    const risky = make([
      {
        id: "e3",
        date: "2026-09-12",
        amount: 200,
        type: "debit",
        linkedExpenseId: "e3",
        note: "<script>alert(1)</script>",
        runningBalance: 6800,
      },
    ]);

    const rendered = statementToHtml(risky);
    expect(rendered).not.toContain("<script>alert(1)</script>");
    expect(rendered).toContain("&lt;script&gt;");
  });

  it("drops the balance column entirely for a credit card", () => {
    const card = statementToHtml(
      make(ACTIVITIES, { supportsRunningBalance: false })
    );

    expect(card).not.toContain(">Balance<");
    expect(card).toContain("liability");
  });

  it("says a period is empty instead of printing a bare table", () => {
    expect(statementToHtml(make([]))).toContain("No transactions in this period.");
  });
});

describe("export parity", () => {
  const statement = make(ACTIVITIES);
  const csv = statementToCsv(statement);
  const html = statementToHtml(statement);

  it("puts the same number of transactions in both formats", () => {
    const csvRows = csvTransactionRows(csv).length;
    const htmlRows =
      html.split("<tbody>")[1].split("</tbody>")[0].match(/<tr>/g)?.length ?? 0;

    expect(csvRows).toBe(statement.transactionCount);
    expect(htmlRows).toBe(statement.transactionCount);
  });

  it("reports the same totals in both formats", () => {
    // The CSV carries raw numbers; the HTML carries them formatted. Both must
    // trace back to the same statement figure.
    expect(csvSummaryValue(csv, "Money in")).toBe(String(statement.moneyIn));
    expect(csvSummaryValue(csv, "Closing balance")).toBe(
      String(statement.closingBalance)
    );
    expect(html).toContain("₹3,000.00");
    expect(html).toContain("₹5,500.00");
  });

  it("reconciles the opening and closing balances it prints", () => {
    const opening = Number(csvSummaryValue(csv, "Opening balance"));
    const closing = Number(csvSummaryValue(csv, "Closing balance"));
    const moneyIn = Number(csvSummaryValue(csv, "Money in"));
    const moneyOut = Number(csvSummaryValue(csv, "Money out"));

    expect(opening + moneyIn - moneyOut).toBeCloseTo(closing, 5);
  });

  it("omits both balances from both formats when neither can be stated", () => {
    const card = make(ACTIVITIES, { supportsRunningBalance: false });

    expect(csvSummaryValue(statementToCsv(card), "Closing balance")).toBeUndefined();
    expect(statementToHtml(card)).not.toContain("Closing balance");
  });
});

describe("statementFileName", () => {
  it("names the file after the account and the period it covers", () => {
    expect(statementFileName(make(ACTIVITIES), "pdf")).toBe(
      "HDFC-Savings-statement-2026-09-01-to-2026-09-30.pdf"
    );
  });

  it("strips characters a filesystem would reject", () => {
    const awkward = buildAccountStatement(
      [],
      { ...ACCOUNT, name: "Joint A/C: Ravi & Priya" },
      PERIOD,
      { generatedAt: "2026-09-22" }
    );

    expect(statementFileName(awkward, "csv")).toBe(
      "Joint-A-C-Ravi-Priya-statement-2026-09-01-to-2026-09-30.csv"
    );
  });
});
