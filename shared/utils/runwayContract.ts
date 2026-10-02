/**
 * Financial Runway calculation contract (SPENDLY-205).
 *
 * Pure, deterministic functions that classify inputs and define the scalar
 * runway formulas. The projection engine (206) and later stories build on
 * these; nothing here reads Firestore or writes any record.
 */

import {
  BURN_CLASS_BY_PARENT,
  BURN_CLASS_BY_SUBCATEGORY,
  BURN_CLASSES_IN_MODE,
  DEFAULT_RESOURCE_LIQUIDITY,
  INCOME_CLASS_BY_SOURCE,
  LIQUIDITY_INCLUDED_BY_DEFAULT,
  LIQUIDITY_REASON,
  RUNWAY_PROJECTION_LIMITS,
} from "../data/runwayRules";
import { CATEGORY_TAXONOMY, collapseToCurrentTaxonomy } from "../data/categoryTaxonomy";
import type { Account, Expense, Income } from "../types/expense";
import type {
  BurnClass,
  IncomeClass,
  RunwayAssumptionCode,
  RunwayConfidence,
  RunwayMode,
  RunwayProvenance,
  RunwayResource,
  RunwayResourceKind,
  RunwayResult,
  RunwayThreshold,
} from "../types/runway";
import { canonicalAccountTypeId } from "./accountKind";
import { isValidDateKey } from "./dates";
import { roundMoney } from "./money";

// ── Resources ───────────────────────────────────────────────────────────────

export function defaultLiquidity(kind: RunwayResourceKind) {
  return DEFAULT_RESOURCE_LIQUIDITY[kind];
}

/**
 * Resource kind of a Spendly account. Reuses the app's existing account-type
 * classification (stored `accountTypeId`, else `canonicalAccountTypeId` of the
 * type name) rather than guessing names again.
 */
export function resourceKindForAccount(account: Pick<Account, "accountTypeId">, typeName: string): RunwayResourceKind {
  const canonical = account.accountTypeId ?? canonicalAccountTypeId(typeName);
  switch (canonical) {
    case "bank":
      return "bank";
    case "cash":
      return "cash";
    case "wallet":
      return "wallet";
    case "credit_card":
      return "credit_card";
    default:
      return "other_account";
  }
}

function sameCurrency(a: string | undefined, displayCurrency: string): boolean {
  return !a || a.trim().toUpperCase() === displayCurrency.trim().toUpperCase();
}

/**
 * Classify any resource with the default rules. `amount` is the source's own
 * balance (obligations as a positive amount owed). A resource is counted only
 * if its liquidity is counted by default and its currency is supported.
 */
export function classifyResource(input: {
  kind: RunwayResourceKind;
  refId: string;
  label: string;
  amount: number;
  provenance: RunwayProvenance;
  currency?: string;
  displayCurrency: string;
}): RunwayResource {
  const liquidity = defaultLiquidity(input.kind);
  const reasons: RunwayAssumptionCode[] = [LIQUIDITY_REASON[liquidity]];
  let included = LIQUIDITY_INCLUDED_BY_DEFAULT[liquidity];
  if (!sameCurrency(input.currency, input.displayCurrency)) {
    included = false;
    reasons.push("currency_unsupported");
  }
  const amount = Number.isFinite(input.amount) ? roundMoney(input.amount) : 0;
  if (included && amount < 0) reasons.push("overdrawn_counted");
  return { kind: input.kind, refId: input.refId, label: input.label, amount, liquidity, included, reasons, provenance: input.provenance };
}

/** Convenience for accounts: kind from the existing classifier, balance as an actual value. */
export function classifyAccountResource(input: {
  account: Pick<Account, "id" | "name" | "accountTypeId" | "currency">;
  typeName: string;
  balance: number;
  asOf: string;
  displayCurrency: string;
}): RunwayResource {
  const kind = resourceKindForAccount(input.account, input.typeName);
  return classifyResource({
    kind,
    refId: input.account.id,
    label: input.account.name,
    amount: input.balance,
    currency: input.account.currency,
    displayCurrency: input.displayCurrency,
    provenance: { source: "accounts", refId: input.account.id, asOf: input.asOf, certainty: "actual" },
  });
}

/** Sum of counted resources. Excluded resources never contribute. */
export function liquidTotal(resources: readonly RunwayResource[]): number {
  return roundMoney(resources.reduce((sum, r) => (r.included ? sum + r.amount : sum), 0));
}

