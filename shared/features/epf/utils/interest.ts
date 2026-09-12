/**
 * EPF interest — KAN-70.
 *
 * EPFO accrues interest on the **monthly running balance** and credits the
 * whole year's worth at the end of the financial year:
 *
 *     interest(FY) = Σ over 12 months ( that month's closing balance × rate ÷ 12 )
 *
 * The simpler alternatives all disagree with a passbook. Annual interest on the
 * closing balance understates badly for anyone contributing monthly, because a
 * year of contributions earns for an average of six months rather than none.
 * A simulation that disagrees with the document the user is holding is worse
 * than no simulation, so this does it the real way.
 *
 * Each year's opening balance is the previous year's closing balance
 * *including its interest*, so the years chain — which is why one function
 * produces the whole schedule rather than answering per year.
 *
 * Pure by necessity: `hooks/**` and `components/**` never run under `npm test`.
 */

import { findEpfInterestRate } from "@/shared/features/epf/data/epfInterestRates";
import type {
  EpfContribution,
  EpfInterestEntry,
  EpfInterestYear,
  EpfReconciliation,
  EpfTransfer,
} from "@/shared/features/epf/types";
import {
  financialYearMonths,
  financialYearOfMonth,
} from "@/shared/utils/financialYear";
import { roundMoney } from "@/shared/utils/money";

/** Contribution statuses that have actually added money. Mirrors `establishmentBalance`. */
const BALANCE_BEARING: EpfContribution["status"][] = ["credited", "partial", "confirmed"];

/** Deterministic id — recomputing a year overwrites it rather than duplicating. */
export function interestEntryId(establishmentId: string, financialYear: string): string {
  return `${establishmentId}_${financialYear}`;
}

function contributionAmount(row: EpfContribution): number {
  return row.creditedAmount ?? row.epfCredit;
}

/** Money that landed in a given month, from contributions and settled transfers. */
function movementInMonth(args: {
  month: string;
  contributions: EpfContribution[];
  transfers: EpfTransfer[];
  adjustments: EpfReconciliation[];
  establishmentId: string;
}): number {
  const { month, contributions, transfers, adjustments, establishmentId } = args;

  const contributed = contributions.reduce((total, row) => {
    if (row.establishmentId !== establishmentId) return total;
    if (row.month !== month) return total;
    if (!BALANCE_BEARING.includes(row.status)) return total;
    return total + contributionAmount(row);
  }, 0);

  const moved = transfers.reduce((total, transfer) => {
    if (transfer.status !== "completed") return total;
    if (transfer.date.slice(0, 7) !== month) return total;
    if (transfer.destinationEstablishmentId === establishmentId) return total + transfer.amount;
    if (transfer.sourceEstablishmentId === establishmentId) return total - transfer.amount;
    return total;
  }, 0);

  const adjusted = adjustments.reduce((total, row) => {
    if (row.establishmentId !== establishmentId) return total;
    if (row.date.slice(0, 7) !== month) return total;
    return total + row.adjustmentAmount;
  }, 0);

  return contributed + moved + adjusted;
}

/** Closing balance for each month of a financial year, opening balance carried in. */
export function monthlyClosingBalances(args: {
  financialYear: string;
  openingBalance: number;
  contributions: EpfContribution[];
  transfers: EpfTransfer[];
  adjustments?: EpfReconciliation[];
  establishmentId: string;
}): Record<string, number> {
  const adjustments = args.adjustments ?? [];
  const balances: Record<string, number> = {};
  let running = args.openingBalance;

  for (const month of financialYearMonths(args.financialYear)) {
    running = roundMoney(
      running +
        movementInMonth({
          month,
          contributions: args.contributions,
          transfers: args.transfers,
          adjustments,
          establishmentId: args.establishmentId,
        })
    );
    balances[month] = running;
  }

  return balances;
}

/**
 * One financial year of interest.
 *
 * Returns `rateMissing` rather than zero interest when EPFO has not declared a
 * rate. Those are different facts and the UI must not conflate them — a year
 * shown as earning nothing would be read as a bug or a loss.
 */
export function interestForFinancialYear(args: {
  financialYear: string;
  openingBalance: number;
  contributions: EpfContribution[];
  transfers: EpfTransfer[];
  adjustments?: EpfReconciliation[];
  establishmentId: string;
}): EpfInterestYear {
  const monthlyBalances = monthlyClosingBalances(args);
  const rule = findEpfInterestRate(args.financialYear);

  if (!rule) {
    const lastMonth = financialYearMonths(args.financialYear)[11];
    return {
      financialYear: args.financialYear,
      rate: null,
      openingBalance: args.openingBalance,
      monthlyBalances,
      interest: 0,
      closingBalance: monthlyBalances[lastMonth] ?? args.openingBalance,
      rateMissing: true,
    };
  }

  // Interest accrues on each month's closing balance at one twelfth of the
  // annual rate. A negative balance earns nothing rather than charging.
  const accrued = Object.values(monthlyBalances).reduce(
    (total, balance) => total + Math.max(0, balance) * (rule.rate / 12),
    0
  );
  const interest = roundMoney(accrued);
  const lastMonth = financialYearMonths(args.financialYear)[11];
  const beforeInterest = monthlyBalances[lastMonth] ?? args.openingBalance;

  return {
    financialYear: args.financialYear,
    rate: rule.rate,
    openingBalance: args.openingBalance,
    monthlyBalances,
    interest,
    closingBalance: roundMoney(beforeInterest + interest),
    rateMissing: false,
  };
}

