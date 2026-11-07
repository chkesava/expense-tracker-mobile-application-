/**
 * SPENDLY-295 — the figures an estimate is computed from, gathered from the
 * year's resolved tax data (income, Form 16, TDS, deductions, capital gains,
 * payments, profile). Pure; nothing here reads or writes.
 *
 * Only what is counted goes in, and each figure keeps the list of items it
 * came from (`traces`). What can't be estimated is never filled in:
 *   - `unsupported`: Spendly doesn't compute this case; no estimate.
 *   - `missing`: a counted figure is unknown; no estimate until it's known.
 *   - `pending`: items not counted yet or worth checking; the estimate is
 *     shown as partial, with these listed.
 */

import { roundMoney } from "@/shared/utils/money";
import type {
  FinancialYearKey,
  TaxAgeBand,
  TaxEntry,
  TaxEntryOf,
  TaxLine,
  TaxProfile,
  TaxResidentialStatus,
} from "../types";
import type { TaxCapitalGainsSummary } from "./capitalGains";
import type { TaxDeductionSummary } from "./deductions";
import type { TaxIncomeSummary } from "./income";
import { summarizeTaxPayments } from "./payments";

export type TaxGapCode =
  // unsupported
  | "residency"
  | "business_income"
  | "capital_gain_as_income"
  | "virtual_digital_assets"
  | "property_indexation"
  | "capital_loss_setoff"
  // missing
  | "income_months_not_loaded"
  | "income_value_unknown"
  | "deduction_value_unknown"
  | "capital_gain_cost_unknown"
  | "capital_gain_term_unknown"
  // pending
  | "profile_residency"
  | "profile_age"
  | "income_to_confirm"
  | "income_needs_review"
  | "income_overlap"
  | "salary_twice"
  | "deductions_to_confirm"
  | "deduction_overlap"
  | "capital_gains_to_confirm"
  | "capital_gains_check"
  | "no_salary_record";

export interface TaxTrace {
  label: string;
  amount: number;
  origin: "spendly" | "you" | "form16" | "certificate" | "challan" | "statement";
}

export interface TaxEstimateInput {
  fy: FinancialYearKey;
  /** As the profile says; `unknown` is estimated as resident (an assumption, listed). */
  residentialStatus: TaxResidentialStatus;
  ageBand: TaxAgeBand;
  salary: { gross: number; exemptAllowances: number; hraExemption: number; professionalTax: number };
  rent: number;
  homeLoanInterest: number;
  otherSources: { savingsInterest: number; depositInterest: number; dividends: number; other: number };
  capitalGains: { stcg111a: number; stcgSlab: number; ltcg112: number; ltcg112a: number };
  /** Counted claims by deduction catalog id (HRA, home-loan interest and savings interest are fields above / below). */
  deductions: Record<string, number>;
  savingsInterestClaim: number;
  taxesPaid: { tds: number; advanceTax: number; selfAssessment: number; other: number };
  traces: Record<string, TaxTrace[]>;
  gaps: { unsupported: TaxGapCode[]; missing: TaxGapCode[]; pending: TaxGapCode[] };
  /** Notes that don't stop the estimate but are stated with it. */
  notes: TaxInputNote[];
}

export type TaxInputNote =
  | "form16_blank_as_zero"
  | "capital_loss_not_carried"
  | "stt_paid"
  | "tds_from_certificates";

const SPECIAL_DEDUCTIONS = new Set(["hra_exemption", "home_loan_interest", "savings_interest"]);

function push<T>(list: T[], value: T): void {
  if (!list.includes(value)) list.push(value);
}

function add(traces: Record<string, TaxTrace[]>, key: string, trace: TaxTrace): void {
  (traces[key] ??= []).push({ ...trace, amount: roundMoney(trace.amount) });
}

function originOf(line: TaxLine): TaxTrace["origin"] {
  return line.provenance.origin === "user_entered" ? "you" : "spendly";
}

