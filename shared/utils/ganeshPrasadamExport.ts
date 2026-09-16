import type {
  PrasadamEntry,
  PrasadamSession,
  PrasadamSessionSummary,
  PrasadamStatus,
  PrasadamUnitTotal,
} from "@/shared/types/ganeshPrasadam";
import {
  entriesForSession,
  formatPrasadamQuantity,
  prasadamDates,
  prasadamSessionLabel,
  prasadamTypeLabel,
  sortWithinSession,
  summarizePrasadamEntries,
} from "@/shared/utils/ganeshPrasadam";

/**
 * The prasadam register, as a printable document (KAN-126).
 *
 * Same split as `ganeshTokenLadduExport`: this module computes and formats, and
 * `ganeshReportDelivery` writes the file. Nothing here touches Firestore or the
 * filesystem, so ordering, totals and grouping are all testable without a
 * device.
 *
 * Two properties this document must have, and both are the ticket's:
 *
 * - **Every provider gets their own line.** Three people who brought prasadam
 *   on one morning are three rows, never one row saying "3 providers".
 * - **No grand total across units.** Quantities print per unit, because
 *   "5 kg + 30 pieces" has no single value. There is deliberately no line on
 *   this document that adds them together.
 */

export type PrasadamExportRow = {
  entryId: string;
  date: string;
  session: PrasadamSession;
  providerName: string;
  mobile: string;
  prasadamType: string;
  prasadamLabel: string;
  quantity: string;
  notes: string;
  status: PrasadamStatus;
};

export type PrasadamExportDay = {
  date: string;
  dayNumber?: number;
  morning: PrasadamSessionSummary & { rows: PrasadamExportRow[] };
  evening: PrasadamSessionSummary & { rows: PrasadamExportRow[] };
};

export type PrasadamExport = {
  pandalName: string;
  festivalName: string;
  festivalYear?: number;
  generatedAt: string;
  generatedBy: string;
  /** States which filter produced this document, when one did. */
  filterSummary?: string;
  totals: {
    days: number;
    entryCount: number;
    providerCount: number;
    cancelledCount: number;
    byUnit: PrasadamUnitTotal[];
  };
  days: PrasadamExportDay[];
};

const STATUS_LABEL: Record<PrasadamStatus, string> = {
  recorded: "Recorded",
  cancelled: "Cancelled",
};

function toRow(entry: PrasadamEntry): PrasadamExportRow {
  return {
    entryId: entry.id,
    date: entry.date,
    session: entry.session,
    providerName: entry.providerName ?? "",
    mobile: entry.mobile ?? "",
    prasadamType: prasadamTypeLabel(entry.prasadamType),
    prasadamLabel: entry.prasadamLabel ?? "",
    quantity: formatPrasadamQuantity(entry.quantity, entry.unit, entry.unitLabel),
    notes: entry.notes ?? "",
    status: entry.status === "cancelled" || entry.voided ? "cancelled" : "recorded",
  };
}

/**
 * Ordering is fixed: day ascending, morning before evening, and oldest entry
 * first within a session. Re-exporting after new entries arrive therefore
 * appends rather than reshuffling — the problem KAN-125 called out about its
 * own register.
 */
