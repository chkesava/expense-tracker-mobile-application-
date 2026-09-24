/**
 * SPENDLY-113 — rendering a `JournalReport` as CSV and as printable HTML.
 *
 * Both take the same report and only format it. Neither computes a figure, so
 * the spreadsheet and the PDF can never disagree about a total — the rule
 * `accountStatementExport` established and the reason the model exists at all.
 *
 * Both also re-assert the row count on entry. The model already guarantees it,
 * but a renderer is where rows go missing in practice — a slice added for
 * pagination, a branch capped at N — and a hand-built report from some future
 * caller would not have passed through the model's own check.
 */

import { csvField, csvNumber, csvRow, joinCsvLines } from "./csv";
import { formatAmount } from "./formatCurrency";
import {
  assertJournalReportComplete,
  type JournalReport,
  type JournalReportRow,
} from "./journalReport";
import type { JournalPeriodSummary } from "./journalPeriodSummary";

/* ------------------------------------------------------------------ *
 * CSV — for a spreadsheet
 * ------------------------------------------------------------------ */

/**
 * The grid.
 *
 * `Source` is separate from `Category` because income has no category by
 * design; overloading one column would make every income row read as blank.
 * `Account type` is here so `Card spent` can be reconciled from the grid
 * itself. `Flags` is what drove the refunds / investments / bills filters, so
 * a filtered export has to show why a row qualified. `ID` is what makes a row
 * traceable back — the Journal's search matches raw document ids.
 *
 * There is deliberately **no Counterparty column**. Journal rows have no other
 * side, so it would be a column of blanks, and a blank column invites someone
 * to fill it with the account name — the exact conflation the epic forbids.
 */
const COLUMNS = [
  "Date",
  "Time",
  "Type",
  "Description",
  "Category",
  "Subcategory",
  "Source",
  "Account",
  "Account type",
  "Debit",
  "Credit",
  "Currency",
  "Cumulative net cash movement",
  "Cumulative card spend",
  "Tags",
  "Status",
  "Flags",
  "ID",
] as const;

const FLAG_LABELS: Record<JournalReportRow["flags"][number], string> = {
  refund: "Refund",
  investment: "Investment",
  bill: "Bill",
};

function flagText(row: JournalReportRow): string {
  return row.flags.map((flag) => FLAG_LABELS[flag]).join("; ");
}

/**
 * The preamble.
 *
 * A bare grid of numbers opened months later cannot be checked against
 * anything: which view, which period, which filters, which currency and when
 * it was taken all have to travel with the data. A spreadsheet ignores the
 * leading lines happily enough.
 */
function preamble(report: JournalReport): string[] {
  const lines: string[] = [];

  lines.push(csvRow([report.title]));
  lines.push(csvRow(["Scope", report.scopeLabel]));
  lines.push(csvRow(["Period", report.period.label]));
  if (report.period.monthOverridden) {
    lines.push(csvRow(["Month filter", `${report.period.monthKey} (overridden by the date range)`]));
  } else if (report.period.monthKey) {
    lines.push(csvRow(["Month filter", report.period.monthKey]));
  }
  if (report.searchQuery) lines.push(csvRow(["Search", report.searchQuery]));
  if (report.appliedFilters.length === 0) {
    lines.push(csvRow(["Filters", "None"]));
  } else {
    for (const label of report.appliedFilters) lines.push(csvRow(["Filter", label]));
  }
  lines.push(csvRow(["Currency", report.currency]));
  if (report.timezone) lines.push(csvRow(["Timezone", report.timezone]));
  lines.push(csvRow(["Generated", report.generatedAt]));
  lines.push(csvRow(["Rows", report.rowCount]));
  // The file and the screen deliberately run in opposite directions; saying so
  // here is cheaper than letting someone discover it halfway down a reconcile.
  lines.push(csvRow(["Order", "Oldest first — the app lists them newest first"]));
  for (const note of report.notes) lines.push(csvRow(["Note", note]));

  return lines;
}

function summary(report: JournalReport): string[] {
  const { totals } = report;
  return [
    csvRow(["Summary"]),
    csvRow(["Transactions", totals.transactionCount]),
    csvRow(["Spent", totals.spent]),
    csvRow(["Of which on cards", totals.cardSpent]),
    csvRow(["Income", totals.income]),
    csvRow(["Net", totals.net]),
    csvRow(["Cash in", totals.cashIn]),
    csvRow(["Cash out", totals.cashOut]),
    csvRow(["Net cash movement", totals.netCash]),
  ];
}

