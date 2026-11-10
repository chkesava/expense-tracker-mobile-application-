/**
 * SPENDLY-739 (epic SPENDLY-735: the app only delivers) — the daily server job
 * that posts due subscriptions, EMIs and recurring transfers. It replaces the
 * app's launch-time auto-post (`processDueSubscriptions`), so a charge posts on
 * its due day even when nobody opens the app. Pure; Firestore and the read
 * model come in as ports.
 *
 * The app's own rules, unchanged:
 * - `planDueSubscriptionPosts` / `evaluateSubscriptionDue` (shared) decide
 *   what is due, in the user's zone, with the same deterministic charge ids
 *   (`{subscriptionId}_{YYYY-MM}` or `_{YYYY-MM-DD}`), so the job and any app
 *   write land on the same document.
 * - A posted charge moves account balances (`journalBalanceOpsWith`,
 *   SPENDLY-523/603) and its month's dashboard summary (SPENDLY-563), first
 *   write only.
 * - An existing charge is never rewritten (SPENDLY-525): only the
 *   subscription's processed stamp is.
 * - A charge with no account to debit is skipped (SPENDLY-40).
 * - A finished subscription is marked completed.
 *
 * Every charge is one atomic batch through `applyJobWrites`: the charge is a
 * `create` (refused if it exists), and the subscription stamp is an update
 * only if unchanged since read. A refusal writes nothing; the next run decides
 * again on fresh data. Work is found on the read model when it is configured
 * (no Firestore reads for users with nothing due), then confirmed on
 * Firestore (READ_MODEL_RULES R4.3a).
 */

import type { MutationOp } from "../../shared/types/mutations";
import type { Subscription } from "../../shared/types/subscription";
import { computeDashboardExpenseCreateOpsWith } from "../../shared/utils/dashboardMutationsCore";
import { formatDateKey, isValidTimeZone, parseLocalDate } from "../../shared/utils/dates";
import { isDuressUid } from "../../shared/utils/duress";
import type { FieldValueSentinels } from "../../shared/utils/firestoreSentinels";
import { omitUndefined } from "../../shared/utils/firestorePayload";
import { journalBalanceOpsWith, type JournalAccountInfo } from "../../shared/utils/journalBalanceOpsCore";
import { ledgerRowAccountDeltas, type LedgerRow } from "../../shared/utils/ledgerAccountDeltas";
import {
  duePostNeedsAccount,
  evaluateSubscriptionDue,
  planDueSubscriptionPosts,
  type DuePostAction,
} from "../../shared/utils/subscriptionProcessor";
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

export type StoredSubscription = { sub: Subscription; updateTime: unknown };

export type SubscriptionDailyPorts = {
  /** Every user with at least one subscription (fallback without the read model). */
  listOwners(): Promise<string[]>;
  settings(uid: string): Promise<{ timezone?: string }>;
  /** The user's subscriptions, server data, with each document's update time. */
  subscriptions(uid: string): Promise<StoredSubscription[]>;
  /** Whether the deterministic charge document already exists. */
  chargeExists(uid: string, kind: DuePostAction["kind"], docId: string): Promise<boolean>;
  /** The accounts a charge moves, as the balance ops need them. */
  accountInfo(uid: string, accountIds: string[]): Promise<Map<string, JournalAccountInfo>>;
  db: JobDb;
  stamp: () => unknown;
  fv: FieldValueSentinels;
};

/** The read model's copy of every user's subscriptions; only says who has work. */
export type ReadModelSubscriptionSource = {
  users(): Promise<Array<{ uid: string; subscriptions: Subscription[] }>>;
  settings(uid: string): Promise<{ timezone?: string }>;
};

/** What the app's auto-post would do for these subscriptions today. */
export function subscriptionWork(subscriptions: Subscription[], evaluationDate: Date): {
  plan: DuePostAction[];
  completes: Subscription[];
} {
  const plan = planDueSubscriptionPosts(subscriptions, evaluationDate);
  const planned = new Set(plan.map((a) => a.subscriptionId));
  const completes = subscriptions.filter(
    (sub) =>
      sub.id &&
      sub.source !== "sms" &&
      !planned.has(sub.id) &&
      !sub.isCompleted &&
      evaluateSubscriptionDue(sub, evaluationDate).isCompleted
  );
  return { plan, completes };
}

/** The user's calendar day in their zone, as the app's `parseLocalDate(todayDateKey(tz))`. */
function evaluationDay(now: Date, timezone: string): { today: string; date: Date } {
  const today = formatDateKey(now, timezone);
  return { today, date: parseLocalDate(today) };
}

/** Users whose copied subscriptions show something due or finished. Never logs a uid. */
export async function findSubscriptionWorkOnReadModel(
  source: ReadModelSubscriptionSource,
  now: Date
): Promise<{ uids: Set<string>; usersSeen: number; failures: number }> {
  const out = { uids: new Set<string>(), usersSeen: 0, failures: 0 };
  for (const { uid, subscriptions } of await source.users()) {
    if (!uid || isDuressUid(uid) || !subscriptions.length) continue;
    out.usersSeen += 1;
    try {
      const timezone = (await source.settings(uid)).timezone || DEFAULT_TIME_ZONE;
      if (!isValidTimeZone(timezone)) continue;
      const { plan, completes } = subscriptionWork(subscriptions, evaluationDay(now, timezone).date);
      if (plan.length || completes.length) out.uids.add(uid);
    } catch {
      out.failures += 1;
    }
  }
  return out;
}

function toJobWrites(ops: MutationOp[]): JobWrite[] {
  return ops.map((op): JobWrite => {
    if (op.op === "set") return { kind: "set", path: op.ref.path, data: op.data as Record<string, unknown>, merge: op.merge };
    if (op.op === "update") return { kind: "update", path: op.ref.path, data: op.data as Record<string, unknown> };
    throw new Error("subscription-daily: unexpected delete op");
  });
}

