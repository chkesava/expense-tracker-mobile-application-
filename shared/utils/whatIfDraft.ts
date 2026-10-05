/**
 * What-If editor model (SPENDLY-387): the user-facing "changes" a scenario is
 * built from, and the starter templates.
 *
 * A change is a small form (salary +₹10,000 from next month, a ₹80,000
 * purchase, a new loan ...). It is turned into engine adjustments with the
 * builders from SPENDLY-198/199/200, so no calculation is duplicated here.
 * Every adjustment of one change shares the change id, which is how the
 * editor lists, groups and removes them. Loan terms are kept as labelled
 * user assumptions so they stay visible with their provenance.
 */

import {
  WHAT_IF_DEFAULT_PROJECTION_MONTHS,
  WHAT_IF_ENGINE_VERSION,
  validateWhatIfAdjustment,
  type WhatIfAdjustment,
  type WhatIfAssumption,
  type WhatIfBaselineReference,
  type WhatIfProvenance,
  type WhatIfScenarioDefinition,
} from "../types/whatIf";
import { buildCashflowAdjustments, buildOneTimePurchase } from "./whatIfCashflow";
import { savingsPlanAdjustment } from "./whatIfGoals";
import { simulateWhatIfLoan } from "./whatIfLoan";
import type { RunwaySchedule } from "./runwayEngine";

export const WHAT_IF_CHANGE_TYPES = ["income_change", "expense_change", "purchase", "one_time_income", "loan", "savings"] as const;
export type WhatIfChangeType = (typeof WHAT_IF_CHANGE_TYPES)[number];

export const WHAT_IF_CHANGE_INFO: Record<WhatIfChangeType, { title: string; description: string; amountLabel: string; dateLabel: string }> = {
  income_change: { title: "Income change", description: "A raise, a pay cut or a new monthly income", amountLabel: "Change per month", dateLabel: "Starting from" },
  expense_change: { title: "Monthly expense change", description: "A new monthly cost, or cutting one", amountLabel: "Change per month", dateLabel: "Starting from" },
  purchase: { title: "One-time purchase", description: "A phone, a vacation, a car down payment", amountLabel: "Amount", dateLabel: "On" },
  one_time_income: { title: "One-time income", description: "A bonus, a refund or a gift", amountLabel: "Amount", dateLabel: "On" },
  loan: { title: "New loan or EMI", description: "Borrow money and repay it in monthly EMIs", amountLabel: "Loan amount", dateLabel: "Loan starts" },
  savings: { title: "Monthly saving", description: "Put money aside every month for a goal", amountLabel: "Save per month", dateLabel: "Starting from" },
};

/** The editor form for one change. Loan fields apply only to `loan`. */
export interface WhatIfChangeForm {
  type: WhatIfChangeType;
  label: string;
  amount: number;
  /** income_change / expense_change only. */
  direction?: "increase" | "decrease";
  startDate: string;
  /** Optional end for monthly changes and savings. */
  untilDate?: string;
  annualInterestRatePct?: number;
  tenureMonths?: number;
  downPayment?: number;
  fees?: number;
}

export interface WhatIfTemplate {
  id: string;
  title: string;
  description: string;
  form: Omit<WhatIfChangeForm, "amount" | "startDate"> & { amount?: number };
}

export const WHAT_IF_TEMPLATES: readonly WhatIfTemplate[] = [
  { id: "salary", title: "Salary change", description: "What if my salary goes up or down?", form: { type: "income_change", label: "Salary change", direction: "increase" } },
  { id: "purchase", title: "Big purchase", description: "Can I afford a big one-time spend?", form: { type: "purchase", label: "Big purchase" } },
  { id: "loan", title: "New loan / EMI", description: "How would an EMI change my months ahead?", form: { type: "loan", label: "New loan", annualInterestRatePct: 10, tenureMonths: 12 } },
  { id: "goal", title: "Save for a goal", description: "What if I save a fixed amount every month?", form: { type: "savings", label: "Monthly saving" } },
  { id: "cut", title: "Cut an expense", description: "What if I spend less on something every month?", form: { type: "expense_change", label: "Cut an expense", direction: "decrease" } },
  { id: "bonus", title: "Bonus or one-time income", description: "What does a one-time income do for me?", form: { type: "one_time_income", label: "Bonus" } },
];