export function journalReportToCsv(report: JournalReport): string {
  assertJournalReportComplete(report, report.rows.length);

  const lines: string[] = [
    ...preamble(report),
    "",
    ...summary(report),
    "",
    csvRow(["Transactions"]),
    csvRow([...COLUMNS]),
  ];

  for (const row of report.rows) {
    lines.push(
      csvRow([
        row.date,
        row.time ?? "",
        row.kind === "income" ? "Income" : "Expense",
        row.description,
        row.category ?? "",
        row.subcategory ?? "",
        row.source ?? "",
        row.accountName ?? "",
        row.accountTypeLabel,
        csvNumber(row.debit),
        csvNumber(row.credit),
        report.currency,
        csvNumber(row.cashFlowToDate),
        csvNumber(row.cardSpendToDate),
        row.tags.join("; "),
        row.status ?? "",
        flagText(row),
        row.id,
      ])
    );
  }

  return joinCsvLines(lines);
}

/* ------------------------------------------------------------------ *
 * HTML — for the PDF
 * ------------------------------------------------------------------ */

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(value: number | undefined, currency: string): string {
  if (value === undefined) return "";
  return escapeHtml(formatAmount(value, currency, { fixedDecimals: true }));
}

function summaryRow(label: string, value: number, currency: string, cls = ""): string {
  return `<tr${cls ? ` class="${cls}"` : ""}><td class="k">${escapeHtml(
    label
  )}</td><td class="v">${money(value, currency)}</td></tr>`;
}

function transactionRows(report: JournalReport): string {
  if (report.rows.length === 0) {
    return `<tr><td class="empty" colspan="5">No transactions in this view.</td></tr>`;
  }
  return report.rows
    .map((row) => {
      const detail = [
        row.kind === "income" ? row.source : row.category,
        row.subcategory,
        row.accountName,
        row.accountTypeLabel === "Credit card" ? "on card" : undefined,
        row.tags.join(", ") || undefined,
        flagText(row) || undefined,
      ]
        .filter(Boolean)
        .join(" · ");

      return `<tr>
  <td class="date">${escapeHtml(row.date)}${
    row.time ? `<span class="time">${escapeHtml(row.time)}</span>` : ""
  }</td>
  <td>${escapeHtml(row.description)}<span class="detail">${escapeHtml(detail)}</span></td>
  <td class="num debit">${money(row.debit, report.currency)}</td>
  <td class="num credit">${money(row.credit, report.currency)}</td>
  <td class="num flow">${money(row.cashFlowToDate, report.currency)}</td>
</tr>`;
    })
    .join("");
}

function periodLabel(period: JournalPeriodSummary): string {
  if (period.granularity === "month") return period.key;
  if (period.granularity === "week") return `Week of ${period.fromDate}`;
  return period.fromDate;
}

/**
 * The period breakdown exists only on the printed report.
 *
 * A four-hundred-row grid is unreadable on paper — the buckets are the reason
 * to print one at all. A spreadsheet user pivots instead, so the CSV omits it
 * rather than carrying a second set of numbers to keep in step.
 */
