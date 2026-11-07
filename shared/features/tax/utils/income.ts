/**
 * SPENDLY-290 — tax-relevant income for one financial year, from what Spendly
 * already has plus what the user adds.
 *
 * Sources:
 *   - `incomes`: each row is mapped by its `source` label to a tax category.
 *     Only confident labels count by default; the rest are listed, not counted,
 *     until the user confirms or recategorises them.
 *   - Salary, bonus and pension credits are **evidence only**: a bank credit is
 *     take-home pay, not gross salary. Gross salary comes from Form 16
 *     (SPENDLY-291) or an income the user adds. They never enter a total.
 *   - Fixed deposits and interest-bearing savings: the interest credited
 *     inside the year by the existing interest schedule. Not counted until
 *     confirmed: the same interest may already be a recorded income, and the
 *     bank may report it differently (accrual).
 *   - `taxEntries` of kind `income`: what the user added (never a ledger row).
 *
 * Each source item is counted at most once, under one head; a `replace`
 * review takes it out in favour of the user's entry. Nothing here writes.
 */

import { computeInterestValuation } from "@/shared/utils/investmentInterest";
import { financialYearOfMonth } from "@/shared/utils/financialYear";
import { isValidMonthKey, shiftDateKey } from "@/shared/utils/dates";
import { roundMoney } from "@/shared/utils/money";
import type { Income } from "@/shared/types/expense";
import type { Investment } from "@/shared/types/investment";
import { TAX_INCOME_CATEGORY_HEAD } from "../data/categories";
import {
  TAX_INCOME_HEADS,
  type FinancialYearKey,
  type TaxAttention,
  type TaxDerivedItem,
  type TaxEntry,
  type TaxEntryOf,
  type TaxIncomeCategory,
  type TaxIncomeHead,
  type TaxLine,
  type TaxReview,
} from "../types";
import { taxReviewDocId } from "./ids";
import { entryLine, resolveDerivedLine, sumTaxLines, type TaxLineTotal } from "./lines";
import { financialYearDateBounds, financialYearForDate } from "./taxYear";

/** Bump when the mapping below changes, so stored reviews show their provenance. */
export const TAX_INCOME_ENGINE_VERSION = 1;

type SourceRule = {
  category: TaxIncomeCategory;
  counted: boolean;
  attention?: TaxAttention;
  /** Bank credits shown for comparison, never in a total. */
  evidence?: true;
};

const CONFIRM = "confirm_to_count" as const;

/** Keyed by the lower-cased, trimmed `Income.source`. */
const SOURCE_RULES: Record<string, SourceRule> = {
  salary: { category: "salary", counted: false, evidence: true },
  bonus: { category: "salary", counted: false, evidence: true },
  pension: { category: "pension", counted: false, evidence: true },
  freelance: { category: "professional", counted: true },
  "business income": { category: "business", counted: true },
  "rental income": { category: "rental", counted: true },
  interest: { category: "interest_other", counted: true },
  dividend: { category: "dividend", counted: true },
  cashback: { category: "not_income", counted: false },
  refund: { category: "not_income", counted: false },
  reimbursement: { category: "not_income", counted: false },
  // Gains are worked out from the sales themselves (SPENDLY-293), never from proceeds.
  "investment proceeds": { category: "not_income", counted: false },
  "gift received": { category: "gift", counted: false, attention: CONFIRM },
  "government benefit": { category: "other", counted: false, attention: CONFIRM },
  "other income": { category: "other", counted: false, attention: CONFIRM },
  // Labels from an older taxonomy; they can hide interest, dividends or rent.
  "cashback / refund": { category: "not_income", counted: false, attention: "legacy_label" },
  "freelance / business": { category: "professional", counted: false, attention: "legacy_label" },
  "investment profit": { category: "not_income", counted: false, attention: "legacy_label" },
};

const UNKNOWN_RULE: SourceRule = { category: "other", counted: false, attention: CONFIRM };

export function taxRuleForIncomeSource(source: string | undefined | null): SourceRule {
  return SOURCE_RULES[(source ?? "").trim().toLowerCase()] ?? UNKNOWN_RULE;
}

/** The year an income belongs to: its date, else its month. Empty when neither is usable. */
export function financialYearOfIncome(income: Pick<Income, "date" | "month">): FinancialYearKey {
  const byDate = financialYearForDate(income.date ?? "");
  if (byDate) return byDate;
  return isValidMonthKey(income.month ?? "") ? financialYearOfMonth(income.month) : "";
}

export interface SalaryCredit {
  incomeId: string;
  date: string;
  amount: number;
  source: string;
}

function isLive(income: Income): boolean {
  return !income.deletedAt && typeof income.amount === "number" && Number.isFinite(income.amount);
}