// ── Spending and income ─────────────────────────────────────────────────────

export type CategoryResolution = "exact" | "mapped" | "unresolved";

export interface BurnClassification {
  burnClass: BurnClass;
  parentKey: string | null;
  subKey: string | null;
  resolution: CategoryResolution;
}

const NODE_BY_NAME = new Map(CATEGORY_TAXONOMY.filter((n) => !n.hidden).map((n) => [n.name, n]));

function classifyKeys(parentKey: string, subKey: string | null): BurnClass {
  return (subKey && BURN_CLASS_BY_SUBCATEGORY[`${parentKey}/${subKey}`]) || BURN_CLASS_BY_PARENT[parentKey] || "discretionary";
}

function lookup(category: string, subcategory?: string) {
  const node = NODE_BY_NAME.get(category);
  if (!node) return null;
  const sub = subcategory ? node.subcategories.find((s) => s.name === subcategory) : undefined;
  return { parentKey: node.key, subKey: sub?.key ?? null };
}

/**
 * Burn class for an expense from its stored category names. Current names
 * resolve exactly; older names are mapped with the app's taxonomy migration
 * (without guessing from the note); anything else is discretionary.
 */
export function burnClassForExpense(expense: Pick<Expense, "category" | "subcategory">): BurnClassification {
  const exact = lookup(expense.category, expense.subcategory);
  if (exact) return { burnClass: classifyKeys(exact.parentKey, exact.subKey), ...exact, resolution: "exact" };
  const pair = collapseToCurrentTaxonomy(expense.category, expense.subcategory ?? "", "");
  // The migration's last resort is Miscellaneous / Uncategorized: that means it didn't recognise the name.
  const fellBack = pair.category === "Miscellaneous" && pair.subcategory === "Uncategorized";
  const mapped = fellBack ? null : lookup(pair.category, pair.subcategory);
  if (mapped) return { burnClass: classifyKeys(mapped.parentKey, mapped.subKey), ...mapped, resolution: "mapped" };
  return { burnClass: "discretionary", parentKey: null, subKey: null, resolution: "unresolved" };
}

export function countsInMode(burnClass: BurnClass, mode: RunwayMode): boolean {
  return BURN_CLASSES_IN_MODE[mode].includes(burnClass);
}

export function incomeClassFor(income: Pick<Income, "source">): { incomeClass: IncomeClass; recognised: boolean } {
  const c = INCOME_CLASS_BY_SOURCE[income.source];
  return c ? { incomeClass: c, recognised: true } : { incomeClass: "earned", recognised: false };
}

/** Recorded income is always actual; expected income must be tagged by its producer. */
export function isActualIncome(provenance: Pick<RunwayProvenance, "certainty">): boolean {
  return provenance.certainty === "actual";
}

// ── Formulas ────────────────────────────────────────────────────────────────

const isNum = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const oneDecimal = (v: number) => Math.round(v * 10) / 10;

/**
 * The amount runway is measured down to. `essential_months` needs a known
 * monthly essential outflow; without one the floor is unknown (null).
 */
export function thresholdAmount(threshold: RunwayThreshold, essentialMonthly: number | null): number | null {
  switch (threshold.kind) {
    case "none":
      return 0;
    case "amount":
      return isNum(threshold.amount) ? Math.max(0, roundMoney(threshold.amount)) : null;
    case "essential_months":
      if (!isNum(threshold.months) || threshold.months < 0 || !isNum(essentialMonthly)) return null;
      return roundMoney(Math.max(0, essentialMonthly) * threshold.months);
  }
}

function divide(mode: RunwayMode, liquid: number | null, floor: number | null, monthlyBurn: number | null): RunwayResult {
  if (!isNum(liquid) || !isNum(floor) || !isNum(monthlyBurn)) {
    return { mode, state: "insufficient_data", months: null, floor: isNum(floor) ? floor : 0, monthlyBurn: isNum(monthlyBurn) ? monthlyBurn : null };
  }
  const available = roundMoney(liquid - floor);
  if (available <= 0) return { mode, state: "already_below", months: 0, floor, monthlyBurn };
  if (monthlyBurn <= 0) return { mode, state: "not_depleting", months: null, floor, monthlyBurn };
  return { mode, state: "finite", months: oneDecimal(available / monthlyBurn), floor, monthlyBurn };
}