const SEPARATOR = "--";

/** A fresh change id: `<type>--<suffix>`. The suffix comes from the caller (UI randomness stays out of pure code). */
export function whatIfChangeId(type: WhatIfChangeType, suffix: string): string {
  return `${type}${SEPARATOR}${suffix}`;
}

/** The change an adjustment belongs to (loan ids look like `what-if:<id>:repayment`). */
export function whatIfChangeIdOf(adjustmentId: string): string {
  const bare = adjustmentId.startsWith("what-if:") ? adjustmentId.slice("what-if:".length) : adjustmentId;
  return bare.split(":")[0];
}

export function whatIfChangeTypeOf(changeId: string): WhatIfChangeType | null {
  const type = changeId.split(SEPARATOR)[0] as WhatIfChangeType;
  return WHAT_IF_CHANGE_TYPES.includes(type) ? type : null;
}

function monthly(startDate: string, untilDate?: string): RunwaySchedule {
  return { kind: "monthly", firstDate: startDate, dayOfMonth: Number(startDate.slice(8, 10)), ...(untilDate ? { untilMonth: untilDate.slice(0, 7) } : {}) };
}

export interface BuiltChange {
  adjustments: WhatIfAdjustment[];
  assumptions: WhatIfAssumption[];
  issues: string[];
}

