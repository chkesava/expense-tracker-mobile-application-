/**
 * SPENDLY-291 — TDS reconciliation: the user's certificates against the TDS
 * their AIS or Form 26AS reports. Deterministic and explainable: the same
 * entries always give the same rows, and every row says which fields differ
 * and by how much.
 *
 * Sides
 *   - **Your records:** Form 16 (salary TDS) and TDS certificates (16A/16B/16C).
 *   - **Your statement:** AIS or 26AS lines that carry TDS. One statement is
 *     used, never both, because they report the same tax: 26AS when the year
 *     has any 26AS line, else AIS. TIS is a summary of AIS and is not used.
 *
 * Matching key: the deductor's TAN plus the section group. Salary is one group
 * whatever its section number (Form 16, or section 192 under the 1961 Act /
 * 392 under the 2025 Act, or an AIS "salary" line). Each side is summed per
 * key, so quarterly certificates meet the statement's yearly line. A line
 * without a TAN can't be matched and is shown as needing one.
 *
 * Amounts compare to the paisa. A difference the user accepts is stored as a
 * review (`reconciliation`, `confirm`) with the size of the difference; if the
 * difference later changes, the row asks again. Nothing is ever overwritten.
 */

import { maskIdentifier } from "@/shared/features/epf/utils";
import { roundMoney } from "@/shared/utils/money";
import type { FinancialYearKey, TaxEntry, TaxEntryOf, TaxReview, TaxStatement } from "../types";
import { normalizeTaxText } from "./dedupe";
import { taxReviewDocId } from "./ids";

export type TdsMatchState =
  | "matched"
  | "mismatch"
  | "missing_in_statement"
  | "missing_in_records"
  | "needs_tan"
  | "accepted"
  | "accepted_changed";

export interface TdsSide {
  tds: number;
  /** Income paid or credited; `null` when any line on this side doesn't say. */
  paid: number | null;
  entryIds: string[];
}

export interface TdsMatchRow {
  key: string;
  label: string;
  /** Masked for lists (last 4 shown); `null` when no line has a TAN. */
  tanMasked: string | null;
  group: string;
  groupLabel: string;
  mine: TdsSide | null;
  reported: TdsSide | null;
  state: TdsMatchState;
  /** reported − mine, when both sides exist. */
  tdsDifference: number | null;
  paidDifference: number | null;
  /** The review that accepted a difference, when there is one. */
  reviewId?: string;
}

export interface TdsReconciliation {
  fy: FinancialYearKey;
  /** The statement compared against; `null` when the year has no TDS lines from either. */
  statement: TaxStatement | null;
  rows: TdsMatchRow[];
  totals: { mine: number; reported: number };
  counts: Record<TdsMatchState, number>;
}

const SALARY_SECTIONS = new Set(["192", "392"]);

/** The section a user typed, as a comparable group (salary sections fold into one). */
export function tdsGroup(section: string | undefined, salary: boolean): string {
  if (salary) return "salary";
  const s = (section ?? "").toLowerCase().replace(/[\s.]/g, "");
  if (SALARY_SECTIONS.has(s)) return "salary";
  return s || "unspecified";
}

export function tdsGroupLabel(group: string): string {
  if (group === "salary") return "Salary";
  if (group === "unspecified") return "Section not given";
  return `Section ${group.toUpperCase()}`;
}

export function maskTan(tan: string | undefined): string | null {
  return tan ? maskIdentifier(tan, 4) : null;
}

type Line = { key: string; name: string; tan?: string; group: string; tds: number; paid: number | null; entryId: string };

function keyOf(tan: string | undefined, name: string, group: string): string {
  return tan ? `${tan.toUpperCase()}--${group}` : `name-${normalizeTaxText(name).replace(/ /g, "-") || "unknown"}--${group}`;
}

function recordLines(entries: readonly TaxEntry[]): Line[] {
  const lines: Line[] = [];
  for (const e of entries) {
    if (e.kind === "form16") {
      const f = (e as TaxEntryOf<"form16">).fields;
      const group = "salary";
      lines.push({ key: keyOf(f.tan, f.employerName, group), name: f.employerName, tan: f.tan, group, tds: f.tdsDeducted, paid: f.grossSalary, entryId: e.id });
    } else if (e.kind === "tds") {
      const f = (e as TaxEntryOf<"tds">).fields;
      const group = tdsGroup(f.section, false);
      lines.push({ key: keyOf(f.tan, f.deductorName, group), name: f.deductorName, tan: f.tan, group, tds: f.tdsAmount, paid: f.amountPaid, entryId: e.id });
    }
  }
  return lines;
}