/** The financial years an establishment has any activity in, oldest first. */
export function activeFinancialYears(args: {
  contributions: EpfContribution[];
  transfers: EpfTransfer[];
  establishmentId: string;
  throughFinancialYear: string;
}): string[] {
  const years = new Set<string>();

  for (const row of args.contributions) {
    if (row.establishmentId !== args.establishmentId) continue;
    if (!BALANCE_BEARING.includes(row.status)) continue;
    years.add(financialYearOfMonth(row.month));
  }
  for (const transfer of args.transfers) {
    if (transfer.status !== "completed") continue;
    const involved =
      transfer.sourceEstablishmentId === args.establishmentId ||
      transfer.destinationEstablishmentId === args.establishmentId;
    if (!involved) continue;
    years.add(financialYearOfMonth(transfer.date.slice(0, 7)));
  }

  years.delete("");
  const sorted = [...years].sort();
  if (sorted.length === 0) return [];

  // Fill the gaps: a year with no contributions still earns interest on what
  // was already there, so the chain must not skip it.
  const out: string[] = [];
  let year = Number(sorted[0].slice(0, 4));
  const lastYear = Math.max(
    Number(sorted[sorted.length - 1].slice(0, 4)),
    Number(args.throughFinancialYear.slice(0, 4))
  );
  while (year <= lastYear) {
    out.push(`${year}-${String((year + 1) % 100).padStart(2, "0")}`);
    year += 1;
  }
  return out;
}

/**
 * The whole interest schedule, year by year, each opening where the last closed.
 *
 * Deterministic: the same inputs always produce the same schedule, which is
 * what makes recomputation safe and the ticket's reproducibility requirement
 * satisfiable.
 */
export function interestSchedule(args: {
  contributions: EpfContribution[];
  transfers: EpfTransfer[];
  adjustments?: EpfReconciliation[];
  establishmentId: string;
  throughFinancialYear: string;
}): EpfInterestYear[] {
  const years = activeFinancialYears(args);
  const schedule: EpfInterestYear[] = [];
  let opening = 0;

  for (const financialYear of years) {
    const year = interestForFinancialYear({
      financialYear,
      openingBalance: opening,
      contributions: args.contributions,
      transfers: args.transfers,
      adjustments: args.adjustments,
      establishmentId: args.establishmentId,
    });
    schedule.push(year);
    opening = year.closingBalance;
  }

  return schedule;
}

/** A year of the schedule as a storable entry. Years with no rate are skipped by the caller. */
export function buildInterestEntry(
  establishmentId: string,
  year: EpfInterestYear
): Omit<EpfInterestEntry, "id" | "createdAt" | "updatedAt" | "computedAt"> {
  return {
    establishmentId,
    financialYear: year.financialYear,
    rate: year.rate ?? 0,
    basis: "monthlyRunningBalance",
    openingBalance: year.openingBalance,
    interest: year.interest,
    closingBalance: year.closingBalance,
  };
}

/** Years that should be written: those with a declared rate and non-zero interest. */
export function creditableYears(schedule: EpfInterestYear[]): EpfInterestYear[] {
  return schedule.filter((year) => !year.rateMissing && year.interest > 0);
}

export interface EpfInterestSummary {
  totalInterest: number;
  yearCount: number;
  /** Years where activity exists but EPFO has not declared a rate. */
  missingRateYears: string[];
}

export function summariseInterest(schedule: EpfInterestYear[]): EpfInterestSummary {
  return {
    totalInterest: roundMoney(
      schedule.reduce((total, year) => total + year.interest, 0)
    ),
    yearCount: schedule.filter((year) => year.interest > 0).length,
    missingRateYears: schedule
      .filter((year) => year.rateMissing)
      .map((year) => year.financialYear),
  };
}

/** Tolerant read — a drifted stored shape must not break the ledger. */
export function normalizeInterestEntry(
  id: string,
  raw: Record<string, unknown>
): EpfInterestEntry {
  const num = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) ? value : 0;
  const str = (value: unknown): string => (typeof value === "string" ? value : "");

  return {
    id,
    establishmentId: str(raw.establishmentId),
    financialYear: str(raw.financialYear),
    rate: num(raw.rate),
    basis: "monthlyRunningBalance",
    openingBalance: num(raw.openingBalance),
    interest: num(raw.interest),
    closingBalance: num(raw.closingBalance),
    computedAt: raw.computedAt,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}
