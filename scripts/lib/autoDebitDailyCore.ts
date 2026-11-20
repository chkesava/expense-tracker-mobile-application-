/**
 * SPENDLY-796 (epic SPENDLY-793; epic 735 rule: the app only delivers): which
 * paying accounts can't cover their coming auto-debits. The result is stored at
 * `users/{uid}/serverResults/autoDebitShortfall`.
 *
 * - The numbers come from the shared pure engine, unchanged:
 *   `computeAutoDebitShortfall` (shared/utils/autoDebitShortfall.ts).
 * - The inputs are read from Firestore, never from the copy (R4.3a).
 * - "Today" is the user's own day, from their settings timezone.
 * - The result is derived whole, and only written when it differs from the
 *   stored one. It is written each new day, since the lead windows move.
 * - A user with nothing to check and nothing stored gets no document.
 * - Alerts only: no balance, transaction or bill is ever written.
 *
 * It runs:
 * - on the Worker's daily 03:00 UTC tick, for every user;
 * - in queue mode after an app save to a subscription, account, card bill or
 *   group fund (supabase-readmodel migration 20261121000000), for the queued
 *   users only.
 *
 * Pure; Firestore comes in as ports.
 */

import type { Account, AccountType } from "../../shared/types/expense";
import type { CreditCardBill } from "../../shared/types/creditCardBill";
import type { Subscription } from "../../shared/types/subscription";
import { computeAutoDebitShortfall } from "../../shared/utils/autoDebitShortfall";
import { formatDateKey, isValidTimeZone } from "../../shared/utils/dates";
import { isDuressUid } from "../../shared/utils/duress";
import { DEFAULT_LOW_BALANCE_LEAD_DAYS, isValidLeadDays } from "../../shared/utils/lowBalanceAlerts";
import {
  AUTO_DEBIT_SHORTFALL_DOC,
  SERVER_RESULTS_COLLECTION,
  SERVER_RESULTS_VERSION,
  autoDebitShortfallDocData,
} from "../../shared/utils/serverResults";
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

export const JOB_NAME = "autodebit-daily";
export const DEFAULT_TIME_ZONE = "Asia/Kolkata";

export type AutoDebitUserData = {
  /** The user's settings timezone and default lead days (raw, validated here). */
  settings: { timezone?: unknown; defaultLeadDays?: unknown };
  subscriptions: Subscription[];
  accounts: Account[];
  accountTypes: AccountType[];
  /** Open card bills (not PAID or CANCELLED). */
  creditCardBills: CreditCardBill[];
  groupFunds: { heldByAccount?: Record<string, number> | null }[];
  /** `serverResults/autoDebitShortfall` as stored, or null. */
  stored: Record<string, unknown> | null;
};

export type AutoDebitDailyPorts = {
  /** Every user who might have auto-debits, or a stored result to clear. */
  listOwners(): Promise<string[]>;
  load(uid: string): Promise<AutoDebitUserData>;
  db: JobDb;
  stamp: () => unknown;
};

export const autoDebitShortfallPath = (uid: string) => `users/${uid}/${SERVER_RESULTS_COLLECTION}/${AUTO_DEBIT_SHORTFALL_DOC}`;

/** Key order doesn't matter: Firestore maps don't keep it. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** The user's calendar day, or null when their timezone is invalid. */
export function userToday(now: Date, timezone: unknown): string | null {
  const tz = typeof timezone === "string" && timezone ? timezone : DEFAULT_TIME_ZONE;
  return isValidTimeZone(tz) ? formatDateKey(now, tz) : null;
}

export type AutoDebitPlan = {
  writes: JobWrite[];
  accounts: number;
  hasShortfall: boolean;
  invalidTimeZone?: true;
};

/** The result write for this user, or none when the stored one already agrees. */
export function planAutoDebitWrites(uid: string, data: AutoDebitUserData, now: Date, runId: string): AutoDebitPlan {
  const today = userToday(now, data.settings.timezone);
  if (!today) return { writes: [], accounts: 0, hasShortfall: false, invalidTimeZone: true };
  const result = computeAutoDebitShortfall({
    today,
    subscriptions: data.subscriptions,
    accounts: data.accounts,
    accountTypeNames: Object.fromEntries(data.accountTypes.map((t) => [t.id, t.name])),
    creditCardBills: data.creditCardBills,
    groupFunds: data.groupFunds,
    defaultLeadDays: isValidLeadDays(data.settings.defaultLeadDays) ? data.settings.defaultLeadDays : DEFAULT_LOW_BALANCE_LEAD_DAYS,
  });
  const stored = data.stored;
  const summary = { accounts: result.accounts.length, hasShortfall: result.hasShortfall };
  if (!stored && result.accounts.length === 0) return { writes: [], ...summary };
  if (
    stored &&
    stored.version === SERVER_RESULTS_VERSION &&
    stored.engineVersion === result.engineVersion &&
    stored.today === result.today &&
    stored.hasShortfall === result.hasShortfall &&
    stable(stored.accounts ?? []) === stable(result.accounts)
  ) {
    return { writes: [], ...summary };
  }
  const doc = autoDebitShortfallDocData(result, { runId, inputsSyncedAt: null, version: SERVER_RESULTS_VERSION });
  // Merged so createdAt survives; every field is a scalar or a whole array, so nothing stale is left behind.
  return {
    writes: [{ kind: "set", path: autoDebitShortfallPath(uid), data: doc, merge: true, stampCreatedAt: !stored }],
    ...summary,
  };
}

