/**
 * SPENDLY-743 (epic SPENDLY-735: the app only delivers) — two small background
 * passes moved off the phone. Pure; Firestore comes in as ports.
 *
 * - **Accidental account baseline** (SPENDLY-597/603): a `balanceAsOfDate` of
 *   today or later is cleared (`isAccidentalBalanceBaseline`). The app checked
 *   it on every accounts snapshot (FinanceDataProvider).
 * - **Logging streak** (`stats/summary`): the app's `buildLoggingStreakUpdate`
 *   on the user's recent expenses, written only when it changed. The app
 *   wrote it from the dashboard on every expense change. The current streak
 *   counts back from today (or yesterday) to the first gap, so the server
 *   reads a window of recent expenses and widens it until the window holds
 *   that gap: the same number without reading the whole ledger.
 *
 * Onboarding stamps (audit A12) stay in the app: they are UI state written in
 * response to what the user sees, not a background calculation.
 */

import type { Account, Expense } from "../../shared/types/expense";
import { createDefaultUserStats, type UserStats } from "../../shared/types/stats";
import { isAccidentalBalanceBaseline } from "../../shared/utils/accountBaseline";
import { formatDateKey, isValidTimeZone, shiftDateKey } from "../../shared/utils/dates";
import { isDuressUid } from "../../shared/utils/duress";
import { buildLoggingStreakUpdate, computeExpenseStreak } from "../../shared/utils/expenseStreak";
import { isActiveLedgerRow } from "../../shared/utils/ledgerRow";
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

export const DEFAULT_TIME_ZONE = "Asia/Kolkata";
export const STREAK_WINDOW_DAYS = 31;
/** A streak longer than this is still counted; this only bounds the reads. */
export const STREAK_MAX_DAYS = 372;

export type HousekeepingPorts = {
  listOwners(): Promise<string[]>;
  timezone(uid: string): Promise<string | undefined>;
  accounts(uid: string): Promise<Array<{ account: Account; updateTime: unknown }>>;
  stats(uid: string): Promise<UserStats | null>;
  /** Expenses dated on or after `fromKey` (YYYY-MM-DD). */
  expensesSince(uid: string, fromKey: string): Promise<Expense[]>;
  db: JobDb;
  stamp: () => unknown;
};

/** Recent expenses, widened until they hold the gap that ends the current streak. */
export async function streakWindow(ports: Pick<HousekeepingPorts, "expensesSince">, uid: string, today: string): Promise<Expense[]> {
  let days = STREAK_WINDOW_DAYS;
  for (;;) {
    const from = shiftDateKey(today, -days);
    const expenses = (await ports.expensesSince(uid, from)).filter((e) => isActiveLedgerRow(e as { deletedAt?: unknown }));
    const streak = computeExpenseStreak(expenses, today);
    // The streak ends inside the window when it is shorter than the window.
    if (streak < days || days >= STREAK_MAX_DAYS) return expenses;
    days = Math.min(days * 2, STREAK_MAX_DAYS);
  }
}

export function housekeepingWrites(input: {
  uid: string;
  today: string;
  accounts: Array<{ account: Account; updateTime: unknown }>;
  stats: UserStats | null;
  recentExpenses: Expense[];
}): { writes: JobWrite[]; baselinesCleared: number; streakWritten: boolean } {
  const writes: JobWrite[] = [];
  let baselinesCleared = 0;
  for (const { account, updateTime } of input.accounts) {
    if (!account.id || !isAccidentalBalanceBaseline(account.balanceAsOfDate, input.today)) continue;
    writes.push({ kind: "update", path: `users/${input.uid}/accounts/${account.id}`, data: { balanceAsOfDate: null }, lastUpdateTime: updateTime });
    baselinesCleared += 1;
  }
  const update = buildLoggingStreakUpdate(input.stats, input.recentExpenses, input.today, createDefaultUserStats(input.today));
  if (update.shouldPersist) {
    writes.push({
      kind: "set",
      path: `users/${input.uid}/stats/summary`,
      data: (input.stats == null ? update.next : update.persistPatch) as Record<string, unknown>,
      merge: true,
    });
  }
  return { writes, baselinesCleared, streakWritten: update.shouldPersist };
}

export async function runHousekeepingDaily(opts: {
  ports: HousekeepingPorts;
  now: Date;
  dryRun: boolean;
  budget: ReadBudget;
  push: JobPush | null;
  log: (line: string) => void;
}): Promise<DailyJobSummary> {
  const { ports, budget } = opts;
  const summary = newJobSummary("housekeeping-daily", opts.dryRun);
  for (const uid of await ports.listOwners()) {
    if (budget.exhausted()) break;
    summary.usersSeen += 1;
    if (isDuressUid(uid)) {
      summary.duressSkipped += 1;
      continue;
    }
    const timezone = (await ports.timezone(uid)) || DEFAULT_TIME_ZONE;
    if (!isValidTimeZone(timezone)) {
      bump(summary, "invalidTimeZone");
      continue;
    }
    const today = formatDateKey(opts.now, timezone);
    const [accounts, stats, recentExpenses] = await Promise.all([ports.accounts(uid), ports.stats(uid), streakWindow(ports, uid, today)]);
    const plan = housekeepingWrites({ uid, today, accounts, stats, recentExpenses });
    if (!plan.writes.length) continue;
    const result = await applyJobWrites({ db: ports.db, uid, writes: plan.writes, dryRun: opts.dryRun, stamp: ports.stamp, push: opts.push, log: opts.log });
    recordApply(summary, result, "housekeeping user");
    if (result.status === "written" || result.status === "dry-run") {
      bump(summary, "baselinesCleared", plan.baselinesCleared);
      if (plan.streakWritten) bump(summary, "streaksWritten");
    }
    if (result.status === "conflict") bump(summary, "conflicts");
  }
  return summary;
}
