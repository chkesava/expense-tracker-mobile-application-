/**
 * SPENDLY-611 — Save Goals CSV and PDF (HTML) exports (FRD FR-10), pure.
 *
 * The same rows the analytics screen computed from: goals filtered by status,
 * events filtered by the date range. Notes are included only when asked, and
 * money and dates use the formatters the caller passes (the user's currency
 * and date-format settings). Delivery lives in services/goals.
 */

import type { FinancialGoal } from "../types/expense";
import type { GoalEvent } from "../types/goal";
import { csvField, csvNumber, csvRow, joinCsvLines } from "./csv";
import type { GoalAnalytics } from "./goalAnalytics";
import { inRange } from "./goalAnalytics";
import { describeGoalEvent, fillAmounts, GOAL_REASON_LABELS } from "./goalHistory";
import { GOAL_STATUS_LABELS } from "./goalMessages";
import { goalProgress, goalStatus } from "./goalModel";

export type GoalExportInput = {
  title: string;
  rangeLabel: string;
  statusLabel: string;
  range: { fromMs: number; toMs: number };
  goals: readonly FinancialGoal[];
  events: readonly GoalEvent[];
  analytics: GoalAnalytics;
  includeNotes: boolean;
  /** True when the event list hit its safety cap; the export says so. */
  truncated: boolean;
  formatMoney: (n: number) => string;
  formatDate: (ms: number) => string;
  currency: string;
  generatedAtMs: number;
};

/** Events in range for goals in scope, oldest first (how a statement reads). */
export function exportEvents(input: Pick<GoalExportInput, "goals" | "events" | "range">): GoalEvent[] {
  const ids = new Set(input.goals.map((g) => g.id));
  return input.events
    .filter((e) => ids.has(e.goalId) && inRange(e, input.range))
    .sort((a, b) => a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id));
}

const AMOUNT_TYPES = new Set<GoalEvent["type"]>(["created", "contribution", "reduction", "correction", "reversal"]);

/**
 * Title and detail for an export row. For money entries the on-screen detail
 * is "reason · note", so it is NOT reused here: the reason has its own column
 * and the note appears only in the opt-in Note column.
 */
function eventText(e: GoalEvent, money: (n: number) => string): { title: string; detail: string } {
  const v = describeGoalEvent(e);
  if (AMOUNT_TYPES.has(e.type)) return { title: v.title, detail: e.correctionOf ? "Fixes an earlier entry" : "" };
  return { title: v.title, detail: v.detail ? fillAmounts(v.detail, v.amounts, money) : "" };
}