export async function runAutoDebitDaily(opts: {
  ports: AutoDebitDailyPorts;
  now: Date;
  dryRun: boolean;
  budget: ReadBudget;
  push: JobPush | null;
  log: (line: string) => void;
  /** Queue mode: only these users. */
  onlyUids?: string[];
  /** Accumulate into this summary (queue mode runs several rounds). */
  summary?: DailyJobSummary;
}): Promise<DailyJobSummary> {
  const { ports, budget } = opts;
  const summary = opts.summary ?? newJobSummary(JOB_NAME, opts.dryRun);
  const runId = opts.now.toISOString();
  const owners = opts.onlyUids ?? (await ports.listOwners());
  for (const uid of owners) {
    if (budget.exhausted()) break;
    summary.usersSeen += 1;
    if (isDuressUid(uid)) {
      summary.duressSkipped += 1;
      continue;
    }
    const data = await ports.load(uid);
    if (budget.exhausted()) {
      // Read past the budget: leave this user for the next run.
      bump(summary, "deferredForBudget");
      break;
    }
    const plan = planAutoDebitWrites(uid, data, opts.now, runId);
    if (plan.invalidTimeZone) {
      bump(summary, "invalidTimeZone");
      continue;
    }
    if (plan.hasShortfall) bump(summary, "usersShort");
    if (!plan.writes.length) {
      bump(summary, "unchanged");
      continue;
    }
    const result = await applyJobWrites({ db: ports.db, uid, writes: plan.writes, dryRun: opts.dryRun, stamp: ports.stamp, push: opts.push, log: opts.log });
    recordApply(summary, result, "autodebit user");
    if (result.status === "written" || result.status === "dry-run") {
      bump(summary, "resultsWritten");
      bump(summary, "accountsListed", plan.accounts);
    }
    if (result.status === "conflict") bump(summary, "conflicts");
  }
  return summary;
}

/** The server-only run queue (SPENDLY-737), job 'autodebit-daily'. Never logged. */
export type AutoDebitRunQueue = {
  pending(): Promise<Array<{ uid: string; requestedAt: string }>>;
  /** Clears the user's request unless a newer save re-queued it meanwhile. */
  done(uid: string, requestedAt: string): Promise<void>;
};

export const AUTODEBIT_QUEUE_MAX_ROUNDS = 3;

/**
 * Queue mode: the users the read model queued after an app save, straight from
 * Firestore (the copy can lag the save that queued them). A save during the
 * run re-queues its user with a newer `requestedAt`, so the next round or
 * dispatch takes it.
 */
export async function runAutoDebitQueue(opts: {
  queue: AutoDebitRunQueue;
  ports: AutoDebitDailyPorts;
  now: Date;
  dryRun: boolean;
  budget: ReadBudget;
  push: JobPush | null;
  log: (line: string) => void;
  maxRounds?: number;
}): Promise<DailyJobSummary> {
  const summary = newJobSummary(JOB_NAME, opts.dryRun);
  const rounds = opts.dryRun ? 1 : opts.maxRounds ?? AUTODEBIT_QUEUE_MAX_ROUNDS;
  for (let round = 0; round < rounds; round += 1) {
    if (opts.budget.exhausted()) break;
    const pending = await opts.queue.pending();
    if (!pending.length) break;
    bump(summary, "queueRounds");
    const live = pending.filter((p) => p.uid && !isDuressUid(p.uid));
    bump(summary, "queueUsers", live.length);
    await runAutoDebitDaily({ ...opts, onlyUids: live.map((p) => p.uid), summary });
    if (opts.dryRun) break;
    // Out of budget mid-round: keep every request; the next run serves them (idempotent).
    if (opts.budget.exhausted()) break;
    for (const p of pending) await opts.queue.done(p.uid, p.requestedAt);
  }
  return summary;
}