export function assembleTaxInput(args: {
  fy: FinancialYearKey;
  profile: TaxProfile | null;
  income: TaxIncomeSummary;
  deductions: TaxDeductionSummary;
  capitalGains: TaxCapitalGainsSummary;
  entries: readonly TaxEntry[];
}): TaxEstimateInput {
  const { fy } = args;
  const traces: Record<string, TaxTrace[]> = {};
  const unsupported: TaxGapCode[] = [];
  const missing: TaxGapCode[] = [];
  const pending: TaxGapCode[] = [];
  const notes: TaxInputNote[] = [];
  const live = args.entries.filter((e) => e.fy === fy && !e.deletedAt);

  // Profile
  const residentialStatus = args.profile?.residentialStatus ?? "unknown";
  const ageBand = args.profile?.ageBand ?? "unknown";
  if (residentialStatus === "non_resident" || residentialStatus === "rnor") push(unsupported, "residency");
  if (residentialStatus === "unknown") push(pending, "profile_residency");
  if (ageBand === "unknown") push(pending, "profile_age");

  // Income
  const salary = { gross: 0, exemptAllowances: 0, hraExemption: 0, professionalTax: 0 };
  const otherSources = { savingsInterest: 0, depositInterest: 0, dividends: 0, other: 0 };
  let rent = 0;
  let salaryLines = 0;
  if (!args.income.complete) push(missing, "income_months_not_loaded");
  if (args.income.needsReview > 0) push(pending, "income_needs_review");
  if (args.income.overlaps.length > 0) push(pending, "income_overlap");
  for (const line of args.income.lines) {
    if (!line.included) {
      if (line.state === "pending") push(pending, "income_to_confirm");
      continue;
    }
    if (line.value === null) {
      push(missing, "income_value_unknown");
      continue;
    }
    const trace = { label: line.label, amount: line.value, origin: originOf(line) };
    switch (line.category) {
      case "salary":
      case "pension":
        salary.gross += line.value;
        salaryLines += 1;
        add(traces, "salary.gross", trace);
        break;
      case "rental":
        rent += line.value;
        add(traces, "rent", trace);
        break;
      case "interest_savings":
        otherSources.savingsInterest += line.value;
        add(traces, "otherSources.savingsInterest", trace);
        break;
      case "interest_deposit":
        otherSources.depositInterest += line.value;
        add(traces, "otherSources.depositInterest", trace);
        break;
      case "dividend":
        otherSources.dividends += line.value;
        add(traces, "otherSources.dividends", trace);
        break;
      case "interest_other":
      case "gift":
      case "other":
        otherSources.other += line.value;
        add(traces, "otherSources.other", trace);
        break;
      case "professional":
      case "business":
        push(unsupported, "business_income");
        break;
      case "capital_gain":
        // Gains need their dates and asset type: they belong on the capital-gains screen.
        push(unsupported, "capital_gain_as_income");
        break;
      default:
        break;
    }
  }

  // Form 16: gross salary, exemptions, professional tax, TDS
  const taxesPaid = { tds: 0, advanceTax: 0, selfAssessment: 0, other: 0 };
  const form16s = live.filter((e): e is TaxEntryOf<"form16"> => e.kind === "form16");
  for (const f16 of form16s) {
    const f = f16.fields;
    const name = f16.label || f.employerName;
    salary.gross += f.grossSalary;
    add(traces, "salary.gross", { label: `Form 16: ${name}`, amount: f.grossSalary, origin: "form16" });
    if (f.exemptAllowances == null || f.professionalTax == null) push(notes, "form16_blank_as_zero");
    if (f.exemptAllowances) {
      salary.exemptAllowances += f.exemptAllowances;
      add(traces, "salary.exemptAllowances", { label: `Form 16: ${name}`, amount: f.exemptAllowances, origin: "form16" });
    }
    if (f.professionalTax) {
      salary.professionalTax += f.professionalTax;
      add(traces, "salary.professionalTax", { label: `Form 16: ${name}`, amount: f.professionalTax, origin: "form16" });
    }
    taxesPaid.tds += f.tdsDeducted;
    add(traces, "taxesPaid.tds", { label: `Form 16: ${name}`, amount: f.tdsDeducted, origin: "form16" });
  }
  if (form16s.length > 0 && salaryLines > 0) push(pending, "salary_twice");
  if (args.income.salaryCredits.items.length > 0 && salary.gross === 0) push(pending, "no_salary_record");

  for (const tds of live.filter((e): e is TaxEntryOf<"tds"> => e.kind === "tds")) {
    taxesPaid.tds += tds.fields.tdsAmount;
    add(traces, "taxesPaid.tds", { label: `${tds.fields.deductorName} (${tds.fields.section})`, amount: tds.fields.tdsAmount, origin: "certificate" });
  }
  if (taxesPaid.tds > 0) push(notes, "tds_from_certificates");

  // Payments
  const payments = summarizeTaxPayments({ fy, entries: live });
  for (const row of payments.payments) {
    const f = row.entry.fields;
    const key = f.paymentType === "advance_tax" ? "advanceTax" : f.paymentType === "self_assessment" ? "selfAssessment" : "other";
    taxesPaid[key] += f.amount;
    add(traces, `taxesPaid.${key}`, { label: f.date, amount: f.amount, origin: "challan" });
  }

  // Deductions: only confirmed claims count here; claims awaiting an eligibility check are listed.
  const deductions: Record<string, number> = {};
  let homeLoanInterest = 0;
  let savingsInterestClaim = 0;
  if (args.deductions.overlaps.length > 0) push(pending, "deduction_overlap");
  for (const line of args.deductions.lines) {
    if (!line.included) continue;
    if (line.state === "needs_review") {
      push(pending, "deductions_to_confirm");
      continue;
    }
    if (line.value === null) {
      push(missing, "deduction_value_unknown");
      continue;
    }
    const trace = { label: line.label, amount: line.value, origin: originOf(line) };
    if (line.category === "hra_exemption") {
      salary.hraExemption += line.value;
      add(traces, "salary.hraExemption", trace);
    } else if (line.category === "home_loan_interest") {
      homeLoanInterest += line.value;
      add(traces, "homeLoanInterest", trace);
    } else if (line.category === "savings_interest") {
      savingsInterestClaim += line.value;
      add(traces, "savingsInterestClaim", trace);
    } else if (!SPECIAL_DEDUCTIONS.has(line.category)) {
      deductions[line.category] = roundMoney((deductions[line.category] ?? 0) + line.value);
      add(traces, `deductions.${line.category}`, trace);
    }
  }

  // Capital gains, by how they are taxed.
  const cg = { stcg111a: 0, stcgSlab: 0, ltcg112: 0, ltcg112a: 0 };
  const cgCheck = new Set(["grandfathering", "intraday", "check_asset_class", "adjusted"]);
  if (args.capitalGains.toConfirm > 0) push(pending, "capital_gains_to_confirm");
  for (const c of args.capitalGains.classes) {
    const counted = c.rows.filter((r) => r.included);
    if (counted.some((r) => r.attention.some((a) => cgCheck.has(a)))) push(pending, "capital_gains_check");
    const used = (["short_term", "long_term", "unknown", "unsupported"] as const).filter((t) => c.byTerm[t].rows > 0);
    if (used.length === 0) continue;
    if (c.assetClass === "virtual_digital_asset") {
      push(unsupported, "virtual_digital_assets");
      continue;
    }
    if (c.byTerm.unknown.rows > 0 || c.byTerm.unsupported.rows > 0) push(missing, "capital_gain_term_unknown");
    if (c.assetClass === "property" && c.byTerm.long_term.rows > 0) {
      // Land or buildings bought before 23 July 2024 may use 20% with indexation instead: a choice Spendly doesn't make.
      const fromStatement = c.statementTotals.some((t) => t.fields.term === "long_term");
      const early = counted.some((r) => r.term === "long_term" && (r.acquiredDate === null || r.acquiredDate < "2024-07-23"));
      if (fromStatement || early) push(unsupported, "property_indexation");
    }
    const equity = c.assetClass === "listed_equity" || c.assetClass === "equity_mutual_fund";
    for (const term of ["short_term", "long_term"] as const) {
      const t = c.byTerm[term];
      if (t.rows === 0) continue;
      if (t.gain === null) {
        push(missing, "capital_gain_cost_unknown");
        continue;
      }
      const key = term === "short_term" ? (equity ? "stcg111a" : "stcgSlab") : equity ? "ltcg112a" : "ltcg112";
      cg[key] = roundMoney(cg[key] + t.gain);
      add(traces, `capitalGains.${key}`, { label: c.assetClass, amount: t.gain, origin: c.statementTotals.length > 0 ? "statement" : "spendly" });
    }
    if (equity && c.byTerm.short_term.rows > 0) push(notes, "stt_paid");
  }
  const negatives = Object.values(cg).some((v) => v < 0);
  const positives = Object.values(cg).some((v) => v > 0);
  if (negatives && positives) push(unsupported, "capital_loss_setoff");
  else if (negatives) {
    // Only losses: nothing to tax this year; carrying them forward isn't tracked.
    push(notes, "capital_loss_not_carried");
    for (const k of Object.keys(cg) as (keyof typeof cg)[]) cg[k] = 0;
  }

  const round = <T extends Record<string, number>>(o: T): T =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, roundMoney(v)])) as T;

  return {
    fy,
    residentialStatus,
    ageBand,
    salary: round(salary),
    rent: roundMoney(rent),
    homeLoanInterest: roundMoney(homeLoanInterest),
    otherSources: round(otherSources),
    capitalGains: round(cg),
    deductions,
    savingsInterestClaim: roundMoney(savingsInterestClaim),
    taxesPaid: round(taxesPaid),
    traces,
    gaps: { unsupported, missing, pending },
    notes,
  };
}