export function buildPrasadamExport(input: {
  pandalName: string;
  festivalName: string;
  festivalYear?: number;
  generatedAt: string;
  generatedBy: string;
  entries: readonly PrasadamEntry[];
  filterSummary?: string;
  /** Maps a date to its festival day number, when the festival has a window. */
  dayNumberOf?: (date: string) => number | undefined;
}): PrasadamExport {
  const dates = prasadamDates(input.entries);

  const days: PrasadamExportDay[] = dates.map((date) => {
    const build = (session: PrasadamSession) => {
      const forSession = sortWithinSession(
        entriesForSession(input.entries, date, session)
      );
      return {
        ...summarizePrasadamEntries(forSession),
        rows: forSession.map(toRow),
      };
    };
    return {
      date,
      dayNumber: input.dayNumberOf?.(date),
      morning: build("morning"),
      evening: build("evening"),
    };
  });

  // Totals are computed from the same entries the rows come from, so the
  // summary can never disagree with the lines beneath it.
  const all = [...input.entries];
  const totals = summarizePrasadamEntries(all);

  return {
    pandalName: input.pandalName,
    festivalName: input.festivalName,
    festivalYear: input.festivalYear,
    generatedAt: input.generatedAt,
    generatedBy: input.generatedBy,
    filterSummary: input.filterSummary,
    totals: {
      days: dates.length,
      entryCount: totals.entryCount,
      providerCount: totals.providerCount,
      cancelledCount: totals.cancelledCount,
      byUnit: totals.byUnit,
    },
    days,
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function unitLine(byUnit: PrasadamUnitTotal[]): string {
  if (byUnit.length === 0) return "—";
  return byUnit
    .map((total) => `${total.quantity} ${total.unitLabel ?? total.unit}`)
    .join(" · ");
}

function sessionBlock(
  label: string,
  block: PrasadamSessionSummary & { rows: PrasadamExportRow[] }
): string {
  if (block.rows.length === 0) {
    return `<p class="empty">${escapeHtml(label)} — nothing recorded.</p>`;
  }
  const rows = block.rows
    .map(
      (row) => `<tr>
      <td>${escapeHtml(row.providerName || "—")}</td>
      <td>${escapeHtml(row.mobile || "—")}</td>
      <td>${escapeHtml(row.prasadamLabel || row.prasadamType)}</td>
      <td class="num">${escapeHtml(row.quantity)}</td>
      <td>${escapeHtml(row.notes || "—")}</td>
      <td>${escapeHtml(STATUS_LABEL[row.status])}</td>
    </tr>`
    )
    .join("");

  return `<h3>${escapeHtml(label)} — ${block.providerCount} ${
    block.providerCount === 1 ? "provider" : "providers"
  }, ${block.entryCount} ${block.entryCount === 1 ? "entry" : "entries"}${
    block.byUnit.length ? ` (${escapeHtml(unitLine(block.byUnit))})` : ""
  }</h3>
  <table>
    <thead><tr>
      <th>Provider</th><th>Mobile</th><th>Prasadam</th>
      <th class="num">Quantity</th><th>Note</th><th>Status</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/** The register, as print-friendly HTML. */
export function prasadamToHtml(model: PrasadamExport): string {
  const title = model.festivalYear
    ? `${model.festivalName} ${model.festivalYear}`
    : model.festivalName;

  const body = model.days.length
    ? model.days
        .map(
          (day) => `<h2>${escapeHtml(day.date)}${
            day.dayNumber ? ` — Day ${day.dayNumber}` : ""
          }</h2>
  ${sessionBlock(prasadamSessionLabel("morning"), day.morning)}
  ${sessionBlock(prasadamSessionLabel("evening"), day.evening)}`
        )
        .join("")
    : `<p class="empty">No prasadam has been recorded yet.</p>`;

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  @page { margin: 16mm 12mm; }
  body { font-family: -apple-system, Roboto, sans-serif; color: #2b1a12; padding: 0; }
  h1 { font-size: 21px; margin: 0 0 2px; color: #7b2d12; }
  h2 { font-size: 15px; margin: 20px 0 8px; color: #7b2d12;
       border-bottom: 1px solid #e8d8c8; padding-bottom: 4px; }
  h3 { font-size: 12.5px; margin: 12px 0 4px; color: #6b5748; font-weight: 600; }
  .sub { color: #6b5748; font-size: 12.5px; margin: 0 0 2px; }
  .totals { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 6px; }
  .totals td { padding: 5px 8px; }
  .totals .k { color: #6b5748; }
  .totals .v { text-align: right; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; margin-top: 4px; }
  th { text-align: left; background: #faf3ec; padding: 6px 8px;
       border-bottom: 1px solid #e8d8c8; }
  td { padding: 5px 8px; border-bottom: 1px solid #f2e8de; vertical-align: top;
       word-wrap: break-word; }
  .num { text-align: right; white-space: nowrap; }
  /* The header repeats on every printed page, and a row never splits across a
     break — a full festival's register runs to several sheets. */
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  .empty { color: #8a7566; font-size: 12.5px; font-style: italic; }
  .foot { margin-top: 24px; color: #8a7566; font-size: 11px; }
</style></head>
<body>
  <h1>${escapeHtml(model.pandalName)}</h1>
  <p class="sub">${escapeHtml(title)} — prasadam register</p>
  ${model.filterSummary ? `<p class="sub">${escapeHtml(model.filterSummary)}</p>` : ""}

  <h2>Summary</h2>
  <table class="totals">
    <tr><td class="k">Days with prasadam</td><td class="v">${model.totals.days}</td></tr>
    <tr><td class="k">Providers</td><td class="v">${model.totals.providerCount}</td></tr>
    <tr><td class="k">Entries</td><td class="v">${model.totals.entryCount}</td></tr>
    <tr><td class="k">Cancelled</td><td class="v">${model.totals.cancelledCount}</td></tr>
    <tr><td class="k">Quantities</td>
        <td class="v">${escapeHtml(unitLine(model.totals.byUnit))}</td></tr>
  </table>

  ${body}

  <p class="foot">
    Generated ${escapeHtml(model.generatedAt)} by ${escapeHtml(model.generatedBy)}.
    Every provider is listed individually. Quantities are shown per unit and are
    never added across units.
  </p>
</body></html>`;
}

/** The register as CSV — one row per entry, and no totals row. */
export function prasadamToCsv(model: PrasadamExport): string {
  const head = [
    "Date",
    "Day",
    "Session",
    "Provider",
    "Mobile",
    "Kind",
    "Prasadam",
    "Quantity",
    "Status",
    "Note",
  ];
  const cell = (value: unknown) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const lines = [head.join(",")];
  for (const day of model.days) {
    for (const block of [day.morning, day.evening]) {
      for (const row of block.rows) {
        lines.push(
          [
            row.date,
            day.dayNumber ?? "",
            prasadamSessionLabel(row.session),
            row.providerName,
            row.mobile,
            row.prasadamType,
            row.prasadamLabel,
            row.quantity,
            STATUS_LABEL[row.status],
            row.notes,
          ]
            .map(cell)
            .join(",")
        );
      }
    }
  }
  // No totals row: one across mixed units would be either wrong or empty.
  return lines.join("\n");
}

/** A filename that says what it is without being opened. */
export function prasadamFileName(model: PrasadamExport, extension = "pdf"): string {
  const safe = (value: string) =>
    value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  const stamp = model.generatedAt.slice(0, 10);
  return `${safe(model.pandalName)}-prasadam-${stamp}.${extension}`;
}

/** Exported for the on-screen preview, so preview and file cannot diverge. */
export function prasadamExportRows(model: PrasadamExport): PrasadamExportRow[] {
  const out: PrasadamExportRow[] = [];
  for (const day of model.days) {
    out.push(...day.morning.rows, ...day.evening.rows);
  }
  return out;
}
