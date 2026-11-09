/**
 * SPENDLY-726 — the daily server SIP run that replaces the legacy site's
 * `sip-execute` cron (SPENDLY-682). Pure; Firestore, prices and the read model
 * come in as ports.
 *
 * Same rules as the app's button (`services/sip/executeSips.ts`), from the
 * same planner (`decideSipRun`), in the user's timezone (SPENDLY-725):
 *
 * - Ids are the app's: `sipTransactions/{sipId}_{scheduledKey}`,
 *   `notifications/n_{sipId}_{scheduledKey}_{kind}`, `virtualPositions/{quoteKey}`.
 *   Never the legacy `virtualPortfolio`.
 * - **No double run.** An execute creates its transaction row (refused if it
 *   exists) in the same atomic batch as the position and the plan totals, so a
 *   rerun, or the app's button racing the job, can't add units twice. A retry
 *   of a failed day replaces the failed row only if it is unchanged since read,
 *   and a position is updated only if unchanged since read; otherwise the
 *   batch is a conflict and nothing is written (the next run decides again).
 * - A quote that can't be fetched records the app's `failed` row and
 *   notification once; later failed retries of the same day write nothing.
 * - Duress trees are skipped; erased accounts have no plans to find.
 */

import type { SipPlan, SipTransactionStatus, VirtualPosition } from "../../shared/features/sip/types";
import {
  applyExecuteToVirtualPosition,
  decideSipRun,
  isSipDue,
  sipScheduledKey,
  sipTransactionId,
  type SipRunOp,
} from "../../shared/features/sip/utils/sipExecution";
import { isDuressUid } from "../../shared/utils/duress";
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

export type DuePlan = { uid: string; plan: SipPlan };
export type StoredDoc<T> = { data: T; updateTime: unknown };

export type SipDailyPorts = {
  /** Active plans with `nextExecutionDate <= nowIso`, across users, after `cursor` (a doc path). */
  listDuePlans(nowIso: string, limit: number, cursor?: string): Promise<{ plans: DuePlan[]; cursor?: string }>;
  /** The user's settings timezone, or undefined. */
  timeZoneOf(uid: string): Promise<string | undefined>;
  readTransaction(uid: string, txId: string): Promise<StoredDoc<{ status?: SipTransactionStatus }> | null>;
  readPosition(uid: string, quoteKey: string): Promise<StoredDoc<VirtualPosition> | null>;
  /** Live price for the plan's asset; undefined when it can't be fetched. */
  price(plan: SipPlan): Promise<number | undefined>;
  db: JobDb;
  stamp: () => unknown;
  increment: (n: number) => unknown;
};

const txPath = (uid: string, id: string) => `users/${uid}/sipTransactions/${id}`;
const planPath = (uid: string, id: string) => `users/${uid}/sipPlans/${id}`;
const positionPath = (uid: string, quoteKey: string) => `users/${uid}/virtualPositions/${quoteKey}`;
const notificationPath = (uid: string, id: string) => `users/${uid}/notifications/${id}`;

