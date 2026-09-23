import { formatAmount } from "./formatCurrency";
import type { AccountStatement, AccountStatementRow } from "./accountStatement";

/**
 * Rendering a statement as CSV and as printable HTML (SPENDLY-79).
 *
 * Both take the same `AccountStatement` and only format it — neither computes
 * a figure, so the spreadsheet and the PDF can never disagree about a total.
 */

/* ------------------------------------------------------------------ *
 * CSV — for a spreadsheet
 * ------------------------------------------------------------------ */

/** RFC-4180. */
function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function csvRow(cells: unknown[]): string {
  return cells.map(csvField).join(",");
}

/** Blank rather than 0: an empty cell says "not this side of the ledger". */
function money(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

function accountLine(statement: AccountStatement): string {
  const { name, institution, last4 } = statement.account;
  return [name, institution, last4 ? `••${last4}` : undefined]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Transaction-level CSV, carrying its own context.
 *
 * The preamble matters: a bare grid of numbers opened months later cannot be
 * checked against anything. Which account, which period, which currency and
 * which timezone all travel with the data, and a spreadsheet ignores the
 * leading lines happily enough.
 */
export function statementToCsv(statement: AccountStatement): string {
  const lines: string[] = [];

  lines.push(csvRow(["Account statement"]));
  lines.push(csvRow(["Account", accountLine(statement)]));
  lines.push(csvRow(["Type", statement.account.typeLabel]));
  lines.push(csvRow(["Period", statement.period.label]));
  lines.push(csvRow(["Currency", statement.account.currency]));
  if (statement.account.timezone) {
    lines.push(csvRow(["Timezone", statement.account.timezone]));
  }
  lines.push(csvRow(["Generated", statement.generatedAt]));
  for (const note of statement.notes) lines.push(csvRow(["Note", note]));
  lines.push("");

  lines.push(csvRow(["Summary"]));
  if (statement.openingBalance !== undefined) {
    lines.push(csvRow(["Opening balance", statement.openingBalance]));
  }
  lines.push(csvRow(["Money in", statement.moneyIn]));
  lines.push(csvRow(["Money out", statement.moneyOut]));
  lines.push(csvRow(["Income", statement.income]));
  lines.push(csvRow(["Expenses", statement.expenses]));
  lines.push(csvRow(["Transfers in", statement.transfersIn]));
  lines.push(csvRow(["Transfers out", statement.transfersOut]));
  lines.push(csvRow(["Net change", statement.netChange]));
  if (statement.closingBalance !== undefined) {
    lines.push(csvRow(["Closing balance", statement.closingBalance]));
  }
  lines.push(csvRow(["Transactions", statement.transactionCount]));
  lines.push(csvRow(["Transfers", statement.transferCount]));
  lines.push("");

  lines.push(csvRow(["Transactions"]));
  lines.push(
    csvRow([
      "Date",
      "Time",
      "Description",
      "Type",
      "Category",
      "Counterparty",
      "Debit",
      "Credit",
      "Balance",
    ])
  );
  for (const row of statement.rows) {
    lines.push(
      csvRow([
        row.date,
        row.time ?? "",
        row.description,
        row.subtype,
        row.category ?? "",
        row.counterparty ?? "",
        money(row.debit),
        money(row.credit),
        money(row.runningBalance),
      ])
    );
  }

  return lines.join("\r\n");
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

function amountCell(
  value: number | undefined,
  currency: string
): string {
  return value === undefined ? "" : escapeHtml(formatAmount(value, currency, {
    fixedDecimals: true,
  }));
}

function summaryRow(
  label: string,
  value: number | undefined,
  currency: string,
  className = ""
): string {
  if (value === undefined) return "";
  return `<tr${className ? ` class="${className}"` : ""}><td class="k">${escapeHtml(
    label
  )}</td><td class="v">${escapeHtml(
    formatAmount(value, currency, { fixedDecimals: true })
  )}</td></tr>`;
}

function transactionRows(
  rows: AccountStatementRow[],
  currency: string,
  showBalance: boolean
): string {
  if (rows.length === 0) {
    return `<tr><td class="empty" colspan="${
      showBalance ? 6 : 5
    }">No transactions in this period.</td></tr>`;
  }
  return rows
    .map((row) => {
      const detail = [row.subtype, row.category, row.counterparty]
        .filter(Boolean)
        .join(" · ");
      return `<tr>
  <td class="date">${escapeHtml(row.date)}${
    row.time ? `<span class="time">${escapeHtml(row.time)}</span>` : ""
  }</td>
  <td>${escapeHtml(row.description)}<span class="detail">${escapeHtml(detail)}</span></td>
  <td class="num debit">${amountCell(row.debit, currency)}</td>
  <td class="num credit">${amountCell(row.credit, currency)}</td>${
    showBalance
      ? `\n  <td class="num bal">${amountCell(row.runningBalance, currency)}</td>`
      : ""
  }
</tr>`;
    })
    .join("");
}

/**
 * A statement someone can file, not a screenshot of the app.
 *
 * Laid out the way a bank statement is read: who the account is, what period
 * it covers, what it opened at, what moved, what it closed at, and then the
 * postings behind it — oldest first, so the balance column accumulates in the
 * direction the reader's eye travels.
 *
 * Notes print above the summary rather than below the transactions. A caveat
 * discovered on the last page, after the totals have been taken at face value,
 * is a caveat that has already misled the reader.
 *
 * Long statements are expected: `thead` repeats on every printed page, rows do
 * not split across a page break, and the summary block is kept whole.
 */
export function statementToHtml(statement: AccountStatement): string {
  const currency = statement.account.currency;
  const showBalance = statement.supportsRunningBalance;

  const notes = statement.notes.length
    ? `<div class="note"><ul>${statement.notes
        .map((note) => `<li>${escapeHtml(note)}</li>`)
        .join("")}</ul></div>`
    : "";

  const subtitle = [
    statement.account.institution,
    statement.account.typeLabel,
    statement.account.last4 ? `••${statement.account.last4}` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

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
  .note { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px;
          padding: 8px 12px; margin: 14px 0; color: #475569; }
  .note ul { margin: 0; padding-left: 18px; }
  .summary { page-break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; }
  .totals td { padding: 5px 8px; }
  .totals .k { color: #64748b; }
  .totals .v { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
  .totals .closing td, .totals .opening td { border-top: 1px solid #cbd5e1; }
  .totals .closing td { font-weight: 700; color: #0f172a; }
  .txns { margin-top: 4px; }
  .txns th { text-align: left; background: #f1f5f9; color: #475569; font-weight: 600;
             padding: 6px 8px; border-bottom: 1px solid #cbd5e1; }
  .txns td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  .txns tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .debit { color: #b91c1c; }
  .credit { color: #15803d; }
  .bal { color: #0f172a; font-weight: 600; }
  .date { white-space: nowrap; color: #475569; }
  .time { display: block; color: #94a3b8; font-size: 10px; }
  .detail { display: block; color: #94a3b8; font-size: 10px; }
  .empty { color: #94a3b8; font-style: italic; text-align: center; padding: 18px 8px; }
  .foot { margin-top: 22px; color: #94a3b8; font-size: 10px; }
</style></head>
<body>
  <h1>${escapeHtml(statement.account.name)}</h1>
  ${subtitle ? `<p class="sub">${escapeHtml(subtitle)}</p>` : ""}
  <p class="sub">Statement period: <strong>${escapeHtml(
    statement.period.label
  )}</strong></p>
  <p class="sub">All amounts in ${escapeHtml(currency)}${
    statement.account.timezone
      ? `, dated in ${escapeHtml(statement.account.timezone)}`
      : ""
  }.</p>

  ${notes}

  <div class="summary">
  <h2>Summary</h2>
  <table class="totals">
    ${summaryRow("Opening balance", statement.openingBalance, currency, "opening")}
    ${summaryRow("Money in", statement.moneyIn, currency)}
    ${summaryRow("Money out", statement.moneyOut, currency)}
    ${summaryRow("Income", statement.income, currency)}
    ${summaryRow("Expenses", statement.expenses, currency)}
    ${summaryRow("Transfers in", statement.transfersIn, currency)}
    ${summaryRow("Transfers out", statement.transfersOut, currency)}
    ${summaryRow("Net change", statement.netChange, currency)}
    ${summaryRow("Closing balance", statement.closingBalance, currency, "closing")}
  </table>
  <p class="sub">${statement.transactionCount} ${
    statement.transactionCount === 1 ? "transaction" : "transactions"
  }, including ${statement.transferCount} ${
    statement.transferCount === 1 ? "transfer" : "transfers"
  }.</p>
  </div>

  <h2>Transactions</h2>
  <table class="txns">
    <thead><tr>
      <th>Date</th><th>Description</th>
      <th class="num">Debit</th><th class="num">Credit</th>${
        showBalance ? "<th class=\"num\">Balance</th>" : ""
      }
    </tr></thead>
    <tbody>${transactionRows(statement.rows, currency, showBalance)}</tbody>
  </table>

  <p class="foot">Generated ${escapeHtml(
    statement.generatedAt
  )} from your own recorded transactions.</p>
</body></html>`;
}

/** A filename that says what it is without being opened. */
export function statementFileName(
  statement: AccountStatement,
  extension: "csv" | "pdf"
): string {
  const safe = (value: string) =>
    value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  return `${safe(statement.account.name)}-statement-${safe(
    statement.period.fromDate
  )}-to-${safe(statement.period.toDate)}.${extension}`;
}