function periodTable(report: JournalReport): string {
  if (report.periods.length === 0) return "";
  const rows = report.periods
    .map(
      (period) => `<tr>
  <td>${escapeHtml(periodLabel(period))}</td>
  <td class="num">${period.transactionCount}</td>
  <td class="num debit">${money(period.spent, report.currency)}</td>
  <td class="num credit">${money(period.income, report.currency)}</td>
  <td class="num">${money(period.net, report.currency)}</td>
</tr>`
    )
    .join("");

  return `<h2>By period</h2>
  <table class="txns">
    <thead><tr>
      <th>Period</th><th class="num">Rows</th>
      <th class="num">Spent</th><th class="num">Income</th><th class="num">Net</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/**
 * A report someone can file, not a screenshot of the app.
 *
 * Notes print above the summary rather than below the transactions: a caveat
 * discovered on the last page, after the totals have been taken at face value,
 * is a caveat that has already misled the reader.
 *
 * Long views are expected — `thead` repeats on every printed page, rows do not
 * split across a page break, and the summary is kept whole.
 */
export function journalReportToHtml(report: JournalReport): string {
  assertJournalReportComplete(report, report.rows.length);

  const { currency, totals } = report;

  const notes = report.notes.length
    ? `<div class="note"><ul>${report.notes
        .map((note) => `<li>${escapeHtml(note)}</li>`)
        .join("")}</ul></div>`
    : "";

  const filters = report.appliedFilters.length
    ? `<p class="sub">Filters: ${report.appliedFilters
        .map((label) => `<span class="chip">${escapeHtml(label)}</span>`)
        .join(" ")}</p>`
    : `<p class="sub">No filters applied.</p>`;

  const search = report.searchQuery
    ? `<p class="sub">Search: <strong>${escapeHtml(report.searchQuery)}</strong></p>`
    : "";

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  @page { margin: 16mm 12mm; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
         color: #1e293b; font-size: 12px; }
  h1 { font-size: 20px; margin: 0 0 2px; color: #0f172a; }
  h2 { font-size: 13px; margin: 20px 0 6px; color: #0f172a; text-transform: uppercase;
       letter-spacing: 0.04em; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  .sub { color: #64748b; font-size: 12px; margin: 0 0 2px; }
  .chip { display: inline-block; background: #f1f5f9; border: 1px solid #e2e8f0;
          border-radius: 999px; padding: 1px 8px; margin: 0 2px 2px 0; color: #475569; }
  .note { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px;
          padding: 8px 12px; margin: 14px 0; color: #475569; }
  .note ul { margin: 0; padding-left: 18px; }
  .summary { page-break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; }
  .totals td { padding: 5px 8px; }
  .totals .k { color: #64748b; }
  .totals .v { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
  .totals .net td { border-top: 1px solid #cbd5e1; font-weight: 700; color: #0f172a; }
  .txns { margin-top: 4px; }
  .txns th { text-align: left; background: #f1f5f9; color: #475569; font-weight: 600;
             padding: 6px 8px; border-bottom: 1px solid #cbd5e1; }
  .txns td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  .txns tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .debit { color: #b91c1c; }
  .credit { color: #15803d; }
  .flow { color: #0f172a; font-weight: 600; }
  .date { white-space: nowrap; color: #475569; }
  .time { display: block; color: #94a3b8; font-size: 10px; }
  .detail { display: block; color: #94a3b8; font-size: 10px; }
  .empty { color: #94a3b8; font-style: italic; text-align: center; padding: 18px 8px; }
  .foot { margin-top: 22px; color: #94a3b8; font-size: 10px; }
</style></head>
<body>
  <h1>${escapeHtml(report.title)}</h1>
  <p class="sub">${escapeHtml(report.scopeLabel)} · <strong>${escapeHtml(
    report.period.label
  )}</strong></p>
  ${filters}
  ${search}
  <p class="sub">All amounts in ${escapeHtml(currency)}${
    report.timezone ? `, dated in ${escapeHtml(report.timezone)}` : ""
  }.</p>

  ${notes}

  <div class="summary">
  <h2>Summary</h2>
  <table class="totals">
    ${summaryRow("Spent", totals.spent, currency)}
    ${summaryRow("Of which on cards", totals.cardSpent, currency)}
    ${summaryRow("Income", totals.income, currency)}
    ${summaryRow("Net", totals.net, currency, "net")}
    ${summaryRow("Cash in", totals.cashIn, currency)}
    ${summaryRow("Cash out", totals.cashOut, currency)}
    ${summaryRow("Net cash movement", totals.netCash, currency, "net")}
  </table>
  <p class="sub">${report.rowCount} ${
    report.rowCount === 1 ? "transaction" : "transactions"
  }, oldest first.</p>
  </div>

  ${periodTable(report)}

  <h2>Transactions</h2>
  <table class="txns">
    <thead><tr>
      <th>Date</th><th>Description</th>
      <th class="num">Debit</th><th class="num">Credit</th>
      <th class="num">Cumulative cash movement</th>
    </tr></thead>
    <tbody>${transactionRows(report)}</tbody>
  </table>

  <p class="foot">Generated ${escapeHtml(
    report.generatedAt
  )} from your own recorded transactions.</p>
</body></html>`;
}

/* ------------------------------------------------------------------ *
 * File name
 * ------------------------------------------------------------------ */

function safe(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
}

/**
 * A name that says what it is without being opened — and that distinguishes
 * two exports of the same month taken with different filters, which would
 * otherwise overwrite each other in a downloads folder.
 */
export function journalReportFileName(
  report: JournalReport,
  extension: "csv" | "pdf"
): string {
  const { fromDate, toDate, openStart, openEnd } = report.period;

  let span: string;
  if (openStart && openEnd) span = "all-dates";
  else if (openStart) span = `to-${safe(toDate)}`;
  else if (openEnd) span = `from-${safe(fromDate)}`;
  else if (fromDate === toDate) span = safe(fromDate);
  else span = `${safe(fromDate)}-to-${safe(toDate)}`;

  const narrowed =
    report.appliedFilters.length > 0 || report.searchQuery ? "-filtered" : "";

  return `spendly-journal-${span}${narrowed}.${extension}`;
}
