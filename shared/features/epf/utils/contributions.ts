/**
 * EPF contribution logic — KAN-66.
 *
 * A sibling of `utils/index.ts` (which owns establishment logic) rather than an
 * append to it, so both stay reviewable. Everything here is pure: `hooks/**`
 * and `components/**` are never executed by `npm test`, so any conditional that
 * lives in a hook is a conditional nobody tests.
 *
 * Must stay free of React and Firebase imports — `tsconfig.shared.json`
 * compiles this tree on its own.
 */

import type { EpfContributionRule } from "@/shared/features/epf/data/epfRules";
import { findEpfContributionRule } from "@/shared/features/epf/data/epfRules";
import type {
  EpfBackfillRow,
  EpfContribution,
  EpfContributionIssue,
  EpfContributionSource,
  EpfContributionStatus,
  EpfContributionTotals,
  EpfEstablishment,
} from "@/shared/features/epf/types";
import { daysInMonth, monthKeysBetween } from "@/shared/utils/dates";
import {
  compareFinancialYears,
  financialYearOfMonth,
} from "@/shared/utils/financialYear";
import { roundMoney } from "@/shared/utils/money";

/**
 * Statutory shares are whole rupees.
 *
 * Not a deviation from the repo's rupee-float money rule — the result is still
 * a rupee float and every sum still goes through `roundMoney`. It is a
 * correctness choice: 8.33% of 15,000 is 1,249.5 but the recognised EPS figure
 * is ₹1,250, and 8.33% of 6,500 is 541.45 against a statutory ₹541. Two-decimal
 * rounding reproduces neither, and every user comparing with their passbook
 * would read that as a bug.
 */
function roundRupees(value: number): number {
  return Math.round(value);
}

/**
 * Deterministic document id.
 *
 * The ticket forbids duplicate establishment+month records, and client-SDK
 * transactions cannot read queries — so a transactional existence check is
 * impossible. Putting the identity in the key makes a duplicate structurally
 * unrepresentable and every write idempotent under `setDoc(…, {merge:true})`.
 */
export function contributionDocId(establishmentId: string, month: string): string {
  return `${establishmentId}_${month}`;
}

export interface EpfContributionComputation {
  wage: number;
  employeeShare: number;
  employerShare: number;
  epsShare: number;
  employerEpfShare: number;
  totalContribution: number;
  epfCredit: number;
  epsEligible: boolean;
  rulesVersion: string;
}

/**
 * The statutory split for a wage in a given month.
 *
 * Employee and employer both contribute 12% of the full wage; only the EPS
 * diversion is capped at the ceiling. The remainder of the employer's 12% is
 * what actually reaches the EPF balance, which is why `employerShare` and
 * `epfCredit` are different numbers.
 */
export function computeEpfContribution(input: {
  wage: number;
  month: string;
  epsEligible: boolean;
  rule?: EpfContributionRule;
}): EpfContributionComputation {
  const rule = input.rule ?? findEpfContributionRule(input.month);
  const wage = Math.max(0, input.wage || 0);

  const employeeShare = roundRupees(wage * rule.employeeRate);
  const employerShare = roundRupees(wage * rule.employerRate);
  const epsShare = input.epsEligible
    ? roundRupees(Math.min(wage, rule.epsWageCeiling) * rule.epsRate)
    : 0;
  const employerEpfShare = Math.max(0, roundMoney(employerShare - epsShare));

  return {
    wage,
    employeeShare,
    employerShare,
    epsShare,
    employerEpfShare,
    totalContribution: roundMoney(employeeShare + employerShare),
    epfCredit: roundMoney(employeeShare + employerEpfShare),
    epsEligible: input.epsEligible,
    rulesVersion: rule.id,
  };
}

/**
 * Best-guess EPS membership, used only to pre-fill the toggle.
 *
 * The statutory rule keys off first EPF membership ever, so this takes the
 * earliest joining date across the profile, not one establishment. Never used
 * to decide silently — getting it wrong misstates the balance by the EPS cap
 * every month.
 */
export function deriveEpsEligibility(args: {
  firstEverJoinDate?: string;
  wage: number;
  month: string;
}): boolean {
  const rule = findEpfContributionRule(args.month);
  const joinedAfterCutoff = Boolean(
    args.firstEverJoinDate && args.firstEverJoinDate >= "2014-09-01"
  );
  return !(joinedAfterCutoff && args.wage > rule.epsWageCeiling);
}

/**
 * Pro-rated wage for a part-month at joining or leaving.
 *
 * A suggestion only — many employers remit on the full month regardless, so the
 * UI offers a one-tap "use full wage" rather than computing silently.
 */
