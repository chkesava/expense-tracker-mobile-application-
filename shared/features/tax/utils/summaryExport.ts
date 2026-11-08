/**
 * SPENDLY-710 — the year's tax-readiness summary as a document the user can
 * review or hand to a tax professional (CSV and PDF via HTML). Pure.
 *
 * Three sections, never mixed:
 *   1. Facts: what was recorded, each with where it came from (Spendly, the
 *      user, Form 16, a certificate, a challan, a statement).
 *   2. Calculations: what Spendly worked out (capital gains, the estimate in
 *      both regimes, step by step), each with the rule version and the
 *      assumptions behind it.
 *   3. Unresolved: everything still open or put off, and why there may be no
 *      estimate. A partial year says so at the top.
 *
 * Identifiers: a TAN only ever appears masked; a PAN is never stored, so it
 * can't appear. The document never says the return is ready to file.
 */

import { csvField, csvNumber, csvRow, joinCsvLines } from "@/shared/utils/csv";
import type { FinancialYearKey } from "../types";
import type { TaxComputation } from "./computeTax";
import type { TaxRegimeComparison } from "./compareRegimes";
import { assumptionText, comparisonSentence, ESTIMATE_DISCLAIMER, estimateStatusLabel, gapText } from "./estimatePresentation";
import type { ChecklistItem, TaxReadiness } from "./readiness";
import type { TaxEstimateInput, TaxTrace } from "./taxInput";
import { taxYearLabel } from "./taxYear";

export interface SummaryFact {
  group: string;
  item: string;
  label: string;
  source: string;
  amount: number;
}

export interface SummaryCalculation {
  group: string;
  label: string;
  basis: string;
  amount: number | null;
}

export interface SummaryUnresolved {
  section: string;
  title: string;
  detail: string;
  /** "Needed" (required), "Worth a look" or "Put off". */
  priority: string;
}

export interface TaxSummaryDocument {
  fy: FinancialYearKey;
  title: string;
  yearLabel: string;
  status: string;
  disclaimer: string;
  generatedAtMs: number;
  ruleVersion: string | null;
  facts: SummaryFact[];
  calculations: SummaryCalculation[];
  assumptions: { regime: string; text: string }[];
  comparison: string | null;
  unresolved: SummaryUnresolved[];
}

const ORIGIN_LABELS: Record<TaxTrace["origin"], string> = {
  spendly: "Spendly records",
  you: "Added by you",
  form16: "Form 16",
  certificate: "TDS certificate",
  challan: "Challan",
  statement: "Broker or registrar statement",
};

/** Trace key → where it sits in the summary. Capital gains are calculated, so they aren't facts. */
const FACT_GROUPS: { prefix: string; group: string; item: string }[] = [
  { prefix: "salary.gross", group: "Income", item: "Salary and pension (gross)" },
  { prefix: "salary.exemptAllowances", group: "Income", item: "Exempt allowances" },
  { prefix: "salary.professionalTax", group: "Income", item: "Professional tax" },
  { prefix: "rent", group: "Income", item: "Rent received" },
  { prefix: "otherSources.savingsInterest", group: "Income", item: "Savings interest" },
  { prefix: "otherSources.depositInterest", group: "Income", item: "Deposit interest" },
  { prefix: "otherSources.dividends", group: "Income", item: "Dividends" },
  { prefix: "otherSources.other", group: "Income", item: "Other income" },
  { prefix: "salary.hraExemption", group: "Deductions and exemptions", item: "HRA exemption" },
  { prefix: "homeLoanInterest", group: "Deductions and exemptions", item: "Home loan interest" },
  { prefix: "savingsInterestClaim", group: "Deductions and exemptions", item: "Savings interest claim" },
  { prefix: "deductions.", group: "Deductions and exemptions", item: "" },
  { prefix: "taxesPaid.tds", group: "Tax paid", item: "TDS" },
  { prefix: "taxesPaid.advanceTax", group: "Tax paid", item: "Advance tax" },
  { prefix: "taxesPaid.selfAssessment", group: "Tax paid", item: "Self-assessment tax" },
  { prefix: "taxesPaid.other", group: "Tax paid", item: "Other tax paid" },
];

const CG_LABELS: Record<string, string> = {
  "capitalGains.stcg111a": "Short-term gains on equity (s.111A)",
  "capitalGains.stcgSlab": "Short-term gains at slab rates",
  "capitalGains.ltcg112a": "Long-term gains on equity (s.112A)",
  "capitalGains.ltcg112": "Other long-term gains (s.112)",
};