export function goalsToCsv(input: GoalExportInput): string {
  const names = new Map(input.goals.map((g) => [g.id, g.name]));
  const lines: string[] = [
    csvRow([input.title]),
    csvRow(["Period", input.rangeLabel]),
    csvRow(["Goals", input.statusLabel]),
    csvRow(["Currency", input.currency]),
    ...(input.truncated ? [csvRow(["Note", "History was limited to the most recent entries; totals cover the exported rows only."])] : []),
    "",
    csvRow(["Goal", "Status", "Target", "Saved", "Remaining", "Above target", "Target date"]),
    ...input.goals.map((g) => {
      const p = goalProgress(g);
      return [
        csvField(g.name),
        csvField(GOAL_STATUS_LABELS[goalStatus(g)]),
        csvNumber(p.target),
        csvNumber(p.saved),
        csvNumber(p.remaining),
        csvNumber(p.surplus),
        csvField(g.deadline ?? ""),
      ].join(",");
    }),
    "",
    csvRow(["Summary"]),
    ["Saved in period", csvNumber(input.analytics.increased)].join(","),
    ["Taken out in period", csvNumber(input.analytics.decreased)].join(","),
    ["Net growth", csvNumber(input.analytics.net)].join(","),
    csvRow(["Contributions", input.analytics.contributionCount]),
    csvRow(["Goals completed in period", input.analytics.completions]),
    csvRow(["Milestones reached in period", input.analytics.milestonesReached]),
    "",
    csvRow(["Date", "Goal", "Entry", "Amount", "Reason", "Details", ...(input.includeNotes ? ["Note"] : [])]),
    ...exportEvents(input).map((e) => {
      const t = eventText(e, input.formatMoney);
      return [
        csvField(input.formatDate(e.createdAtMs)),
        csvField(names.get(e.goalId) ?? ""),
        csvField(t.title),
        e.amountDelta ? csvNumber(e.amountDelta) : "",
        csvField(e.reason ? GOAL_REASON_LABELS[e.reason] : ""),
        csvField(t.detail),
        ...(input.includeNotes ? [csvField(e.note ?? "")] : []),
      ].join(",");
    }),
  ];
  return joinCsvLines(lines);
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function goalsToHtml(input: GoalExportInput): string {
  const m = input.formatMoney;
  const names = new Map(input.goals.map((g) => [g.id, g.name]));
  const a = input.analytics;
  const goalRows = input.goals
    .map((g) => {
      const p = goalProgress(g);
      return `<tr><td>${esc(g.name)}</td><td>${esc(GOAL_STATUS_LABELS[goalStatus(g)])}</td><td class="n">${esc(m(p.target))}</td><td class="n">${esc(m(p.saved))}</td><td class="n">${esc(m(p.remaining))}</td><td class="n">${p.surplus ? esc(m(p.surplus)) : ""}</td></tr>`;
    })
    .join("");
  const eventRows = exportEvents(input)
    .map((e) => {
      const t = eventText(e, m);
      const amount = e.amountDelta ? `${e.amountDelta > 0 ? "+" : "−"}${m(Math.abs(e.amountDelta))}` : "";
      return `<tr><td>${esc(input.formatDate(e.createdAtMs))}</td><td>${esc(names.get(e.goalId) ?? "")}</td><td>${esc(t.title)}${t.detail ? `<div class="d">${esc(t.detail)}</div>` : ""}${input.includeNotes && e.note ? `<div class="d">${esc(e.note)}</div>` : ""}</td><td>${esc(e.reason ? GOAL_REASON_LABELS[e.reason] : "")}</td><td class="n">${esc(amount)}</td></tr>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(input.title)}</title>
<style>
body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:24px;font-size:12px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:20px 0 8px}
.meta{color:#555;margin:0 0 2px}table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:6px 4px;border-bottom:1px solid #ddd;vertical-align:top}
th{font-size:11px;color:#555;text-transform:uppercase}.n{text-align:right;white-space:nowrap}.d{color:#666;font-size:11px}
.tiles{display:flex;gap:16px;flex-wrap:wrap}.tile{border:1px solid #ddd;border-radius:8px;padding:8px 12px}
.warn{color:#8a5a00}
</style></head><body>
<h1>${esc(input.title)}</h1>
<p class="meta">Period: ${esc(input.rangeLabel)} · Goals: ${esc(input.statusLabel)} · Generated ${esc(input.formatDate(input.generatedAtMs))}</p>
<p class="meta">Goal savings are manual records; they are not account balances or transactions.</p>
${input.truncated ? `<p class="warn">History was limited to the most recent entries; totals cover the rows shown.</p>` : ""}
<h2>Summary</h2>
<div class="tiles">
<div class="tile">Saved<br><b>${esc(m(a.increased))}</b></div>
<div class="tile">Taken out<br><b>${esc(m(a.decreased))}</b></div>
<div class="tile">Net growth<br><b>${esc(`${a.net < 0 ? "−" : ""}${m(Math.abs(a.net))}`)}</b></div>
<div class="tile">Contributions<br><b>${a.contributionCount}</b></div>
<div class="tile">Completed<br><b>${a.completions}</b></div>
<div class="tile">Milestones<br><b>${a.milestonesReached}</b></div>
</div>
<h2>Goals</h2>
<table><thead><tr><th>Goal</th><th>Status</th><th class="n">Target</th><th class="n">Saved</th><th class="n">Remaining</th><th class="n">Above target</th></tr></thead><tbody>${goalRows || `<tr><td colspan="6">No goals match these filters.</td></tr>`}</tbody></table>
<h2>History</h2>
<table><thead><tr><th>Date</th><th>Goal</th><th>Entry</th><th>Reason</th><th class="n">Amount</th></tr></thead><tbody>${eventRows || `<tr><td colspan="5">No entries in this period.</td></tr>`}</tbody></table>
</body></html>`;
}

export function goalExportFileName(rangeLabel: string, extension: "csv" | "pdf"): string {
  const slug = rangeLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "all";
  return `spendly-goals-${slug}.${extension}`;
}