export function proratedWageForMonth(
  wage: number,
  month: string,
  dateJoined: string,
  dateLeft?: string
): number {
  const total = daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1);
  const joinedThisMonth = dateJoined.slice(0, 7) === month;
  const leftThisMonth = Boolean(dateLeft && dateLeft.slice(0, 7) === month);
  if (!joinedThisMonth && !leftThisMonth) return wage;

  const firstDay = joinedThisMonth ? Number(dateJoined.slice(8, 10)) : 1;
  const lastDay = leftThisMonth && dateLeft ? Number(dateLeft.slice(8, 10)) : total;
  const worked = Math.max(0, lastDay - firstDay + 1);
  return roundMoney((wage * worked) / total);
}

export function isPartialMonth(
  month: string,
  dateJoined: string,
  dateLeft?: string
): boolean {
  const joinedMidMonth =
    dateJoined.slice(0, 7) === month && Number(dateJoined.slice(8, 10)) > 1;
  if (joinedMidMonth) return true;
  if (!dateLeft || dateLeft.slice(0, 7) !== month) return false;
  const total = daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1);
  return Number(dateLeft.slice(8, 10)) < total;
}

/** Every contribution month for an establishment, clamped at the current month. */
export function contributionMonthsFor(
  establishment: Pick<EpfEstablishment, "dateJoined" | "dateLeft">,
  currentMonth: string
): string[] {
  const startMonth = establishment.dateJoined.slice(0, 7);
  const leftMonth = establishment.dateLeft?.slice(0, 7);
  const endMonth = leftMonth && leftMonth < currentMonth ? leftMonth : currentMonth;
  return monthKeysBetween(startMonth, endMonth);
}

