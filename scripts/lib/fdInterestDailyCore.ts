/**
 * SPENDLY (epic SPENDLY-735: the app only delivers) — daily compounding
 * interest credit for Fixed Deposits / interest-bearing savings. The app
 * already estimates this live (`shared/utils/investmentInterest.ts`); this
 * job is the authoritative, once-a-day poster: it calls the SAME pure
 * `computeInterestValuation` the app uses, for "as of today" and "as of
 * yesterday", and credits the difference. No separate interest formula is
 * ever written here — drift between the live estimate and what gets posted
 * is structurally impossible as long as both call the same function.
 *
 * Interest is reinvested into the FD itself (no money moves to any linked
 * account): the write is a per-day log entry under
 * `investments/{id}/interestCredits/{date}` (doc id = the date, so a rerun
 * the same day overwrites rather than duplicates) plus
 * `lastInterestCreditedDate` on the investment doc.
 */

import type { Investment } from "../../shared/types/investment";
import {
  computeInterestValuation,
  getEffectiveAsOf,
} from "../../shared/utils/investmentInterest";
import { roundMoney } from "../../shared/utils/money";
import { daysBetweenDateKeys, shiftDateKey } from "../../shared/utils/dates";
import {
  applyJobWrites,
  bump,
  newJobSummary,
  recordApply,
  type DailyJobSummary,
  type JobDb,
  type JobPush,
  type JobWrite,
} from "./dailyJobCore";
import type { ReadBudget } from "./pushRunCore";

export type FdDailyPorts = {
  /** Every user with at least one investment. */
  listOwners(): Promise<string[]>;
  /** The user's investments from Firestore, with their Firestore ids. */
  load(uid: string): Promise<Array<{ id: string; data: Investment }>>;
  db: JobDb;
  stamp: () => unknown;
};

function eligible(investment: Investment): boolean {
  return (
    (investment.kind === "fixed_deposit" || investment.kind === "interest_savings") &&
    investment.status === "active" &&
    investment.interestMethod === "compound" &&
    typeof investment.annualInterestRate === "number" &&
    investment.annualInterestRate > 0
  );
}

function valuationAsOf(investment: Investment, asOf: string) {
  return computeInterestValuation(
    investment.principal,
    investment.annualInterestRate as number,
    "compound",
    "daily",
    investment.startDate,
    getEffectiveAsOf(investment, asOf),
    investment.maturityDate
  );
}

/**
 * A run normally finds yesterday already credited and posts just today. If
 * the job was paused or missed days, this recovers each missed date instead
 * of silently folding the gap into one lump "today" entry, so the per-day
 * log has no holes. Capped per investment (JOB_BATCH_LIMIT is a shared,
 * per-user ceiling across every investment's writes in the same call).
 */
const MAX_BACKFILL_DAYS = 60;

/**
 * What today's run would write for one user: one `interestCredits/{date}`
 * log entry per day the FD grew since it was last credited (capped — see
 * `MAX_BACKFILL_DAYS`), and one `lastInterestCreditedDate` update per FD.
 * Pure — no Firestore/env imports — so every rule here is provable in Vitest.
 */
export function planFdInterestWrites(
  uid: string,
  investments: Array<{ id: string; data: Investment }>,
  today: string
): { writes: JobWrite[]; credited: number } {
  const writes: JobWrite[] = [];
  let credited = 0;

  for (const { id, data: investment } of investments) {
    if (!eligible(investment)) continue;
    if (today < investment.startDate) continue;

    const lastCredited =
      investment.lastInterestCreditedDate && investment.lastInterestCreditedDate >= investment.startDate
        ? investment.lastInterestCreditedDate
        : investment.startDate;
    const daysBehind = daysBetweenDateKeys(lastCredited, today);
    if (daysBehind <= 0) continue;

    const firstMissedDate = shiftDateKey(
      lastCredited,
      Math.max(1, daysBehind - MAX_BACKFILL_DAYS + 1)
    );

    let date = firstMissedDate;
    let previousValuation = valuationAsOf(investment, shiftDateKey(date, -1));
    let lastWrittenDate: string | null = null;
    while (date <= today) {
      const valuation = valuationAsOf(investment, date);
      const amount = roundMoney(valuation.totalValue - previousValuation.totalValue);
      if (amount > 0) {
        writes.push({
          kind: "set",
          path: `users/${uid}/investments/${id}/interestCredits/${date}`,
          data: {
            date,
            amount,
            balanceAfter: roundMoney(valuation.totalValue),
          },
          merge: true,
          stampCreatedAt: true,
        });
        lastWrittenDate = date;
      }
      previousValuation = valuation;
      date = shiftDateKey(date, 1);
    }

    if (lastWrittenDate) {
      writes.push({
        kind: "update",
        path: `users/${uid}/investments/${id}`,
        data: { lastInterestCreditedDate: lastWrittenDate },
      });
      credited += 1;
    }
  }

  return { writes, credited };
}

export async function runFdInterestDaily(opts: {
  ports: FdDailyPorts;
  today: string;
  dryRun: boolean;
  budget: ReadBudget;
  push: JobPush | null;
  log: (line: string) => void;
}): Promise<DailyJobSummary> {
  const summary = newJobSummary("fd-interest-daily", opts.dryRun);
  const owners = await opts.ports.listOwners();
  for (const uid of owners) {
    if (opts.budget.exhausted()) break;
    summary.usersSeen += 1;
    const investments = await opts.ports.load(uid);
    const plan = planFdInterestWrites(uid, investments, opts.today);
    if (!plan.writes.length) continue;
    const result = await applyJobWrites({
      db: opts.ports.db,
      uid,
      writes: plan.writes,
      dryRun: opts.dryRun,
      stamp: opts.ports.stamp,
      push: opts.push,
      log: opts.log,
    });
    recordApply(summary, result, "fd interest user");
    if (result.status === "written" || result.status === "dry-run") {
      bump(summary, "fdsCredited", plan.credited);
    }
    if (result.status === "conflict") bump(summary, "conflicts");
  }
  return summary;
}
