import type {
  TokenLadduToken,
  TokenLadduTokenStatus,
} from "@/shared/types/ganeshTokenLaddu";
import { money } from "@/shared/utils/ganeshMath";
import type { TokenCapacity } from "@/shared/utils/ganeshTokenLaddu";

/**
 * The Token Laddu register, as a printable document (KAN-125).
 *
 * Same split as `ganeshReportExport`: this module computes and formats, and
 * `ganeshReportDelivery` writes the file. Nothing here touches Firestore or the
 * filesystem, so the parts worth testing — ordering, totals, status — are
 * testable without a device.
 *
 * The document this produces is a register a committee can hold up at the
 * draw: every individual token, in one fixed order, with the receipt and the
 * person it belongs to on the same line.
 */

export type TokenLadduExportRow = {
  tokenId: string;
  tokenNumber: number;
  status: TokenLadduTokenStatus;
  participantName: string;
  mobile: string;
  receiptNumberPhysical: string;
  date: string;
  amount: number;
  paymentMethod: string;
};

export type TokenLadduExport = {
  pandalName: string;
  festivalName: string;
  festivalYear?: number;
  generatedAt: string;
  generatedBy: string;
  totals: {
    configured: number;
    registered: number;
    remaining: number;
    eligible: number;
    winners: number;
    cancelled: number;
    amount: number;
  };
  rows: TokenLadduExportRow[];
};

const STATUS_LABEL: Record<TokenLadduTokenStatus, string> = {
  eligible: "In the draw",
  winner: "Winner",
  cancelled: "Cancelled",
};

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  bank: "Bank",
  other: "Other",
};

/**
 * Builds the export model.
 *
 * Ordered by token number, always. KAN-125 asks for a stable order, and the
 * number is the only one that survives a re-export after new tokens are sold —
 * ordering by registration time would reshuffle the page a committee may
 * already have printed.
 *
 * Totals come from the rows rather than the config counters, so the figure at
 * the top of the page always agrees with the lines beneath it.
 */