const SECTION_LABELS: Record<string, string> = {
  profile: "Your details",
  income: "Income",
  tds: "TDS & Form 16",
  deductions: "Deductions",
  "capital-gains": "Capital gains",
  payments: "Tax payments",
  estimate: "Tax estimate",
};

function factsOf(input: TaxEstimateInput): SummaryFact[] {
  const facts: SummaryFact[] = [];
  for (const g of FACT_GROUPS) {
    const keys = Object.keys(input.traces)
      .filter((k) => (g.prefix.endsWith(".") ? k.startsWith(g.prefix) : k === g.prefix))
      .sort();
    for (const key of keys) {
      const item = g.item || key.slice(g.prefix.length).replace(/_/g, " ");
      for (const t of input.traces[key]) {
        facts.push({ group: g.group, item, label: t.label, source: ORIGIN_LABELS[t.origin], amount: t.amount });
      }
    }
  }
  return facts;
}

function regimeCalculations(c: TaxComputation): SummaryCalculation[] {
  const group = c.regime === "new" ? "New regime" : "Old regime";
  if (c.liability === null) {
    return [{ group, label: estimateStatusLabel(c).label, basis: [...c.unsupported, ...c.missing].map((code) => gapText(code).text).join(" "), amount: null }];
  }
  return c.steps.map((s) => ({ group, label: s.label, basis: s.basis ?? "", amount: s.amount }));
}

function unresolvedOf(readiness: TaxReadiness): SummaryUnresolved[] {
  const priority = (i: ChecklistItem) => (i.state === "deferred" ? "Put off" : i.required ? "Needed" : "Worth a look");
  const order = { Needed: 0, "Put off": 1, "Worth a look": 2 } as Record<string, number>;
  return readiness.items
    .filter((i) => i.state !== "resolved")
    .map((i) => ({ section: SECTION_LABELS[i.section] ?? i.section, title: i.title, detail: i.detail, priority: priority(i) }))
    .sort((a, b) => order[a.priority] - order[b.priority] || a.section.localeCompare(b.section) || a.title.localeCompare(b.title));
}

export function buildTaxSummary(args: {
  fy: FinancialYearKey;
  input: TaxEstimateInput;
  comparison: TaxRegimeComparison;
  readiness: TaxReadiness;
  generatedAtMs: number;
  formatMoney: (n: number) => string;
}): TaxSummaryDocument {
  const { input, comparison, readiness } = args;
  const open = readiness.items.filter((i) => i.state !== "resolved");
  const required = open.filter((i) => i.required).length;
  const status =
    readiness.label === "ready_to_review"
      ? "Ready to review: nothing required is open. Not a filed return."
      : `Not ready: ${required} required item${required === 1 ? "" : "s"} open, ${open.length} item${open.length === 1 ? "" : "s"} in total. See "Unresolved".`;
  const cg = Object.keys(CG_LABELS)
    .flatMap((key) => (input.traces[key] ?? []).map((t) => ({ group: "Capital gains (calculated)", label: CG_LABELS[key], basis: `${t.label} · ${ORIGIN_LABELS[t.origin]}`, amount: t.amount })));
  const assumptions = (["new", "old"] as const).flatMap((r) => comparison[r].assumptions.map((a) => ({ regime: r === "new" ? "New regime" : "Old regime", text: assumptionText(a) })));
  return {
    fy: args.fy,
    title: "Tax readiness summary",
    yearLabel: taxYearLabel(args.fy, "long"),
    status,
    disclaimer: ESTIMATE_DISCLAIMER,
    generatedAtMs: args.generatedAtMs,
    ruleVersion: comparison.ruleVersion,
    facts: factsOf(input),
    calculations: [...cg, ...regimeCalculations(comparison.new), ...regimeCalculations(comparison.old)],
    assumptions,
    comparison: comparisonSentence(comparison, args.formatMoney),
    unresolved: unresolvedOf(readiness),
  };
}

export function taxSummaryFileName(fy: FinancialYearKey, ext: "csv" | "pdf"): string {
  return `spendly-tax-summary-${fy}.${ext}`;
}

