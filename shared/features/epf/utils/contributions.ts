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
import type { EpfMonthState } from "@/shared/features/epf/utils/monthState";
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

/**
 * Contribution statuses that have actually added money to the fund.
 *
 * One definition — SPENDLY-69. Balance, interest and the portfolio each kept a
 * private copy of this list, and History ignored it entirely, so a stored draft
 * month inflated the History headline above the balance it was meant to match.
 */
export const BALANCE_BEARING_STATUSES: EpfContributionStatus[] = [
  "credited",
  "partial",
  "confirmed",
];

export function isBalanceBearing(status: EpfContributionStatus): boolean {
  return BALANCE_BEARING_STATUSES.includes(status);
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
 * The two derived totals, from the three shares — KAN-73.
 *
 * `totalContribution` is everything both parties paid; `epfCredit` is only what
 * reaches the PF balance, because the EPS slice is pension and never lands
 * there. They are different numbers and conflating them overstates a balance.
 *
 * This existed inline in three places, and the copy in
 * `EpfContributionEditSheet` omitted `roundMoney`, so a hand-edited month could
 * store 3600.3000000000002 where every generated month stored 3600.3.
 */
export function contributionTotals(shares: {
  employeeShare: number;
  employerShare: number;
  employerEpfShare: number;
}): { totalContribution: number; epfCredit: number } {
  return {
    totalContribution: roundMoney(shares.employeeShare + shares.employerShare),
    epfCredit: roundMoney(shares.employeeShare + shares.employerEpfShare),
  };
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
    ...contributionTotals({ employeeShare, employerShare, employerEpfShare }),
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
    ...contributionTotals({ employeeShare, employerShare, employerEpfShare }),
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
    // KAN-67/68 lifecycle fields. These were absent until SPENDLY-1: the write
    // path stored them but this reader dropped them, so `isCreditWindowPassed`
    // never fired and `isReconciled` was permanently false — auto-credit was
    // inert and every reconciled month rendered as a projection.
    expectedCreditFrom: str(raw.expectedCreditFrom),
    expectedCreditTo: str(raw.expectedCreditTo),
    // Deliberately not `num()`: that coerces absent to 0, and 0 is a meaningful
    // `creditedAmount` (`applyMissed` sets it). Collapsing the two would make
    // `epfPortfolioSummary` take its ratio branch with a zero numerator for
    // every row and zero out the employee/employer split.
    creditedAmount:
      typeof raw.creditedAmount === "number" && Number.isFinite(raw.creditedAmount)
        ? raw.creditedAmount
        : undefined,
    reconciledAt: str(raw.reconciledAt),
    statusReason: str(raw.statusReason),
    statusUpdatedAt: raw.statusUpdatedAt,
    archived: raw.archived === true ? true : undefined,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

/**
 * The stored shape of a contribution — SPENDLY-1.
 *
 * Lives here rather than inline in `useEpfContributions.saveContributions`
 * because `vitest.config.ts` never collects `hooks/**`. An inline field list in
 * a hook is a field list nobody tests, which is precisely how
 * `expectedCreditFrom`/`expectedCreditTo` came to be computed and then silently
 * dropped on write.
 *
 * Timestamps are the caller's job: this tree must not import Firebase, so
 * `serverTimestamp()` is merged in by the hook.
 */
export function contributionWritePayload(
  row: EpfBackfillRow,
  opts: { status: EpfContributionStatus; establishmentId: string }
): Record<string, unknown> {
  return {
    establishmentId: opts.establishmentId,
    month: row.month,
    wage: row.wage,
    employeeShare: row.employeeShare,
    employerShare: row.employerShare,
    epsShare: row.epsShare,
    employerEpfShare: row.employerEpfShare,
    totalContribution: row.totalContribution,
    epfCredit: row.epfCredit,
    status: opts.status,
    source: row.source,
    overridden: row.overridden || undefined,
    partialMonth: row.partialMonth || undefined,
    epsEligible: row.epsEligible,
    rulesVersion: row.rulesVersion,
    expectedCreditFrom: row.expectedCreditFrom || undefined,
    expectedCreditTo: row.expectedCreditTo || undefined,
    creditDate: row.creditDate || undefined,
    creditedAmount: row.creditedAmount,
    reconciledAt: row.reconciledAt || undefined,
    statusReason: row.statusReason || undefined,
    archived: row.archived || undefined,
    reference: row.reference || undefined,
    notes: row.notes || undefined,
    zeroReason: row.zeroReason || undefined,
  };
}

/**
 * The rows the backfill screen renders.
 *
 * Months are generated in memory; only rows the user fills are ever written, so
 * a collection never accumulates empty placeholders.
 *
 * Precedence (SPENDLY-68): any existing Firestore contribution for the month is
 * authoritative — including full leave-month remittances that do not match a
 * calendar prorate. Wage + optional join/leave prorating are suggestions only
 * for months that have no document yet. `overridden` still marks hand-edited
 * share splits; it is no longer the only protection against regeneration.
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
    if (saved) {
      return { ...saved, persisted: true };
    }

    const partial =
      args.prorateEdgeMonths !== false &&
      isPartialMonth(month, args.establishment.dateJoined, args.establishment.dateLeft);
    const baseWage = args.wage || 0;
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
      epsEligible: args.epsEligible,
    });

    return {
      establishmentId: args.establishment.id,
      month,
      ...computed,
      status: "draft",
      source: "manualHistorical",
      partialMonth: partial || undefined,
      persisted: false,
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

/**
 * The employee/employer split of what actually reached EPF for one month.
 *
 * A reconciled month can differ from the projection, and the parts have to
 * keep summing to the whole, so the split is scaled by the same ratio — the
 * convention `epfPortfolioSummary` established in KAN-71, extracted here in
 * SPENDLY-72 so the two cannot drift.
 *
 * EPS is never scaled: the pension slice went where it went regardless of what
 * reached the PF balance, and it is not part of `epfCredit` either way.
 */
export function creditedSplit(
  row: Pick<ContributionLike, "employeeShare" | "employerEpfShare"> & {
    epfCredit?: number;
    creditedAmount?: number;
  }
): { employee: number; employerEpf: number } {
  if (row.creditedAmount === undefined || !row.epfCredit || row.epfCredit <= 0) {
    return { employee: row.employeeShare, employerEpf: row.employerEpfShare };
  }
  const ratio = row.creditedAmount / row.epfCredit;
  return {
    employee: row.employeeShare * ratio,
    employerEpf: row.employerEpfShare * ratio,
  };
}

/**
 * Totals for a set of rows.
 *
 * `epfCredit` is what actually landed where that is known — SPENDLY-72. It
 * used to sum the projections, so a `partial` month headlined its full
 * expected amount on History and Backfill while Balance, interest and the
 * portfolio all counted the shortfall. Four screens, two answers.
 *
 * `total` stays unscaled: that is the payslip view — what employee and
 * employer were billed — and it is true whatever later reached the fund.
 */
export function summarizeContributions(rows: ContributionLike[]): EpfContributionTotals {
  const totals = rows.reduce(
    (acc, row) => {
      const split = creditedSplit(row);
      return {
        employee: acc.employee + split.employee,
        employer: acc.employer + row.employerShare,
        eps: acc.eps + row.epsShare,
        employerEpf: acc.employerEpf + split.employerEpf,
      };
    },
    { employee: 0, employer: 0, eps: 0, employerEpf: 0 }
  );

  return {
    employee: roundMoney(totals.employee),
    employer: roundMoney(totals.employer),
    eps: roundMoney(totals.eps),
    employerEpf: roundMoney(totals.employerEpf),
    total: roundMoney(
      rows.reduce((acc, row) => acc + row.employeeShare + row.employerShare, 0)
    ),
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
 * Whether a row may be touched by the automated processor (KAN-67/68, SPENDLY-19).
 *
 * Historical records never enter the cron queue: KAN-66 rows are
 * `manualHistorical`/`imported`/`draft`, and any month before `currentMonth` is
 * Backfill's even when the source is `simulated`.
 */
export function isEligibleForAutomatedProcessing(
  row: Pick<EpfContribution, "source" | "status" | "month">,
  currentMonth: string
): boolean {
  if (row.source === "manualHistorical" || row.source === "imported") return false;
  if (row.status === "draft") return false;
  return row.month >= currentMonth;
}

/**
 * Single source of truth for row chips, so components never branch on status.
 *
 * Takes an {@link EpfMonthState}, not a raw status — SPENDLY-72. The stored
 * `expected` reads three ways depending on the calendar, and leaving that to
 * the caller is how the Current tab came to show "Expected" for a month that
 * was months overdue and for one that had not happened yet.
 *
 * `reconciled` distinguishes a month the user confirmed against their passbook
 * from one an older build projected — KAN-68. Spendly cannot see an EPFO
 * account, so an unconfirmed `credited` row must never read as a plain fact.
 * Nothing writes those any more, but data from before SPENDLY-72 can still
 * hold them.
 *
 * `simulated` means "this number is Spendly's arithmetic, not observed money".
 */
export function contributionStatusMeta(
  state: EpfMonthState,
  source: EpfContributionSource,
  opts: { reconciled?: boolean; dueDate?: string } = {}
): { label: string; tone: "neutral" | "success" | "warning" | "info"; simulated: boolean } {
  const due = opts.dueDate;

  switch (state) {
    case "draft":
      return { label: "Draft", tone: "warning", simulated: false };
    case "confirmed":
      // A month the user typed under Backfill. `simulated` source here means a
      // generated row that was saved as history rather than hand-entered.
      return source === "simulated"
        ? { label: "Projected", tone: "info", simulated: true }
        : { label: "Manual", tone: "neutral", simulated: false };
    case "projected":
      return {
        label: due ? `Projected · due ${due}` : "Projected",
        tone: "info",
        simulated: true,
      };
    case "awaiting":
      return {
        label: due ? `Awaiting credit · due ${due}` : "Awaiting credit",
        tone: "info",
        simulated: true,
      };
    case "overdue":
      return {
        label: due ? `Overdue · was due ${due}` : "Overdue",
        tone: "warning",
        simulated: true,
      };
    case "credited":
      return opts.reconciled
        ? { label: "Credited", tone: "success", simulated: false }
        : { label: "Credited · unconfirmed", tone: "info", simulated: true };
    case "partial":
      return { label: "Partial", tone: "warning", simulated: !opts.reconciled };
    case "missed":
      return { label: "Missed", tone: "warning", simulated: false };
    case "reversed":
      return { label: "Reversed", tone: "warning", simulated: false };
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
