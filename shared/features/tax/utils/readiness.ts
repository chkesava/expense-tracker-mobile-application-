/**
 * SPENDLY-296 — how ready a year is for the user to review before filing:
 * one status per section, and a checklist of what's missing, uncertain or
 * worth a look. Pure; derived on screen, never stored. Only the user's
 * decisions are stored (`taxReviews`, source kind `checklist`).
 *
 * - Facts (what the user or Spendly recorded), calculations (gains, the
 *   estimate) and tasks (checklist items) are kept apart and labelled.
 * - An item's id carries what it is about (usually a count), so when that
 *   changes the item opens again: resolving "3 incomes to confirm" doesn't
 *   hide a fourth.
 * - A user can **resolve** an item ("handled outside Spendly") or **defer**
 *   it ("later"). A deferred required item still blocks "Ready to review".
 * - The top label is "Ready to review" at most, never "Filed" or "Done": the
 *   user files, Spendly doesn't.
 */

import { roundMoney } from "@/shared/utils/money";
import type { FinancialYearKey, TaxEntry, TaxEntryOf, TaxProfile, TaxReview } from "../types";
import { capitalGainTotals, type TaxCapitalGainsSummary } from "./capitalGains";
import type { TaxRegimeComparison } from "./compareRegimes";
import type { TaxDeductionSummary } from "./deductions";
import { taxReviewDocId } from "./ids";
import type { TaxIncomeSummary } from "./income";
import { summarizeTaxPayments } from "./payments";
import type { TaxEstimateInput } from "./taxInput";
import { reconcileTds } from "./tdsReconcile";

export const READINESS_SECTIONS = ["profile", "income", "tds", "deductions", "capital-gains", "payments", "estimate"] as const;
export type ReadinessSection = (typeof READINESS_SECTIONS)[number];

export type ChecklistState = "open" | "deferred" | "resolved";

export interface ChecklistItem {
  /** `taxReviews` source id (kind `checklist`). */
  id: string;
  section: ReadinessSection;
  /** Required items block "Ready to review"; the rest are worth a look. */
  required: boolean;
  title: string;
  detail: string;
  state: ChecklistState;
}

export interface SectionReadiness {
  section: ReadinessSection;
  state: "ready" | "to_check" | "worth_a_look";
  openRequired: number;
  openOptional: number;
  /** The section's headline figure and what kind of figure it is. */
  figure: { label: string; amount: number | null; kind: "fact" | "calculated" } | null;
  /** Shown when there's no figure. */
  note?: string;
}

export interface TaxReadiness {
  fy: FinancialYearKey;
  sections: SectionReadiness[];
  items: ChecklistItem[];
  progress: { ready: number; total: number };
  label: "ready_to_review" | "in_progress" | "not_started";
}

type Draft = Omit<ChecklistItem, "state">;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function checklistReviewId(fy: FinancialYearKey, itemId: string): string {
  return taxReviewDocId(fy, { kind: "checklist", id: itemId });
}