/** The batch for one decided op, in the app's document shapes. */
export function sipOpWrites(
  uid: string,
  op: SipRunOp,
  ctx: {
    existingTx: StoredDoc<{ status?: SipTransactionStatus }> | null;
    existingPosition: StoredDoc<VirtualPosition> | null;
    increment: (n: number) => unknown;
  }
): JobWrite[] {
  if (op.kind === "complete") {
    return [{ kind: "update", path: planPath(uid, op.planId), data: { status: "completed" } }];
  }

  if (op.kind === "skip") {
    return [
      {
        kind: "update",
        path: planPath(uid, op.planId),
        data: { skipNextExecution: false, nextExecutionDate: op.nextExecutionDate },
      },
      {
        kind: "set",
        path: notificationPath(uid, op.notificationId),
        stampCreatedAt: true,
        data: {
          id: op.notificationId,
          type: "sip_skipped",
          title: "SIP Skipped",
          body: `Skipped execution for ${op.assetName}`,
          read: false,
          meta: { sipId: op.planId },
        },
      },
    ];
  }

  if (op.kind === "fail") {
    // A failed day already on file: tell the user once, not every retry.
    if (ctx.existingTx?.data.status === "failed") return [];
    return [
      {
        kind: "create",
        path: txPath(uid, op.txId),
        data: {
          id: op.txId,
          sipId: op.planId,
          date: op.scheduledKey,
          assetType: op.assetType,
          symbol: op.symbol,
          quoteKey: op.quoteKey,
          assetName: op.assetName,
          marketPrice: 0,
          investmentAmount: op.amount,
          unitsPurchased: 0,
          totalUnitsAfterPurchase: 0,
          averageBuyPriceAfter: 0,
          status: "failed",
          message: op.reason,
        },
      },
      {
        kind: "set",
        path: notificationPath(uid, op.notificationId),
        stampCreatedAt: true,
        data: {
          id: op.notificationId,
          type: "sip_failed",
          title: "SIP Failed",
          body: `Could not price ${op.assetName}. No units were recorded.`,
          read: false,
          meta: { sipId: op.planId, symbol: op.symbol },
        },
      },
    ];
  }

  // execute
  const nextVp = applyExecuteToVirtualPosition(ctx.existingPosition?.data, op);
  const { updatedAt: _ignored, ...positionData } = nextVp as VirtualPosition & { updatedAt?: unknown };
  const txData = {
    id: op.txId,
    sipId: op.planId,
    date: op.scheduledKey,
    assetType: op.assetType,
    symbol: op.symbol,
    quoteKey: op.quoteKey,
    assetName: op.assetName,
    marketPrice: op.price,
    investmentAmount: op.amount,
    unitsPurchased: op.units,
    totalUnitsAfterPurchase: op.totalUnitsAfter,
    averageBuyPriceAfter: op.totalUnitsAfter > 0 ? op.totalInvestedAfter / op.totalUnitsAfter : 0,
    status: "executed",
    message: "Scheduled execution",
  };
  return [
    // The row that makes the whole batch run once: created, or (a retry of a
    // failed day) replaced only if that failed row is unchanged since read.
    ctx.existingTx
      ? { kind: "update", path: txPath(uid, op.txId), data: txData, lastUpdateTime: ctx.existingTx.updateTime }
      : { kind: "create", path: txPath(uid, op.txId), data: txData },
    ctx.existingPosition
      ? { kind: "update", path: positionPath(uid, op.vpId), data: positionData, lastUpdateTime: ctx.existingPosition.updateTime }
      : { kind: "create", path: positionPath(uid, op.vpId), data: positionData },
    {
      kind: "update",
      path: planPath(uid, op.planId),
      data: {
        totalInvested: ctx.increment(op.amount),
        totalUnits: ctx.increment(op.units),
        executionCount: ctx.increment(1),
        lastExecutionDate: op.scheduledKey,
        nextExecutionDate: op.nextExecutionDate,
      },
    },
    {
      kind: "set",
      path: notificationPath(uid, op.notificationId),
      stampCreatedAt: true,
      data: {
        id: op.notificationId,
        type: "sip_executed",
        title: "SIP Executed",
        body: `Successfully invested ${op.currency} ${op.amount} in ${op.assetName}`,
        read: false,
        meta: { sipId: op.planId, amount: op.amount, units: op.units, price: op.price, symbol: op.symbol },
      },
    },
  ];
}

export async function runSipDaily(opts: {
  ports: SipDailyPorts;
  now: Date;
  dryRun: boolean;
  budget: ReadBudget;
  push: JobPush | null;
  log: (line: string) => void;
  pageSize?: number;
}): Promise<DailyJobSummary> {
  const { ports, now, budget } = opts;
  const summary = newJobSummary("sip-daily", opts.dryRun);
  const zones = new Map<string, string>();
  const seenUsers = new Set<string>();
  let cursor: string | undefined;

  outer: do {
    if (budget.exhausted()) break;
    const page = await ports.listDuePlans(now.toISOString(), opts.pageSize ?? 100, cursor);
    cursor = page.cursor;
    for (const { uid, plan } of page.plans) {
      if (budget.exhausted()) break outer;
      if (!seenUsers.has(uid)) {
        seenUsers.add(uid);
        summary.usersSeen += 1;
      }
      if (isDuressUid(uid)) {
        summary.duressSkipped += 1;
        continue;
      }
      bump(summary, "plansSeen");

      let tz = zones.get(uid);
      if (!tz) {
        tz = (await ports.timeZoneOf(uid)) || DEFAULT_TIME_ZONE;
        zones.set(uid, tz);
      }
      if (plan.status !== "active" || !isSipDue(plan.nextExecutionDate, now, tz)) {
        bump(summary, "notDueInUserZone");
        continue;
      }

      const scheduledKey = sipScheduledKey(plan.nextExecutionDate, tz);
      const existingTx = await ports.readTransaction(uid, sipTransactionId(plan.id, scheduledKey));
      const status = existingTx?.data.status;
      let price: number | undefined;
      if (!plan.skipNextExecution && status !== "executed" && status !== "skipped") {
        price = await ports.price(plan);
      }

      const op = decideSipRun(plan, { today: now, price, existingTxStatus: status, timeZone: tz });
      if (!op) {
        bump(summary, "alreadyDone");
        continue;
      }
      const existingPosition = op.kind === "execute" ? await ports.readPosition(uid, op.vpId) : null;
      const writes = sipOpWrites(uid, op, { existingTx, existingPosition, increment: ports.increment });
      if (!writes.length) {
        bump(summary, "failedAgain");
        continue;
      }

      const result = await applyJobWrites({
        db: ports.db,
        uid,
        writes,
        dryRun: opts.dryRun,
        stamp: ports.stamp,
        push: opts.push,
        log: opts.log,
      });
      recordApply(summary, result, `plan ${plan.id}`);
      if (result.status === "written" || result.status === "dry-run") bump(summary, op.kind === "execute" ? "executed" : op.kind === "fail" ? "failed" : op.kind === "skip" ? "skipped" : "completed");
      if (result.status === "conflict") bump(summary, "conflicts");
    }
  } while (cursor);

  return summary;
}
