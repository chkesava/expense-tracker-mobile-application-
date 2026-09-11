/**
 * Forward contribution scheduling — KAN-67.
 *
 * Every decision the monthly job makes lives here, so the Netlify function and
 * the client-side catch-up call the *same* code and cannot drift. The function
 * handler is not reachable by `npm test` (`netlify/functions/**` is outside
 * `vitest.config.ts`), which is exactly why it must stay a thin shell over this
 * module.
 *
 * No React, no Firebase — `tsconfig.shared.json` compiles this tree alone.
 */

import { findEpfCreditWindowRule } from "@/shared/features/epf/data/epfCreditWindow";
import type {
  EpfBackfillRow,
  EpfContribution,
  EpfEstablishment,
} from "@/shared/features/epf/types";
import {
  computeEpfContribution,
  contributionMonthsFor,
} from "@/shared/features/epf/utils/contributions";
import { isArchived, isOpenEnded } from "@/shared/features/epf/utils";
import { daysInMonth, shiftMonthKey } from "@/shared/utils/dates";

/** Sources the automated processor must never overwrite. */
const PROTECTED_SOURCES = new Set(["manualHistorical", "imported"]);

export interface EpfCreditWindow {
  /** YYYY-MM-DD in the month after the contribution month. */
  from: string;
  /** YYYY-MM-DD in the month after the contribution month. */
  to: string;
}

/**
 * When an August contribution is expected to be credited: a window in
 * September. Days are clamped to the length of that month, so a `dayTo` of 31
 * resolves to the 30th in a 30-day month rather than an impossible date.
 */
export function expectedCreditWindow(contributionMonth: string): EpfCreditWindow {
  const rule = findEpfCreditWindowRule(contributionMonth);
  const creditMonth = shiftMonthKey(contributionMonth, 1);
  const lastDay = daysInMonth(
    Number(creditMonth.slice(0, 4)),
    Number(creditMonth.slice(5, 7)) - 1
  );

  const clamp = (day: number) => String(Math.min(Math.max(day, 1), lastDay)).padStart(2, "0");
  return {
    from: `${creditMonth}-${clamp(rule.dayFrom)}`,
    to: `${creditMonth}-${clamp(rule.dayTo)}`,
  };
}

/**
 * The establishment that owns a given contribution month.
 *
 * This is the ticket's job-change rule. If A's last working month is August and
 * B joins in September, August belongs to A and September to B — so the
 * processor must never create a September row for A.
 *
 * Archived establishments are history and never own a month. Where two
 * establishments somehow both cover a month (KAN-65 prevents this for open
 * employments, but historical data can be messy), the one that joined later
 * wins — that is the job someone actually moved to.
 */
export function selectEstablishmentForMonth(
  establishments: EpfEstablishment[],
  month: string
): EpfEstablishment | null {
  const candidates = establishments.filter((establishment) => {
    if (isArchived(establishment)) return false;
    const joinedMonth = establishment.dateJoined.slice(0, 7);
    if (month < joinedMonth) return false;
    const leftMonth = establishment.dateLeft?.slice(0, 7);
    if (leftMonth && month > leftMonth) return false;
    return true;
  });

  if (candidates.length === 0) return null;
  return candidates.reduce((latest, candidate) =>
    candidate.dateJoined > latest.dateJoined ? candidate : latest
  );
}

/**
 * Months the processor still owes for one establishment.
 *
 * Bounded at both ends by the employment period and at the top by
 * `throughMonth` (normally the current month, so a future month is never
 * invented). A month is skipped when a record already exists for it — which is
 * what makes a repeated run a no-op.
 *
 * `establishments` is the full live set, so the job-change rule can be applied:
 * a month this establishment covers but a later one owns is not generated here.
 */
export function monthsToGenerate(args: {
  establishment: EpfEstablishment;
  allEstablishments: EpfEstablishment[];
  existing: Pick<EpfContribution, "month">[];
  throughMonth: string;
}): string[] {
  const { establishment, allEstablishments, existing, throughMonth } = args;
  if (isArchived(establishment)) return [];

  const present = new Set(existing.map((row) => row.month));

  return contributionMonthsFor(establishment, throughMonth).filter((month) => {
    if (present.has(month)) return false;
    const owner = selectEstablishmentForMonth(allEstablishments, month);
    return owner?.id === establishment.id;
  });
}

/**
 * The wage to project a future month from.
 *
 * Uses the most recently recorded month's wage. Returns 0 when there is
 * nothing to go on — the caller then writes nothing rather than inventing a
 * number, because a fabricated contribution is worse than a missing one.
 */
export function wageForProjection(existing: Pick<EpfContribution, "month" | "wage">[]): number {
  const withWage = existing.filter((row) => row.wage > 0);
  if (withWage.length === 0) return 0;
  return withWage.reduce((latest, row) => (row.month > latest.month ? row : latest)).wage;
}

/** An `expected` row for a month the user has not recorded yet. */
export function buildExpectedContribution(args: {
  establishment: EpfEstablishment;
  month: string;
  wage: number;
}): EpfBackfillRow {
  const epsEligible = args.establishment.epsMember !== false;
  const computed = computeEpfContribution({
    wage: args.wage,
    month: args.month,
    epsEligible,
  });
  const window = expectedCreditWindow(args.month);

  return {
    establishmentId: args.establishment.id,
    month: args.month,
    ...computed,
    status: "expected",
    source: "simulated",
    expectedCreditFrom: window.from,
    expectedCreditTo: window.to,
    persisted: false,
  };
}

/**
 * Whether the automated processor may write over an existing record.
 *
 * The contract inherited from KAN-66: a month the user entered by hand is
 * theirs. Any establishment is backfillable, so a current employer's months may
 * already exist before this job first runs.
 */
export function canOverwriteWithSimulated(
  existing: Pick<EpfContribution, "source"> | undefined
): boolean {
  if (!existing) return true;
  return !PROTECTED_SOURCES.has(existing.source);
}

/**
 * Everything one establishment needs written this run.
 *
 * The single entry point for both the Netlify function and the client catch-up.
 * Returns [] when there is no wage to project from.
 */
export function planScheduledContributions(args: {
  establishment: EpfEstablishment;
  allEstablishments: EpfEstablishment[];
  existing: EpfContribution[];
  throughMonth: string;
}): EpfBackfillRow[] {
  const wage = wageForProjection(args.existing);
  if (wage <= 0) return [];

  const byMonth = new Map(args.existing.map((row) => [row.month, row]));

  return monthsToGenerate({
    establishment: args.establishment,
    allEstablishments: args.allEstablishments,
    existing: args.existing,
    throughMonth: args.throughMonth,
  })
    .filter((month) => canOverwriteWithSimulated(byMonth.get(month)))
    .map((month) =>
      buildExpectedContribution({
        establishment: args.establishment,
        month,
        wage,
      })
    );
}

/** Establishments the scheduled job should consider at all. */
export function isSchedulable(establishment: EpfEstablishment): boolean {
  return !isArchived(establishment) && isOpenEnded(establishment);
}