export function assembleReadiness(args: {
  fy: FinancialYearKey;
  profile: TaxProfile | null;
  input: TaxEstimateInput;
  comparison: TaxRegimeComparison;
  income: TaxIncomeSummary;
  deductions: TaxDeductionSummary;
  capitalGains: TaxCapitalGainsSummary;
  entries: readonly TaxEntry[];
  reviews: readonly TaxReview[];
}): TaxReadiness {
  const { fy, input } = args;
  const live = args.entries.filter((e) => e.fy === fy && !e.deletedAt);
  const drafts: Draft[] = [];
  const item = (d: Draft) => drafts.push(d);
  const pending = new Set(input.gaps.pending);

  // Profile
  if (!args.profile || args.profile.residentialStatus === "unknown") {
    item({ id: "profile-residency", section: "profile", required: true, title: "Set your residential status", detail: "It decides which rules apply. Set it on the estimate screen." });
  } else if (input.gaps.unsupported.includes("residency")) {
    item({ id: "profile-non-resident", section: "profile", required: false, title: "Spendly estimates for residents only", detail: "Non-residents and RNORs are taxed differently. Check your figures with a professional." });
  }
  if (!args.profile || args.profile.ageBand === "unknown") {
    item({ id: "profile-age", section: "profile", required: false, title: "Set your age band", detail: "It changes the old regime's slabs and some deduction limits." });
  }

  // Income
  const counted = args.income.lines.filter((l) => l.included);
  const form16s = live.filter((e) => e.kind === "form16");
  if (counted.length === 0 && form16s.length === 0) {
    item({ id: "income-none", section: "income", required: true, title: "Add your income", detail: "Add your Form 16, or the income you had this year. Resolve this if you had none." });
  }
  if (!args.income.complete) {
    item({ id: "income-months", section: "income", required: true, title: "Some months haven't loaded", detail: "Open Income so every month of the year is counted." });
  }
  const toConfirm = args.income.lines.filter((l) => !l.included && l.state === "pending").length;
  if (toConfirm > 0) item({ id: `income-confirm-${toConfirm}`, section: "income", required: true, title: plural(toConfirm, "income to confirm", "incomes to confirm"), detail: "Spendly isn't sure these are taxable. Count them or leave them out." });
  if (args.income.needsReview > 0) item({ id: `income-review-${args.income.needsReview}`, section: "income", required: true, title: plural(args.income.needsReview, "income needs", "incomes need") + " another look", detail: "Something changed since you decided." });
  if (args.income.overlaps.length > 0) item({ id: `income-overlap-${args.income.overlaps.join("-")}`, section: "income", required: true, title: "Income may be counted twice", detail: "The same kind of income is counted from Spendly and from what you added." });
  if (pending.has("salary_twice")) item({ id: "income-salary-twice", section: "income", required: true, title: "Salary may be counted twice", detail: "It's on a Form 16 and also added as income." });
  if (pending.has("no_salary_record")) item({ id: "income-form16", section: "tds", required: true, title: "Add your Form 16", detail: "Spendly sees salary credits, but tax is on gross salary, which is on your Form 16." });

  // TDS
  const tds = reconcileTds({ fy, entries: live, reviews: args.reviews });
  const tdsRecords = live.filter((e) => e.kind === "form16" || e.kind === "tds").length;
  if (!tds.statement && tdsRecords > 0) {
    item({ id: "tds-statement", section: "tds", required: false, title: "Add your AIS or 26AS", detail: "Comparing them with your certificates shows TDS the department doesn't see." });
  }
  const differences = tds.rows.filter((r) => r.state !== "matched" && r.state !== "accepted").length;
  if (tds.statement && differences > 0) {
    item({ id: `tds-differences-${differences}`, section: "tds", required: true, title: plural(differences, "TDS difference", "TDS differences"), detail: `Your records and your ${tds.statement} don't agree. Check them, or accept the difference.` });
  }

  // Deductions
  const eligibility = args.deductions.lines.filter((l) => l.included && l.state === "needs_review").length;
  if (eligibility > 0) item({ id: `deductions-confirm-${eligibility}`, section: "deductions", required: true, title: plural(eligibility, "claim to confirm", "claims to confirm"), detail: "Confirm you're eligible. Until then they aren't in the estimate." });
  if (args.deductions.overlaps.length > 0) item({ id: `deductions-overlap-${args.deductions.overlaps.join("-")}`, section: "deductions", required: true, title: "A deduction may be counted twice", detail: "The same claim comes from Spendly and from what you added." });
  const noProof = live.filter((e): e is TaxEntryOf<"deduction"> => e.kind === "deduction" && e.fields.proofStatus === "missing" && !(e.documentIds?.length)).length;
  if (noProof > 0) item({ id: `deductions-proofs-${noProof}`, section: "deductions", required: false, title: plural(noProof, "claim without proof", "claims without proof"), detail: "Attach the receipt or certificate, in case you're asked for it." });

  // Capital gains
  const cg = args.capitalGains;
  if (cg.toConfirm > 0) item({ id: `cg-confirm-${cg.toConfirm}`, section: "capital-gains", required: true, title: plural(cg.toConfirm, "sale to confirm", "sales to confirm"), detail: "Sales from your portfolio count once you confirm them." });
  if (cg.missingCost > 0) item({ id: `cg-cost-${cg.missingCost}`, section: "capital-gains", required: true, title: plural(cg.missingCost, "sale without a cost", "sales without a cost"), detail: "Add the cost from your contract note or statement." });
  const termUnknown = cg.classes.flatMap((c) => c.rows).filter((r) => r.included && (r.term === "unknown")).length;
  if (termUnknown > 0) item({ id: `cg-term-${termUnknown}`, section: "capital-gains", required: true, title: plural(termUnknown, "sale without a buy date", "sales without a buy date"), detail: "Without it, short- and long-term can't be told apart." });
  const flagged = cg.classes.flatMap((c) => c.rows).filter((r) => r.included && r.attention.length > 0).length;
  if (flagged > 0) item({ id: `cg-check-${flagged}`, section: "capital-gains", required: false, title: plural(flagged, "sale to check", "sales to check"), detail: "Asset type, grandfathering or same-day trades." });

  // Payments
  const payments = summarizeTaxPayments({ fy, entries: live });
  if (payments.missingReferences > 0) item({ id: `payments-reference-${payments.missingReferences}`, section: "payments", required: false, title: plural(payments.missingReferences, "payment without challan details", "payments without challan details"), detail: "The BSR code and challan number, or the CIN, prove it was paid." });
  if (payments.unmatchedStatement.length > 0) item({ id: `payments-unrecorded-${payments.unmatchedStatement.length}`, section: "payments", required: false, title: plural(payments.unmatchedStatement.length, "tax payment", "tax payments") + ` in your ${payments.statement} not recorded`, detail: "Add it from its challan." });

  // Estimate (informational)
  const c = args.comparison;
  const regime = args.profile?.regimeNote === "old" ? c.old : c.new;
  if (regime.status === "unsupported") {
    item({ id: `estimate-unsupported-${[...regime.unsupported].sort().join("-")}`, section: "estimate", required: false, title: "Spendly can't estimate this year", detail: "Your situation includes something Spendly doesn't estimate. Open the estimate to see what." });
  }
  if (regime.balance !== null && regime.balance > 0) {
    item({ id: `estimate-balance-${Math.round(regime.balance)}`, section: "estimate", required: false, title: "Estimated tax still to pay", detail: "On these figures, more tax is due than you've paid. This is an estimate, not a demand." });
  }

  // Decisions
  const reviews = new Map(args.reviews.filter((r) => r.fy === fy && r.sourceKind === "checklist").map((r) => [r.sourceId, r]));
  const items: ChecklistItem[] = drafts.map((d) => {
    const decision = reviews.get(d.id)?.decision;
    return { ...d, state: decision === "resolve" ? "resolved" : decision === "defer" ? "deferred" : "open" };
  });

  // Sections
  const totals = capitalGainTotals(cg);
  const sum = (values: (number | null)[]) => (values.some((v) => v === null) ? null : roundMoney(values.reduce<number>((s, v) => s + (v ?? 0), 0)));
  const incomeTotal = args.income.complete ? sum(Object.values(args.income.byHead).map((t) => (t.countedLines ? t.total : 0))) : null;
  const paid = input.taxesPaid;
  const figures: Record<ReadinessSection, SectionReadiness["figure"]> = {
    profile: null,
    income: { label: "Income counted", amount: roundMoney((incomeTotal ?? 0) + form16s.reduce((s, e) => s + (e as TaxEntryOf<"form16">).fields.grossSalary, 0)), kind: "fact" },
    tds: { label: "TDS on your certificates", amount: paid.tds, kind: "fact" },
    deductions: { label: "Claims counted", amount: sum(args.deductions.lines.filter((l) => l.included && l.state !== "needs_review").map((l) => l.value)), kind: "fact" },
    "capital-gains": cg.classes.length === 0 ? null : { label: "Gains (calculated)", amount: sum([totals.short_term.rows ? totals.short_term.gain : 0, totals.long_term.rows ? totals.long_term.gain : 0]), kind: "calculated" },
    payments: { label: "Tax paid", amount: roundMoney(paid.advanceTax + paid.selfAssessment + paid.other), kind: "fact" },
    estimate: regime.liability === null ? null : { label: `Estimated tax, ${regime.regime} regime`, amount: regime.liability, kind: "calculated" },
  };
  if (!args.income.complete || counted.some((l) => l.value === null)) figures.income = { label: "Income counted", amount: null, kind: "fact" };
  const notes: Partial<Record<ReadinessSection, string>> = {
    profile: args.profile ? undefined : "Not set",
    "capital-gains": cg.classes.length === 0 ? "No sales" : undefined,
    estimate: regime.liability === null ? (regime.status === "unsupported" ? "Can't estimate" : "Not yet") : undefined,
  };

  const sections: SectionReadiness[] = READINESS_SECTIONS.map((section) => {
    const own = items.filter((i) => i.section === section && i.state !== "resolved");
    const openRequired = own.filter((i) => i.required).length;
    const openOptional = own.length - openRequired;
    return {
      section,
      state: openRequired > 0 ? "to_check" : openOptional > 0 ? "worth_a_look" : "ready",
      openRequired,
      openOptional,
      figure: figures[section],
      ...(notes[section] ? { note: notes[section] } : {}),
    };
  });

  const ready = sections.filter((s) => s.openRequired === 0).length;
  const nothing = !args.profile && live.length === 0 && counted.length === 0 && cg.classes.length === 0;
  return {
    fy,
    sections,
    items,
    progress: { ready, total: sections.length },
    label: nothing ? "not_started" : ready === sections.length ? "ready_to_review" : "in_progress",
  };
}