/** Tolerant read: recomputes derived totals so a stale stored total can never display. */
export function normalizeEpfContribution(
  id: string,
  raw: Record<string, unknown>
): EpfContribution {
  const num = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;
  const str = (value: unknown): string | undefined =>
    typeof value === "string" && value ? value : undefined;

  const employeeShare = num(raw.employeeShare);
  const employerShare = num(raw.employerShare);
  const epsShare = num(raw.epsShare);
  const employerEpfShare = Math.max(0, roundMoney(employerShare - epsShare));

  return {
    id,
    establishmentId: str(raw.establishmentId) ?? "",
    month: str(raw.month) ?? "",
    wage: num(raw.wage),
    employeeShare,
    employerShare,
    epsShare,
    employerEpfShare,
    totalContribution: roundMoney(employeeShare + employerShare),
    epfCredit: roundMoney(employeeShare + employerEpfShare),
    status: (str(raw.status) as EpfContributionStatus) ?? "confirmed",
    source: (str(raw.source) as EpfContributionSource) ?? "manualHistorical",
    overridden: raw.overridden === true ? true : undefined,
    partialMonth: raw.partialMonth === true ? true : undefined,
    epsEligible: raw.epsEligible !== false,
    rulesVersion: str(raw.rulesVersion),
    creditDate: str(raw.creditDate),
    reference: str(raw.reference),
    notes: str(raw.notes),
    zeroReason: str(raw.zeroReason),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

/**
 * The rows the backfill screen renders.
 *
 * Months are generated in memory; only rows the user fills are ever written, so
 * a collection never accumulates empty placeholders. Existing documents are
 * merged in by month, and an overridden row keeps its stored amounts rather
 * than being recomputed from the wage.
 */
export function buildBackfillRows(args: {
  establishment: Pick<EpfEstablishment, "id" | "dateJoined" | "dateLeft">;
  currentMonth: string;
  existing: EpfContribution[];
  wage?: number;
  epsEligible: boolean;
  prorateEdgeMonths?: boolean;
}): EpfBackfillRow[] {
  const byMonth = new Map(args.existing.map((row) => [row.month, row]));
  const months = contributionMonthsFor(args.establishment, args.currentMonth);

  return months.map((month) => {
    const saved = byMonth.get(month);
    if (saved && saved.overridden) {
      return { ...saved, persisted: true };
    }

    const partial =
      args.prorateEdgeMonths !== false &&
      isPartialMonth(month, args.establishment.dateJoined, args.establishment.dateLeft);
    const baseWage = saved?.wage || args.wage || 0;
    const wage =
      partial && baseWage
        ? proratedWageForMonth(
            baseWage,
            month,
            args.establishment.dateJoined,
            args.establishment.dateLeft
          )
        : baseWage;

    const computed = computeEpfContribution({
      wage,
      month,
      epsEligible: saved?.epsEligible ?? args.epsEligible,
    });

    return {
      establishmentId: args.establishment.id,
      month,
      ...computed,
      status: saved?.status ?? "draft",
      source: saved?.source ?? "manualHistorical",
      partialMonth: partial || undefined,
      creditDate: saved?.creditDate,
      reference: saved?.reference,
      notes: saved?.notes,
      zeroReason: saved?.zeroReason,
      persisted: Boolean(saved),
    };
  });
}

/** Validation issues for one row. Collected, never thrown. */
export function validateEpfContribution(
  row: Pick<
    EpfBackfillRow,
    | "month"
    | "employeeShare"
    | "employerShare"
    | "epsShare"
    | "employerEpfShare"
    | "creditDate"
    | "zeroReason"
  >,
  ctx: {
    establishment: Pick<EpfEstablishment, "dateJoined" | "dateLeft">;
    currentDateKey: string;
    allowOutsidePeriod?: boolean;
  }
): EpfContributionIssue[] {
  const issues: EpfContributionIssue[] = [];
  const add = (
    code: EpfContributionIssue["code"],
    message: string,
    severity: EpfContributionIssue["severity"] = "error",
    field?: string
  ) => issues.push({ month: row.month, code, message, severity, field });

  const amounts: Array<[string, number]> = [
    ["employeeShare", row.employeeShare],
    ["employerShare", row.employerShare],
    ["epsShare", row.epsShare],
    ["employerEpfShare", row.employerEpfShare],
  ];
  for (const [field, value] of amounts) {
    if (value < 0) add("negative_amount", "Amounts cannot be negative.", "error", field);
  }

  if (!ctx.allowOutsidePeriod) {
    const joinedMonth = ctx.establishment.dateJoined.slice(0, 7);
    const leftMonth = ctx.establishment.dateLeft?.slice(0, 7);
    if (row.month < joinedMonth || (leftMonth && row.month > leftMonth)) {
      add(
        "month_outside_employment",
        "This month falls outside the employment period.",
        "error",
        "month"
      );
    }
  }

  if (row.epsShare > row.employerShare) {
    add(
      "eps_exceeds_employer",
      "Pension share cannot exceed the employer contribution.",
      "error",
      "epsShare"
    );
  }

  if (Math.abs(row.employerEpfShare - (row.employerShare - row.epsShare)) > 1) {
    add(
      "employer_split_mismatch",
      "Employer EPF share should equal employer contribution minus pension.",
      "error",
      "employerEpfShare"
    );
  }

  const allZero =
    row.employeeShare === 0 && row.employerShare === 0 && row.epsShare === 0;
  if (allZero && !row.zeroReason) {
    add(
      "zero_without_reason",
      "Add a reason for a zero-contribution month.",
      "error",
      "zeroReason"
    );
  }

  if (row.creditDate) {
    if (row.creditDate < `${row.month}-01`) {
      add(
        "credit_date_before_month",
        "Credit date cannot precede the contribution month.",
        "error",
        "creditDate"
      );
    } else if (row.creditDate > ctx.currentDateKey) {
      add("credit_date_in_future", "Credit date is in the future.", "warning", "creditDate");
    }
  }

  return issues;
}

/**
 * Validate a whole backfill batch.
 *
 * Returns issues rather than throwing, which is the point: the ticket requires
 * a validation summary, and a parser that throws on the first bad row can never
 * produce one.
 */
export function validateBackfillBatch(
  rows: EpfBackfillRow[],
  ctx: {
    establishment: Pick<EpfEstablishment, "dateJoined" | "dateLeft">;
    currentDateKey: string;
    allowOutsidePeriod?: boolean;
  }
): {
  valid: EpfBackfillRow[];
  issuesByMonth: Record<string, EpfContributionIssue[]>;
  errorCount: number;
  warningCount: number;
} {
  const issuesByMonth: Record<string, EpfContributionIssue[]> = {};
  const valid: EpfBackfillRow[] = [];
  let errorCount = 0;
  let warningCount = 0;

  for (const row of rows) {
    const issues = validateEpfContribution(row, ctx);
    if (issues.length > 0) issuesByMonth[row.month] = issues;

    const errors = issues.filter((issue) => issue.severity === "error").length;
    errorCount += errors;
    warningCount += issues.length - errors;
    if (errors === 0) valid.push(row);
  }

  return { valid, issuesByMonth, errorCount, warningCount };
}

type ContributionLike = Pick<
  EpfContribution,
  "employeeShare" | "employerShare" | "epsShare" | "employerEpfShare"
>;

export function summarizeContributions(rows: ContributionLike[]): EpfContributionTotals {
  const totals = rows.reduce(
    (acc, row) => ({
      employee: acc.employee + row.employeeShare,
      employer: acc.employer + row.employerShare,
      eps: acc.eps + row.epsShare,
      employerEpf: acc.employerEpf + row.employerEpfShare,
    }),
    { employee: 0, employer: 0, eps: 0, employerEpf: 0 }
  );

  return {
    employee: roundMoney(totals.employee),
    employer: roundMoney(totals.employer),
    eps: roundMoney(totals.eps),
    employerEpf: roundMoney(totals.employerEpf),
    total: roundMoney(totals.employee + totals.employer),
    epfCredit: roundMoney(totals.employee + totals.employerEpf),
    count: rows.length,
  };
}

export interface EpfFinancialYearGroup<T> {
  financialYear: string;
  rows: T[];
  totals: EpfContributionTotals;
  missingMonths: string[];
  expectedCount: number;
}

/** Group rows into financial years, newest first, with per-year totals. */
export function groupContributionsByFinancialYear<
  T extends ContributionLike & { month: string },
>(rows: T[], expectedMonths: string[] = []): EpfFinancialYearGroup<T>[] {
  const byYear = new Map<string, T[]>();
  for (const row of rows) {
    const fy = financialYearOfMonth(row.month);
    const bucket = byYear.get(fy);
    if (bucket) bucket.push(row);
    else byYear.set(fy, [row]);
  }

  const expectedByYear = new Map<string, string[]>();
  for (const month of expectedMonths) {
    const fy = financialYearOfMonth(month);
    const bucket = expectedByYear.get(fy);
    if (bucket) bucket.push(month);
    else expectedByYear.set(fy, [month]);
  }

  const years = new Set([...byYear.keys(), ...expectedByYear.keys()]);

  return [...years]
    .sort((a, b) => compareFinancialYears(b, a))
    .map((financialYear) => {
      const yearRows = (byYear.get(financialYear) ?? []).sort((a, b) =>
        a.month < b.month ? -1 : 1
      );
      const expected = expectedByYear.get(financialYear) ?? [];
      return {
        financialYear,
        rows: yearRows,
        totals: summarizeContributions(yearRows),
        missingMonths: findMissingMonths(expected, yearRows),
        expectedCount: expected.length,
      };
    });
}

export function findMissingMonths(
  expectedMonths: string[],
  rows: { month: string }[]
): string[] {
  const present = new Set(rows.map((row) => row.month));
  return expectedMonths.filter((month) => !present.has(month));
}

/** Months appearing more than once for the same establishment. Should always be empty. */
export function findDuplicateMonths(
  rows: { establishmentId: string; month: string }[]
): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const row of rows) {
    const key = contributionDocId(row.establishmentId, row.month);
    if (seen.has(key)) duplicates.add(row.month);
    else seen.add(key);
  }
  return [...duplicates];
}