export function buildTokenLadduExport(input: {
  pandalName: string;
  festivalName: string;
  festivalYear?: number;
  generatedAt: string;
  generatedBy: string;
  tokens: readonly TokenLadduToken[];
  capacity: TokenCapacity;
}): TokenLadduExport {
  const rows: TokenLadduExportRow[] = [...input.tokens]
    .sort((a, b) => a.tokenNumber - b.tokenNumber)
    .map((token) => ({
      tokenId: token.id,
      tokenNumber: token.tokenNumber,
      status: token.status,
      participantName: token.participantName ?? "",
      mobile: token.mobile ?? "",
      receiptNumberPhysical: token.receiptNumberPhysical ?? "",
      date: token.date ?? "",
      amount: Number(token.amount ?? 0),
      paymentMethod: METHOD_LABEL[token.paymentMethod ?? "other"] ?? "Other",
    }));

  return {
    pandalName: input.pandalName,
    festivalName: input.festivalName,
    festivalYear: input.festivalYear,
    generatedAt: input.generatedAt,
    generatedBy: input.generatedBy,
    totals: {
      configured: input.capacity.total,
      registered: rows.length,
      remaining: Math.max(0, input.capacity.total - rows.length),
      eligible: rows.filter((row) => row.status === "eligible").length,
      winners: rows.filter((row) => row.status === "winner").length,
      cancelled: rows.filter((row) => row.status === "cancelled").length,
      // Cancelled tokens are counted in the money, because the cash was taken.
      // Reversing it is the ledger's job, not this document's.
      amount: money(rows.reduce((sum, row) => sum + row.amount, 0)),
    },
    rows,
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Matches the financial report's formatting so the two documents look alike. */
function inr(value: number): string {
  const rounded = Math.round(Number(value ?? 0) * 100) / 100;
  return `₹${rounded.toLocaleString("en-IN")}`;
}

/**
 * The register, as print-friendly HTML.
 *
 * Three details carry the multi-page requirement, and all three are CSS rather
 * than logic: the header row repeats on every sheet (`table-header-group`), a
 * row never splits across a page break, and the columns are sized so a long
 * name wraps instead of truncating. A register whose header appears only on
 * page one is unreadable by page four, which is where a real pot of 500 lands.
 */
export function tokenLadduToHtml(model: TokenLadduExport): string {
  const title = model.festivalYear
    ? `${model.festivalName} ${model.festivalYear}`
    : model.festivalName;

  const rows = model.rows.length
    ? model.rows
        .map(
          (row) => `<tr>
      <td class="code">${escapeHtml(row.tokenId)}</td>
      <td>${escapeHtml(row.receiptNumberPhysical || "—")}</td>
      <td>${escapeHtml(row.participantName || "—")}</td>
      <td>${escapeHtml(row.mobile || "—")}</td>
      <td>${escapeHtml(row.date || "—")}</td>
      <td class="num">${inr(row.amount)}</td>
      <td>${escapeHtml(row.paymentMethod)}</td>
      <td>${escapeHtml(STATUS_LABEL[row.status] ?? row.status)}</td>
    </tr>`
        )
        .join("")
    : "";

  const body = model.rows.length
    ? `<table>
    <thead><tr>
      <th>Token</th><th>Receipt</th><th>Name</th><th>Mobile</th>
      <th>Date</th><th class="num">Amount</th><th>Payment</th><th>Status</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`
    : `<p class="empty">No Token Laddus have been registered yet.</p>`;

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  @page { margin: 16mm 12mm; }
  body { font-family: -apple-system, Roboto, sans-serif; color: #2b1a12; padding: 0; }
  h1 { font-size: 21px; margin: 0 0 2px; color: #7b2d12; }
  h2 { font-size: 15px; margin: 20px 0 8px; color: #7b2d12;
       border-bottom: 1px solid #e8d8c8; padding-bottom: 4px; }
  .sub { color: #6b5748; font-size: 12.5px; margin: 0 0 2px; }
  .totals { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 6px; }
  .totals td { padding: 5px 8px; }
  .totals .k { color: #6b5748; }
  .totals .v { text-align: right; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; margin-top: 6px; }
  th { text-align: left; background: #faf3ec; padding: 6px 8px;
       border-bottom: 1px solid #e8d8c8; }
  td { padding: 5px 8px; border-bottom: 1px solid #f2e8de; vertical-align: top;
       word-wrap: break-word; }
  .code { font-weight: 600; white-space: nowrap; }
  .num { text-align: right; white-space: nowrap; }
  /* The header repeats on every printed page, and a row never splits across
     a break — a 500-token register runs to several sheets. */
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  .empty { color: #8a7566; font-size: 12.5px; font-style: italic; }
  .foot { margin-top: 24px; color: #8a7566; font-size: 11px; }
</style></head>
<body>
  <h1>${escapeHtml(model.pandalName)}</h1>
  <p class="sub">${escapeHtml(title)} — Token Laddu register</p>

  <h2>Summary</h2>
  <table class="totals">
    <tr><td class="k">Token Laddus set up</td>
        <td class="v">${model.totals.configured}</td></tr>
    <tr><td class="k">Registered</td><td class="v">${model.totals.registered}</td></tr>
    <tr><td class="k">Left to register</td><td class="v">${model.totals.remaining}</td></tr>
    <tr><td class="k">In the draw</td><td class="v">${model.totals.eligible}</td></tr>
    <tr><td class="k">Winners</td><td class="v">${model.totals.winners}</td></tr>
    <tr><td class="k">Cancelled</td><td class="v">${model.totals.cancelled}</td></tr>
    <tr><td class="k"><strong>Total collected</strong></td>
        <td class="v">${inr(model.totals.amount)}</td></tr>
  </table>

  <h2>Token Laddus</h2>
  ${body}

  <p class="foot">
    Generated ${escapeHtml(model.generatedAt)} by ${escapeHtml(model.generatedBy)}.
    Every Token Laddu is listed individually; one receipt may cover several.
  </p>
</body></html>`;
}

/** A filename that says what it is without being opened. */
export function tokenLadduFileName(model: TokenLadduExport): string {
  const safe = (value: string) => value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  const stamp = model.generatedAt.slice(0, 10);
  return `${safe(model.pandalName)}-token-laddu-${stamp}.pdf`;
}