/** Validate the form and turn it into adjustments (+ assumptions for loans). */
export function buildWhatIfChange(id: string, form: WhatIfChangeForm, today: string): BuiltChange {
  const issues: string[] = [];
  const label = form.label.trim();
  if (!label) issues.push("Give this change a name.");
  if (!Number.isFinite(form.amount) || form.amount <= 0) issues.push("Enter an amount greater than zero.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.startDate)) issues.push("Pick a date.");
  else if (form.startDate < today) issues.push("Pick today or a later date — What If looks ahead.");
  if (form.untilDate && form.untilDate < form.startDate) issues.push("The end date must be after the start date.");
  if (issues.length) return { adjustments: [], assumptions: [], issues };

  const provenance: WhatIfProvenance = { kind: "user", source: "what_if_editor", asOfDate: today };
  let adjustments: WhatIfAdjustment[] = [];
  const assumptions: WhatIfAssumption[] = [];

  switch (form.type) {
    case "income_change":
    case "expense_change":
      adjustments = buildCashflowAdjustments({
        id,
        label,
        kind: form.type === "income_change" ? "income" : "expense",
        action: form.direction ?? "increase",
        amount: form.amount,
        schedule: monthly(form.startDate, form.untilDate),
        provenance,
      });
      break;
    case "purchase":
      adjustments = [buildOneTimePurchase({ id, label, amount: form.amount, date: form.startDate, provenance })];
      break;
    case "one_time_income":
      adjustments = buildCashflowAdjustments({ id, label, kind: "income", action: "add", amount: form.amount, schedule: { kind: "once", date: form.startDate }, provenance });
      break;
    case "savings":
      adjustments = [savingsPlanAdjustment({ id, label, amount: form.amount, frequency: "monthly", firstDate: form.startDate, untilDate: form.untilDate, provenance })];
      break;
    case "loan": {
      const rate = form.annualInterestRatePct ?? 0;
      const tenure = form.tenureMonths ?? 0;
      if (!Number.isFinite(rate) || rate < 0 || rate > 60) issues.push("Interest rate must be between 0% and 60% a year.");
      if (!Number.isInteger(tenure) || tenure < 1 || tenure > 360) issues.push("Tenure must be 1 to 360 months.");
      if ((form.downPayment ?? 0) >= form.amount) issues.push("Down payment must be less than the loan amount.");
      if (issues.length) return { adjustments: [], assumptions: [], issues };
      const loan = simulateWhatIfLoan({
        id,
        label,
        principal: form.amount,
        downPayment: form.downPayment || undefined,
        annualInterestRatePct: rate,
        tenureMonths: tenure,
        frequency: "monthly",
        startDate: form.startDate,
        fees: form.fees || undefined,
        provenance,
      });
      issues.push(...loan.issues);
      adjustments = loan.adjustments;
      assumptions.push(
        { code: `${id}:rate`, label: `${label}: interest rate (% a year)`, value: rate, provenance },
        { code: `${id}:tenure`, label: `${label}: tenure (months)`, value: tenure, provenance },
        { code: `${id}:emi`, label: `${label}: monthly EMI`, value: loan.paymentAmount, provenance: { ...provenance, kind: "derived" } }
      );
      break;
    }
  }
  adjustments.forEach((adjustment, index) => issues.push(...validateWhatIfAdjustment(adjustment, index)));
  return { adjustments, assumptions, issues: [...new Set(issues)] };
}

export interface WhatIfChangeGroup {
  id: string;
  type: WhatIfChangeType | null;
  label: string;
  adjustments: WhatIfAdjustment[];
  assumptions: WhatIfAssumption[];
}

/** Adjustments grouped back into the changes the user added, in order. */
export function whatIfChangeGroups(scenario: Pick<WhatIfScenarioDefinition, "adjustments" | "assumptions">): WhatIfChangeGroup[] {
  const groups = new Map<string, WhatIfChangeGroup>();
  for (const adjustment of scenario.adjustments) {
    const id = whatIfChangeIdOf(adjustment.id);
    const group = groups.get(id) ?? { id, type: whatIfChangeTypeOf(id), label: adjustment.label, adjustments: [], assumptions: [] };
    group.adjustments.push(adjustment);
    groups.set(id, group);
  }
  for (const assumption of scenario.assumptions) {
    const group = groups.get(assumption.code.split(":")[0]);
    if (group) group.assumptions.push(assumption);
  }
  // A loan's label is the loan, not "<loan> proceeds".
  for (const group of groups.values()) {
    if (group.type === "loan") group.label = group.label.replace(/ (proceeds|repayment|down payment|fees)$/, "");
  }
  return [...groups.values()];
}

/** Add one built change to a scenario draft (replacing any change with the same id). */
export function withWhatIfChange<T extends Pick<WhatIfScenarioDefinition, "adjustments" | "assumptions">>(scenario: T, changeId: string, built: BuiltChange): T {
  const rest = withoutWhatIfChange(scenario, changeId);
  return { ...rest, adjustments: [...rest.adjustments, ...built.adjustments], assumptions: [...rest.assumptions, ...built.assumptions] };
}

export function withoutWhatIfChange<T extends Pick<WhatIfScenarioDefinition, "adjustments" | "assumptions">>(scenario: T, changeId: string): T {
  return {
    ...scenario,
    adjustments: scenario.adjustments.filter((a) => whatIfChangeIdOf(a.id) !== changeId),
    assumptions: scenario.assumptions.filter((a) => a.code.split(":")[0] !== changeId),
  };
}

/** An empty draft anchored to today's reference. */
export function newWhatIfDraft(input: { name: string; reference: WhatIfBaselineReference; durationMonths?: number }): Omit<WhatIfScenarioDefinition, "id"> {
  return {
    name: input.name,
    version: 1,
    engineVersion: WHAT_IF_ENGINE_VERSION,
    reference: input.reference,
    durationMonths: input.durationMonths ?? WHAT_IF_DEFAULT_PROJECTION_MONTHS,
    adjustments: [],
    assumptions: [],
  };
}

/** First day of next month — a sensible default start for monthly changes. */
export function nextMonthStart(today: string): string {
  const [y, m] = today.split("-").map(Number);
  const year = m === 12 ? y + 1 : y;
  const month = m === 12 ? 1 : m + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}