/** Spendly incomes of one year as tax candidates, plus the salary credits shown as evidence. */
export function deriveIncomeItems(
  incomes: readonly Income[],
  fy: FinancialYearKey
): { items: TaxDerivedItem[]; salaryCredits: SalaryCredit[] } {
  const items: TaxDerivedItem[] = [];
  const salaryCredits: SalaryCredit[] = [];
  const seen = new Set<string>();
  for (const income of incomes) {
    const id = income.id;
    // A row without an id can't be referenced by a review; the provider merges
    // pages, so an id is counted once even if it appears twice.
    if (!id || seen.has(id) || !isLive(income) || financialYearOfIncome(income) !== fy) continue;
    seen.add(id);
    const rule = taxRuleForIncomeSource(income.source);
    const amount = roundMoney(income.amount);
    if (rule.evidence) {
      salaryCredits.push({ incomeId: id, date: income.date, amount, source: income.source });
      continue;
    }
    items.push({
      fy,
      source: { kind: "income", id },
      category: rule.category,
      value: amount,
      defaultIncluded: rule.counted,
      provenance: {
        origin: "spendly_derived",
        fy,
        sourceRef: { kind: "income", id },
        periodFrom: income.date,
        periodTo: income.date,
        engineVersion: TAX_INCOME_ENGINE_VERSION,
      },
      label: income.source || "Income",
      ...(rule.attention ? { attention: rule.attention } : {}),
    });
  }
  salaryCredits.sort((a, b) => a.date.localeCompare(b.date) || a.incomeId.localeCompare(b.incomeId));
  return { items, salaryCredits };
}

/** Earliest of the given date keys; "" when none is given. */
function minDate(...dates: (string | undefined)[]): string {
  return dates.filter((d): d is string => !!d).sort()[0] ?? "";
}

/** Latest of the given date keys; "" when none is given. */
function maxDate(...dates: (string | undefined)[]): string {
  return dates.filter((d): d is string => !!d).sort().reverse()[0] ?? "";
}

/** The part of the year a deposit was open, up to today; `null` when it wasn't open at all. */
function depositWindow(
  investment: Investment,
  fy: FinancialYearKey,
  todayKey: string
): { from: string; to: string } | null {
  const bounds = financialYearDateBounds(fy);
  if (!bounds || investment.kind === "mutual_fund" || !investment.startDate) return null;
  const to = minDate(bounds.endDate, todayKey, investment.maturityDate, investment.closedDate);
  const from = maxDate(bounds.startDate, investment.startDate);
  return to < from ? null : { from, to };
}

/**
 * Interest an FD or interest-bearing savings investment was **credited**
 * inside the year (up to today), by the existing interest schedule
 * (`computeInterestValuation`): cash basis, so a cumulative deposit shows 0
 * until it matures. Banks often report interest as it accrues instead (the
 * interest certificate, AIS); the user checks and confirms or replaces it.
 *
 * `null` when Spendly lacks the inputs (rate, method, frequency): missing,
 * never guessed. `0` when the deposit wasn't open that year.
 */
export function depositInterestForYear(
  investment: Investment,
  fy: FinancialYearKey,
  todayKey: string
): number | null {
  const window = depositWindow(investment, fy, todayKey);
  if (!window) return 0;
  const { annualInterestRate: rate, interestMethod: method, creditFrequency: frequency } = investment;
  if (typeof rate !== "number" || !Number.isFinite(rate) || !method || !frequency) return null;
  const creditedBy = (asOf: string) =>
    asOf < investment.startDate
      ? 0
      : computeInterestValuation(investment.principal, rate, method, frequency, investment.startDate, asOf, investment.maturityDate)
          .accruedInterest;
  const earned = creditedBy(window.to) - creditedBy(shiftDateKey(window.from, -1));
  return Number.isFinite(earned) ? roundMoney(Math.max(0, earned)) : null;
}

/** Every deposit open during the year, even one credited nothing yet: the user checks it against the bank. */
export function deriveDepositInterestItems(
  investments: readonly Investment[],
  fy: FinancialYearKey,
  todayKey: string
): TaxDerivedItem[] {
  const items: TaxDerivedItem[] = [];
  for (const investment of investments) {
    if (!depositWindow(investment, fy, todayKey)) continue;
    items.push({
      fy,
      source: { kind: "investment", id: investment.id },
      category: investment.kind === "fixed_deposit" ? "interest_deposit" : "interest_savings",
      value: depositInterestForYear(investment, fy, todayKey),
      defaultIncluded: false,
      provenance: {
        origin: "calculated",
        fy,
        sourceRef: { kind: "investment", id: investment.id },
        engineVersion: TAX_INCOME_ENGINE_VERSION,
      },
      label: `${investment.name || "Deposit"} interest`,
      attention: "calculated",
    });
  }
  return items;
}