/** AIS/26AS lines that report tax deducted. */
function statementLines(entries: readonly TaxEntry[], statement: TaxStatement): Line[] {
  const lines: Line[] = [];
  for (const e of entries) {
    if (e.kind !== "ais_value") continue;
    const f = (e as TaxEntryOf<"ais_value">).fields;
    if (f.statement !== statement) continue;
    const carriesTds = (f.tdsAmount ?? 0) > 0 || f.infoCategory === "tds";
    if (!carriesTds) continue;
    const group = tdsGroup(f.section, f.infoCategory === "salary");
    const name = f.sourceName ?? "";
    lines.push({
      key: keyOf(f.tan, name, group),
      name: name || "Deductor",
      tan: f.tan,
      group,
      // A "tds" line's own amount is the tax when it has no separate TDS field.
      tds: f.tdsAmount ?? (f.infoCategory === "tds" ? f.reportedAmount : 0),
      paid: f.infoCategory === "tds" && f.tdsAmount == null ? null : f.reportedAmount,
      entryId: e.id,
    });
  }
  return lines;
}

function sum(lines: Line[]): TdsSide | null {
  if (lines.length === 0) return null;
  const paid = lines.some((l) => l.paid === null) ? null : roundMoney(lines.reduce((s, l) => s + (l.paid ?? 0), 0));
  return {
    tds: roundMoney(lines.reduce((s, l) => s + l.tds, 0)),
    paid,
    entryIds: lines.map((l) => l.entryId).sort(),
  };
}

function same(a: number, b: number): boolean {
  return Math.abs(roundMoney(a) - roundMoney(b)) < 0.005;
}

/** The statement the year is reconciled against: 26AS if present, else AIS. */
export function reconciliationStatement(entries: readonly TaxEntry[]): TaxStatement | null {
  const statements = new Set(
    entries
      .filter((e): e is TaxEntryOf<"ais_value"> => e.kind === "ais_value")
      .map((e) => e.fields.statement)
  );
  if (statements.has("26AS")) return "26AS";
  if (statements.has("AIS")) return "AIS";
  return null;
}

export function reconcileTds(args: {
  fy: FinancialYearKey;
  entries: readonly TaxEntry[];
  reviews: readonly TaxReview[];
}): TdsReconciliation {
  const live = args.entries.filter((e) => e.fy === args.fy && !e.deletedAt);
  const statement = reconciliationStatement(live);
  const mine = recordLines(live);
  const reported = statement ? statementLines(live, statement) : [];
  const reviewById = new Map(args.reviews.filter((r) => r.fy === args.fy).map((r) => [r.id, r]));

  const keys = [...new Set([...mine, ...reported].map((l) => l.key))].sort();
  const rows: TdsMatchRow[] = keys.map((key) => {
    const m = mine.filter((l) => l.key === key);
    const r = reported.filter((l) => l.key === key);
    const any = [...m, ...r];
    const tan = any.find((l) => l.tan)?.tan;
    const group = any[0].group;
    const mineSide = sum(m);
    const reportedSide = sum(r);
    const row: TdsMatchRow = {
      key,
      label: (m[0] ?? r[0]).name,
      tanMasked: maskTan(tan),
      group,
      groupLabel: tdsGroupLabel(group),
      mine: mineSide,
      reported: reportedSide,
      state: "matched",
      tdsDifference: null,
      paidDifference: null,
    };
    if (!tan) return { ...row, state: "needs_tan" };
    if (!mineSide) return { ...row, state: "missing_in_records" };
    if (!reportedSide) return { ...row, state: "missing_in_statement" };

    const tdsDifference = roundMoney(reportedSide.tds - mineSide.tds);
    const paidDifference =
      mineSide.paid === null || reportedSide.paid === null ? null : roundMoney(reportedSide.paid - mineSide.paid);
    const agrees = same(tdsDifference, 0) && (paidDifference === null || same(paidDifference, 0));
    if (agrees) return { ...row, tdsDifference: 0, paidDifference };

    const reviewId = taxReviewDocId(args.fy, { kind: "reconciliation", id: key });
    const review = reviewById.get(reviewId);
    const accepted = review?.decision === "confirm";
    const state: TdsMatchState = !accepted
      ? "mismatch"
      : same(review.sourceAmount ?? -1, acceptedAmount(tdsDifference, paidDifference))
        ? "accepted"
        : "accepted_changed";
    return { ...row, state, tdsDifference, paidDifference, ...(accepted ? { reviewId } : {}) };
  });

  const counts = {
    matched: 0,
    mismatch: 0,
    missing_in_statement: 0,
    missing_in_records: 0,
    needs_tan: 0,
    accepted: 0,
    accepted_changed: 0,
  } as Record<TdsMatchState, number>;
  for (const row of rows) counts[row.state] += 1;

  return {
    fy: args.fy,
    statement,
    rows: rows.sort((a, b) => rank(a.state) - rank(b.state) || a.label.localeCompare(b.label) || a.key.localeCompare(b.key)),
    totals: {
      mine: roundMoney(mine.reduce((s, l) => s + l.tds, 0)),
      reported: roundMoney(reported.reduce((s, l) => s + l.tds, 0)),
    },
    counts,
  };
}