export function taxSummaryToCsv(doc: TaxSummaryDocument, formatDate: (ms: number) => string): string {
  const lines: string[] = [
    csvRow([doc.title]),
    csvRow([doc.yearLabel]),
    csvRow([`Generated ${formatDate(doc.generatedAtMs)}`]),
    csvRow([doc.status]),
    csvRow([doc.disclaimer]),
    "",
    csvRow(["1. Facts (recorded, with their source)"]),
    csvRow(["Group", "Item", "Record", "Source", "Amount"]),
    ...doc.facts.map((f) => [csvField(f.group), csvField(f.item), csvField(f.label), csvField(f.source), csvNumber(f.amount)].join(",")),
    ...(doc.facts.length === 0 ? [csvRow(["No facts recorded for this year."])] : []),
    "",
    csvRow([`2. Calculations (by Spendly, rules ${doc.ruleVersion ?? "not available for this year"})`]),
    csvRow(["Group", "Step", "Basis", "Amount"]),
    ...doc.calculations.map((c) => [csvField(c.group), csvField(c.label), csvField(c.basis), csvNumber(c.amount)].join(",")),
    ...(doc.comparison ? [csvRow(["Comparison", doc.comparison])] : []),
    "",
    csvRow(["Assumptions"]),
    csvRow(["Regime", "Assumption"]),
    ...doc.assumptions.map((a) => csvRow([a.regime, a.text])),
    "",
    csvRow(["3. Unresolved"]),
    csvRow(["Priority", "Section", "Item", "Detail"]),
    ...doc.unresolved.map((u) => csvRow([u.priority, u.section, u.title, u.detail])),
    ...(doc.unresolved.length === 0 ? [csvRow(["Nothing open."])] : []),
  ];
  return joinCsvLines(lines);
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function taxSummaryToHtml(doc: TaxSummaryDocument, formatMoney: (n: number) => string, formatDate: (ms: number) => string): string {
  const money = (n: number | null) => (n === null ? "—" : `${n < 0 ? "−" : ""}${formatMoney(Math.abs(n))}`);
  const factRows = doc.facts
    .map((f) => `<tr><td>${esc(f.group)}</td><td>${esc(f.item)}</td><td>${esc(f.label)}</td><td>${esc(f.source)}</td><td class="n">${esc(money(f.amount))}</td></tr>`)
    .join("");
  const calcRows = doc.calculations
    .map((c) => `<tr><td>${esc(c.group)}</td><td>${esc(c.label)}${c.basis ? `<div class="d">${esc(c.basis)}</div>` : ""}</td><td class="n">${esc(money(c.amount))}</td></tr>`)
    .join("");
  const assumptionRows = doc.assumptions.map((a) => `<li>${esc(a.regime)}: ${esc(a.text)}</li>`).join("");
  const openRows = doc.unresolved
    .map((u) => `<tr><td class="${u.priority === "Needed" ? "warn" : ""}">${esc(u.priority)}</td><td>${esc(u.section)}</td><td>${esc(u.title)}<div class="d">${esc(u.detail)}</div></td></tr>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.title)}</title>
<style>
body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:24px;font-size:12px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:22px 0 8px}
.meta{color:#555;margin:0 0 2px}.status{font-weight:600;margin:8px 0}.note{color:#555;border-left:3px solid #ccc;padding-left:8px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:6px 4px;border-bottom:1px solid #ddd;vertical-align:top}
th{font-size:11px;color:#555;text-transform:uppercase}.n{text-align:right;white-space:nowrap}.d{color:#666;font-size:11px}.warn{color:#8a5a00;font-weight:600}
</style></head><body>
<h1>${esc(doc.title)}</h1>
<p class="meta">${esc(doc.yearLabel)} · Generated ${esc(formatDate(doc.generatedAtMs))} · Rules ${esc(doc.ruleVersion ?? "not available for this year")}</p>
<p class="status">${esc(doc.status)}</p>
<p class="note">${esc(doc.disclaimer)}</p>
<h2>1. Facts</h2>
<p class="meta">What was recorded, and where each figure came from.</p>
<table><thead><tr><th>Group</th><th>Item</th><th>Record</th><th>Source</th><th class="n">Amount</th></tr></thead><tbody>${factRows || `<tr><td colspan="5">No facts recorded for this year.</td></tr>`}</tbody></table>
<h2>2. Calculations</h2>
<p class="meta">Worked out by Spendly from the facts above. Informational estimate.</p>
<table><thead><tr><th>Group</th><th>Step</th><th class="n">Amount</th></tr></thead><tbody>${calcRows}</tbody></table>
${doc.comparison ? `<p class="meta">${esc(doc.comparison)}</p>` : ""}
${assumptionRows ? `<h2>Assumptions</h2><ul>${assumptionRows}</ul>` : ""}
<h2>3. Unresolved</h2>
<table><thead><tr><th>Priority</th><th>Section</th><th>Item</th></tr></thead><tbody>${openRows || `<tr><td colspan="3">Nothing open.</td></tr>`}</tbody></table>
</body></html>`;
}
