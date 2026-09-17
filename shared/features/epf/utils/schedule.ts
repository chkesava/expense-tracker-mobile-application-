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
  isEligibleForAutomatedProcessing,
} from "@/shared/features/epf/utils/contributions";
import { epfCurrentMonth } from "@/shared/features/epf/utils/epfClock";
import { isArchived, isOpenEnded } from "@/shared/features/epf/utils";
import { daysInMonth, isValidMonthKey, shiftMonthKey } from "@/shared/utils/dates";

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
 * EPFO's statutory remittance deadline for a wage month — SPENDLY-72.
 *
 * "Within 15 days of the close of the month": September wages are due by
 * 15 October. This is the date the UI shows and the ticket's acceptance
 * criterion, and it is deliberately the *start* of `expectedCreditWindow` —
 * the rest of that window (to the 25th) is the grace period real employers
 * use, after which a month reads as overdue.
 *
 * Derived from the same effective-dated rule table, so a future change to the
 * deadline moves both the due date and the window together.
 */
export function statutoryDueDate(contributionMonth: string): string {
  return expectedCreditWindow(contributionMonth).from;
}

/**
 * The newest month Backfill may own — SPENDLY-72.
 *
 * Backfill is for history. While employment is live the in-progress month is
 * not history yet: it belongs to Current, as an `expected` row the scheduler
 * generates. Letting Backfill reach it is what produced the reported bug —
 * **Save all** stamped the current month `confirmed`, so it rendered as
 * "Manual" before any credit could possibly have landed, in a status Current
 * had no transition out of.
 *
 * An employment that *ended* this month is different: its final month is
 * history the moment the person left, so it stays backfillable.
 *
 * The joining month is a floor. Someone who started **this** month has no
 * closed month at all, and without the floor Backfill would render nothing —
 * no wage could be entered, so `wageForProjection` would stay at 0 and the
 * scheduler would never generate anything. That first month staying writable
 * is safe now that `confirmed → credited` is legal: it is no longer the dead
 * end it was when this bug was reported.
 */
export function backfillThroughMonth(
  establishment: EpfEstablishment,
  currentMonth: string
): string {
  if (!isOpenEnded(establishment)) return currentMonth;
  const previous = shiftMonthKey(currentMonth, -1);
  const joined = establishment.dateJoined.slice(0, 7);
  return previous < joined ? joined : previous;
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
 * what makes a repeated run a no-op. Archived contribution months stay present
 * (SPENDLY-15): the scheduler must not regenerate a soft-deleted month.
 *
 * The start is *not* `dateJoined`. SPENDLY-19: walking from a 2019 joining date
 * at the 2026 wage produced ~80 `expected/simulated` rows the cron then
 * credited. Historical months are Backfill's job. The floor is the later of
 * the first recorded month, `scheduleFrom`, the month the establishment was
 * created in the app, or `throughMonth` when none of those exist.
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

  const start = scheduleStartMonth({
    establishment,
    existing,
    throughMonth,
  });
  const present = new Set(existing.map((row) => row.month));

  return contributionMonthsFor(establishment, throughMonth).filter((month) => {
    if (month < start) return false;
    if (present.has(month)) return false;
    const owner = selectEstablishmentForMonth(allEstablishments, month);
    return owner?.id === establishment.id;
  });
}

/**
 * First month the automated scheduler may invent — SPENDLY-19.
 *
 * Later of the recorded/app-side bounds, never earlier than `dateJoined`
 * (employment cannot contribute before it exists). When the establishment was
 * added without `scheduleFrom`/`createdAt` and has no rows yet, the floor is
 * `throughMonth` so a forged 2019 joining date still only generates today.
 */
export function scheduleStartMonth(args: {
  establishment: Pick<EpfEstablishment, "dateJoined" | "scheduleFrom" | "createdAt">;
  existing: Pick<EpfContribution, "month">[];
  throughMonth: string;
}): string {
  const floors: string[] = [];
  if (isValidMonthKey(args.establishment.scheduleFrom ?? "")) {
    floors.push(args.establishment.scheduleFrom as string);
  }
  const created = monthKeyFromTimestamp(args.establishment.createdAt);
  if (created) floors.push(created);
  const firstRecorded = args.existing
    .map((row) => row.month)
    .filter(isValidMonthKey)
    .sort()[0];
  if (firstRecorded) floors.push(firstRecorded);
  if (floors.length === 0 && isValidMonthKey(args.throughMonth)) {
    floors.push(args.throughMonth);
  }

  const floor = floors.reduce((latest, month) => (month > latest ? month : latest), floors[0] ?? args.throughMonth);
  const joined = args.establishment.dateJoined.slice(0, 7);
  if (isValidMonthKey(joined) && joined > floor) return joined;
  return floor;
}

/** IST YYYY-MM from a Firestore Timestamp, Date, epoch, or ISO string. */
export function monthKeyFromTimestamp(value: unknown): string | undefined {
  const date = dateFromUnknown(value);
  if (!date) return undefined;
  return epfCurrentMonth(date);
}

function dateFromUnknown(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  if (typeof value === "string" && value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  if (typeof value === "object" && value) {
    const obj = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof obj.toDate === "function") {
      try {
        const date = obj.toDate();
        return date instanceof Date && !Number.isNaN(date.getTime()) ? date : undefined;
      } catch {
        return undefined;
      }
    }
    const seconds = obj.seconds ?? obj._seconds;
    if (typeof seconds === "number" && Number.isFinite(seconds)) {
      const date = new Date(seconds * 1000);
      return Number.isNaN(date.getTime()) ? undefined : date;
    }
  }
  return undefined;
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
 *
 * SPENDLY-19: `isEligibleForAutomatedProcessing` is the write gate. A missing
 * 2019 month is still listed by a loose `monthsToGenerate` floor (old
 * `createdAt`), but it is history — Backfill owns it. Only the current month
 * may be minted as `expected/simulated`. Existing rows are never deleted here.
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
    .filter((month) => {
      const existing = byMonth.get(month);
      if (existing) {
        return (
          canOverwriteWithSimulated(existing) &&
          isEligibleForAutomatedProcessing(existing, args.throughMonth)
        );
      }
      return isEligibleForAutomatedProcessing(
        { source: "simulated", status: "expected", month },
        args.throughMonth
      );
    })
    .map((month) =>
      buildExpectedContribution({
        establishment: args.establishment,
        month,
        wage,
      })
    );
}

/**
 * Simulated rows a user should review against the passbook — SPENDLY-19.
 *
 * Flag only. The scheduler must not auto-delete already-generated history;
 * replacing those months is a Backfill action the user chooses.
 *
 * `source: "simulated" && month < firstManualMonth`, or every past simulated
 * month when the user has not recorded a manual/imported row yet.
 */
export function simulatedMonthsNeedingReview(
  existing: Pick<EpfContribution, "month" | "source">[],
  currentMonth: string
): Pick<EpfContribution, "month" | "source">[] {
  const firstManual = existing
    .filter((row) => row.source === "manualHistorical" || row.source === "imported")
    .map((row) => row.month)
    .filter(isValidMonthKey)
    .sort()[0];
  const cutoff = firstManual ?? currentMonth;
  return existing.filter((row) => row.source === "simulated" && row.month < cutoff);
}

/** Establishments the scheduled job should consider at all. */
export function isSchedulable(establishment: EpfEstablishment): boolean {
  return !isArchived(establishment) && isOpenEnded(establishment);
}