export function incomeEntryLine(entry: TaxEntryOf<"income">): TaxLine {
  return entryLine(entry as TaxEntry, {
    category: entry.fields.category,
    value: entry.fields.amount,
    label: entry.label || entry.fields.payer || "Income you added",
  });
}

/** Months of the year Spendly must have loaded in full: April up to the current month. */
export function incomeMonthsNeeded(fy: FinancialYearKey, todayKey: string): string[] {
  const bounds = financialYearDateBounds(fy);
  if (!bounds) return [];
  const last = minDate(bounds.endDate, todayKey).slice(0, 7);
  const months: string[] = [];
  for (let d = bounds.startDate.slice(0, 7); d <= last; ) {
    months.push(d);
    const [y, m] = d.split("-").map(Number);
    d = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  return months;
}

export type TaxHeadTotals = Record<TaxIncomeHead, TaxLineTotal>;

export interface TaxIncomeSummary {
  fy: FinancialYearKey;
  /** Every line, counted or not, in display order. */
  lines: TaxLine[];
  /** Counted lines per head. `total` is null while data is incomplete or a value is missing. */
  byHead: TaxHeadTotals;
  salaryCredits: { items: SalaryCredit[]; total: number };
  /** Every income of every needed month is loaded (or the whole ledger is). */
  complete: boolean;
  missingMonths: string[];
  /** Categories counted both from Spendly and from an entry the user added: likely the same money twice. */
  overlaps: TaxIncomeCategory[];
  needsReview: number;
}

export function headOf(category: string): TaxIncomeHead | null {
  return TAX_INCOME_CATEGORY_HEAD[category as TaxIncomeCategory] ?? null;
}

export function assembleTaxIncome(args: {
  fy: FinancialYearKey;
  todayKey: string;
  incomes: readonly Income[];
  investments: readonly Investment[];
  entries: readonly TaxEntry[];
  reviews: readonly TaxReview[];
  /** Months whose incomes are fully loaded; ignored when `ledgerComplete`. */
  monthsLoaded: ReadonlySet<string>;
  ledgerComplete: boolean;
}): TaxIncomeSummary {
  const { fy } = args;
  const reviewById = new Map(args.reviews.filter((r) => r.fy === fy).map((r) => [r.id, r]));
  const incomeEntries = args.entries.filter(
    (e): e is TaxEntryOf<"income"> => e.fy === fy && e.kind === "income"
  );
  const liveEntryIds = new Set(args.entries.filter((e) => !e.deletedAt).map((e) => e.id));

  const { items, salaryCredits } = deriveIncomeItems(args.incomes, fy);
  const derived = [...items, ...deriveDepositInterestItems(args.investments, fy, args.todayKey)];
  const lines: TaxLine[] = [
    ...derived.map((item) =>
      resolveDerivedLine(item, reviewById.get(taxReviewDocId(fy, item.source)), { liveEntryIds })
    ),
    ...incomeEntries.filter((e) => !e.deletedAt).map(incomeEntryLine),
  ];

  const missingMonths = args.ledgerComplete
    ? []
    : incomeMonthsNeeded(fy, args.todayKey).filter((m) => !args.monthsLoaded.has(m));
  const complete = missingMonths.length === 0;

  const byHead = {} as TaxHeadTotals;
  for (const head of TAX_INCOME_HEADS) {
    const headLines = lines.filter((l) => headOf(l.category) === head);
    const total = sumTaxLines(headLines);
    byHead[head] = complete ? total : { ...total, total: null };
  }

  const countedBy = (origin: "user_entered" | "spendly") =>
    new Set(
      lines
        .filter((l) => l.included && (origin === "user_entered") === (l.provenance.origin === "user_entered"))
        .map((l) => l.category as TaxIncomeCategory)
    );
  const fromUser = countedBy("user_entered");
  const overlaps = [...countedBy("spendly")].filter((c) => fromUser.has(c) && headOf(c) !== null).sort();

  return {
    fy,
    lines: sortLines(lines),
    byHead,
    salaryCredits: {
      items: salaryCredits,
      total: roundMoney(salaryCredits.reduce((sum, c) => sum + c.amount, 0)),
    },
    complete,
    missingMonths,
    overlaps,
    needsReview: lines.filter((l) => l.state === "needs_review").length,
  };
}

/** Needs review first, then counted, then not counted; by date, newest first, within each. */
function sortLines(lines: TaxLine[]): TaxLine[] {
  const rank = (l: TaxLine) => (l.state === "needs_review" ? 0 : l.included ? 1 : 2);
  const date = (l: TaxLine) => l.provenance.periodFrom ?? "";
  return [...lines].sort((a, b) => rank(a) - rank(b) || date(b).localeCompare(date(a)) || a.key.localeCompare(b.key));
}