const subPath = (uid: string, id: string) => `users/${uid}/subscriptions/${id}`;
const chargePath = (uid: string, action: DuePostAction) =>
  `users/${uid}/${action.kind === "transfer" ? "accountTransfers" : "expenses"}/${action.docId}`;

/** The batch for one due charge: as the app's `postDueSubscriptionCharge`, atomic. */
export async function chargeWrites(
  ports: Pick<SubscriptionDailyPorts, "chargeExists" | "accountInfo" | "fv">,
  uid: string,
  action: DuePostAction,
  stored: StoredSubscription,
  today: string
): Promise<{ writes: JobWrite[]; alreadyPosted: boolean }> {
  const alreadyPosted = await ports.chargeExists(uid, action.kind, action.docId);
  const writes: JobWrite[] = [];
  if (!alreadyPosted) {
    const payload = omitUndefined(action.kind === "transfer" ? action.transfer : action.expense) as Record<string, unknown>;
    writes.push({ kind: "create", path: chargePath(uid, action), data: payload });
    const row: LedgerRow =
      action.kind === "transfer"
        ? { kind: "accountTransfer", row: { id: action.docId, ...action.transfer } }
        : { kind: "expense", row: { id: action.docId, ...action.expense } };
    const legs = ledgerRowAccountDeltas(row);
    if (legs.length) {
      const info = await ports.accountInfo(uid, [...new Set(legs.map((l) => l.accountId))]);
      writes.push(...toJobWrites(journalBalanceOpsWith(ports.fv, uid, legs, info, today)));
    }
    if (action.kind === "expense") {
      writes.push(...toJobWrites(computeDashboardExpenseCreateOpsWith(ports.fv, uid, action.expense) as MutationOp[]));
    }
  }
  const stamp: Record<string, unknown> = { lastProcessed: action.monthKey };
  if (action.lastProcessedDate) stamp.lastProcessedDate = action.lastProcessedDate;
  if (action.markCompleted) {
    stamp.isCompleted = true;
    stamp.isActive = false;
  }
  // Only if the subscription is unchanged since read: a plan from stale data
  // must not post (SPENDLY-525). A refusal drops the whole batch.
  writes.push({ kind: "update", path: subPath(uid, action.subscriptionId), data: stamp, lastUpdateTime: stored.updateTime });
  return { writes, alreadyPosted };
}

export async function runSubscriptionDaily(opts: {
  ports: SubscriptionDailyPorts;
  now: Date;
  dryRun: boolean;
  budget: ReadBudget;
  push: JobPush | null;
  log: (line: string) => void;
  /** Users with work on the read model; null scans every owner (fallback). */
  readModel?: { uids: Set<string>; usersSeen: number; failures: number } | null;
}): Promise<DailyJobSummary> {
  const { ports, now, budget } = opts;
  const summary = newJobSummary("subscription-daily", opts.dryRun);
  if (opts.readModel) {
    bump(summary, "readModelUsers", opts.readModel.usersSeen);
    bump(summary, "readModelUsersWithWork", opts.readModel.uids.size);
    if (opts.readModel.failures) bump(summary, "readModelFailures", opts.readModel.failures);
  }
  const owners = opts.readModel ? [...opts.readModel.uids] : await ports.listOwners();

  for (const uid of owners) {
    if (budget.exhausted()) break;
    summary.usersSeen += 1;
    if (isDuressUid(uid)) {
      summary.duressSkipped += 1;
      continue;
    }
    const timezone = (await ports.settings(uid)).timezone || DEFAULT_TIME_ZONE;
    if (!isValidTimeZone(timezone)) {
      bump(summary, "invalidTimeZone");
      summary.failures.push("a user's timezone is invalid; their subscriptions were skipped");
      continue;
    }
    const { today, date } = evaluationDay(now, timezone);
    const stored = await ports.subscriptions(uid);
    const byId = new Map(stored.map((s) => [s.sub.id as string, s]));
    const { plan, completes } = subscriptionWork(
      stored.map((s) => s.sub),
      date
    );
    if (!plan.length && !completes.length) {
      if (opts.readModel) bump(summary, "readModelDisagreed");
      continue;
    }

    for (const action of plan) {
      if (budget.exhausted()) break;
      const s = byId.get(action.subscriptionId);
      if (!s) continue;
      if (duePostNeedsAccount(action)) {
        bump(summary, "skippedNoAccount");
        continue;
      }
      const { writes, alreadyPosted } = await chargeWrites(ports, uid, action, s, today);
      const result = await applyJobWrites({ db: ports.db, uid, writes, dryRun: opts.dryRun, stamp: ports.stamp, push: opts.push, log: opts.log });
      recordApply(summary, result, `subscription ${action.subscriptionId}`);
      if (result.status === "written" || result.status === "dry-run") bump(summary, alreadyPosted ? "alreadyPosted" : "posted");
      if (result.status === "conflict") bump(summary, "conflicts");
    }

    for (const sub of completes) {
      const s = byId.get(sub.id as string);
      if (!s) continue;
      const result = await applyJobWrites({
        db: ports.db,
        uid,
        writes: [{ kind: "update", path: subPath(uid, sub.id as string), data: { isCompleted: true, isActive: false }, lastUpdateTime: s.updateTime }],
        dryRun: opts.dryRun,
        stamp: ports.stamp,
        push: opts.push,
        log: opts.log,
      });
      recordApply(summary, result, `subscription ${sub.id}`);
      if (result.status === "written" || result.status === "dry-run") bump(summary, "completed");
      if (result.status === "conflict") bump(summary, "conflicts");
    }
  }
  return summary;
}