/** Net-burn mode: (liquid − floor) ÷ (monthly outflow − monthly earned income). */
export function netBurnRunway(input: {
  liquid: number | null;
  monthlyOutflow: number | null;
  monthlyEarnedIncome: number | null;
  floor: number | null;
}): RunwayResult {
  const burn =
    isNum(input.monthlyOutflow) && isNum(input.monthlyEarnedIncome)
      ? roundMoney(input.monthlyOutflow - input.monthlyEarnedIncome)
      : null;
  return divide("net_burn", input.liquid, input.floor, burn);
}

/** Gross-burn mode: (liquid − floor) ÷ monthly essential outflow; income is ignored. */
export function grossBurnRunway(input: { liquid: number | null; monthlyEssentialOutflow: number | null; floor: number | null }): RunwayResult {
  const burn = isNum(input.monthlyEssentialOutflow) ? roundMoney(input.monthlyEssentialOutflow) : null;
  return divide("gross_burn", input.liquid, input.floor, burn);
}

/**
 * Commitment-aware projection rule: the index of the first period whose
 * closing balance is below the floor, or null if it never is within the
 * horizon. The engine (206) produces the balances; this fixes the crossing rule.
 */
export function firstPeriodBelowFloor(closingBalances: readonly number[], floor: number): number | null {
  const i = closingBalances.findIndex((b) => roundMoney(b) < floor);
  return i === -1 ? null : i;
}

export function clampProjectionMonths(months: number | undefined): number {
  const { minMonths, maxMonths, defaultMonths } = RUNWAY_PROJECTION_LIMITS;
  if (!isNum(months)) return defaultMonths;
  return Math.min(maxMonths, Math.max(minMonths, Math.round(months)));
}

// ── Confidence and validation ───────────────────────────────────────────────

export interface ConfidenceInput {
  /** Complete months of history behind the averages. */
  monthsOfHistory: number;
  includedResourceCount: number;
  unknownResourceCount: number;
  unsupportedCurrencyCount: number;
  uncertainCommitmentCount: number;
  unresolvedCategoryCount: number;
}

export function deriveConfidence(input: ConfidenceInput): { level: RunwayConfidence; reasons: RunwayAssumptionCode[] } {
  const reasons: RunwayAssumptionCode[] = [];
  if (input.monthsOfHistory < 1) reasons.push("no_history");
  if (input.includedResourceCount === 0) reasons.push("no_liquid_resources");
  if (reasons.length) return { level: "insufficient", reasons };

  if (input.monthsOfHistory < 3) reasons.push("short_history");
  if (input.unknownResourceCount > 0) reasons.push("unknown_kind_excluded");
  if (input.unsupportedCurrencyCount > 0) reasons.push("currency_unsupported");
  if (reasons.length) return { level: "low", reasons };

  if (input.uncertainCommitmentCount > 0) reasons.push("uncertain_commitments");
  if (input.unresolvedCategoryCount > 0) reasons.push("category_unresolved");
  if (input.monthsOfHistory < 6 || reasons.length) return { level: "medium", reasons };
  return { level: "high", reasons };
}

export interface RunwayInputs {
  today: string;
  displayCurrency: string;
  timezone: string;
  mode: RunwayMode;
  threshold: RunwayThreshold;
  projectionMonths: number;
}

/** Problems that make the inputs unusable. Empty means valid. */
export function validateRunwayInputs(input: RunwayInputs): string[] {
  const issues: string[] = [];
  if (!isValidDateKey(input.today)) issues.push("today must be a YYYY-MM-DD local date key");
  if (!input.displayCurrency?.trim()) issues.push("displayCurrency is required");
  if (!input.timezone?.trim()) issues.push("timezone is required");
  if (!BURN_CLASSES_IN_MODE[input.mode]) issues.push("unknown runway mode");
  if (input.threshold.kind === "amount" && (!isNum(input.threshold.amount) || input.threshold.amount < 0)) {
    issues.push("threshold amount must be zero or more");
  }
  if (input.threshold.kind === "essential_months" && (!isNum(input.threshold.months) || input.threshold.months < 0)) {
    issues.push("threshold months must be zero or more");
  }
  const { minMonths, maxMonths } = RUNWAY_PROJECTION_LIMITS;
  if (!Number.isInteger(input.projectionMonths) || input.projectionMonths < minMonths || input.projectionMonths > maxMonths) {
    issues.push(`projectionMonths must be a whole number from ${minMonths} to ${maxMonths}`);
  }
  return issues;
}