/**
 * The single number an acceptance records: the TDS difference if there is
 * one, else the amount-paid difference. Never negative (stored amounts are
 * 0 or more); its size is what must stay the same for the acceptance to hold.
 */
export function acceptedAmount(tdsDifference: number, paidDifference: number | null): number {
  return roundMoney(Math.abs(same(tdsDifference, 0) ? paidDifference ?? 0 : tdsDifference));
}

function rank(state: TdsMatchState): number {
  return ["mismatch", "accepted_changed", "missing_in_records", "missing_in_statement", "needs_tan", "accepted", "matched"].indexOf(state);
}

export function tdsStatePresentation(state: TdsMatchState, statement: TaxStatement | null): { label: string; tone: "success" | "warning" | "muted" | "primary" } {
  const where = statement ?? "statement";
  switch (state) {
    case "matched":
      return { label: "Matches", tone: "success" };
    case "accepted":
      return { label: "Difference accepted", tone: "primary" };
    case "accepted_changed":
      return { label: "Changed since you accepted", tone: "warning" };
    case "mismatch":
      return { label: "Doesn't match", tone: "warning" };
    case "missing_in_statement":
      return { label: `Not in your ${where}`, tone: "warning" };
    case "missing_in_records":
      return { label: "No certificate added", tone: "warning" };
    case "needs_tan":
      return { label: "Add the TAN to compare", tone: "muted" };
  }
}

export interface TaxRecordSummary {
  title: string;
  subtitle: string;
  /** The figure the row shows: tax deducted, or the amount reported. */
  amount: number | null;
  amountLabel: string;
}

/** How a TDS-screen record reads in a list. TANs are masked; amounts are as entered. */
export function tdsRecordSummary(entry: TaxEntry): TaxRecordSummary | null {
  const tan = (t?: string) => (t ? `TAN ${maskTan(t)}` : "No TAN");
  if (entry.kind === "form16") {
    const f = (entry as TaxEntryOf<"form16">).fields;
    return { title: f.employerName, subtitle: ["Form 16", tan(f.tan)].join(" · "), amount: f.tdsDeducted, amountLabel: "TDS" };
  }
  if (entry.kind === "tds") {
    const f = (entry as TaxEntryOf<"tds">).fields;
    const form = f.form === "other" ? "Certificate" : `Form ${f.form}`;
    return {
      title: f.deductorName,
      subtitle: [form, `Section ${f.section}`, f.quarter, tan(f.tan)].filter(Boolean).join(" · "),
      amount: f.tdsAmount,
      amountLabel: "TDS",
    };
  }
  if (entry.kind === "ais_value") {
    const f = (entry as TaxEntryOf<"ais_value">).fields;
    return {
      title: f.sourceName || "Statement line",
      subtitle: [f.statement, f.infoCategory.replace(/_/g, " "), f.section ? `Section ${f.section}` : null, tan(f.tan)].filter(Boolean).join(" · "),
      amount: f.tdsAmount ?? f.reportedAmount,
      amountLabel: f.tdsAmount != null ? "TDS" : "Reported",
    };
  }
  return null;
}