export function backfillProgress(
  expectedMonths: string[],
  rows: { month: string }[]
): { filled: number; expected: number; pct: number } {
  const expected = expectedMonths.length;
  const filled = expected - findMissingMonths(expectedMonths, rows).length;
  return { filled, expected, pct: expected === 0 ? 0 : Math.round((filled / expected) * 100) };
}

/**
 * Whether a row may be touched by the future automated processor (KAN-67/68).
 *
 * Shipped and tested here, before the processor exists, so the ticket's
 * "historical records never enter the future cron queue" criterion is provable
 * today: the tests assert this returns false for every row KAN-66 can write.
 */
export function isEligibleForAutomatedProcessing(
  row: Pick<EpfContribution, "source" | "status" | "month">,
  currentMonth: string
): boolean {
  if (row.source === "manualHistorical" || row.source === "imported") return false;
  if (row.status === "draft") return false;
  return row.month >= currentMonth;
}

/** Single source of truth for row chips, so components never branch on status. */
export function contributionStatusMeta(
  status: EpfContributionStatus,
  source: EpfContributionSource
): { label: string; tone: "neutral" | "success" | "warning" | "info"; simulated: boolean } {
  if (source === "simulated") {
    return { label: "Projected", tone: "info", simulated: true };
  }
  switch (status) {
    case "draft":
      return { label: "Draft", tone: "warning", simulated: false };
    case "credited":
      return { label: "Credited", tone: "success", simulated: false };
    case "missed":
      return { label: "Missed", tone: "warning", simulated: false };
    case "partial":
      return { label: "Partial", tone: "warning", simulated: false };
    case "reversed":
      return { label: "Reversed", tone: "warning", simulated: false };
    case "expected":
      return { label: "Expected", tone: "info", simulated: true };
    default:
      return { label: "Manual", tone: "neutral", simulated: false };
  }
}

/** True when stored amounts diverge from what the wage would produce. */
export function isOverridden(
  row: Pick<EpfBackfillRow, "employeeShare" | "employerShare" | "epsShare">,
  computed: EpfContributionComputation
): boolean {
  return (
    row.employeeShare !== computed.employeeShare ||
    row.employerShare !== computed.employerShare ||
    row.epsShare !== computed.epsShare
  );
}

export function sortContributionsByMonth<T extends { month: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
}
