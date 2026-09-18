/**
 * SIP due-date arithmetic and the execute/skip/fail/complete decision.
 *
 * `triggerManualExecute` used to mint a random sipTransactions id and write
 * computed plan totals, so two taps before the snapshot landed both executed.
 * Quote misses recorded units at ₹100. This module is Firestore-free so those
 * rules can be tested under the `shared/**` vitest glob (SPENDLY-16).
 */

import { roundMoney } from "@/shared/utils/money";
import type {
  SipFrequency,
  SipPlan,
  SipTransactionStatus,
  VirtualPosition,
} from "@/shared/features/sip/types";

/** Stay under Firestore's 500-write cap with headroom for the four docs per SIP. */
export const SIP_BATCH_WRITE_LIMIT = 400;

export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function sipScheduledKey(nextExecutionDate: string): string {
  return localDateKey(startOfLocalDay(new Date(nextExecutionDate)));
}

export function sipTransactionId(sipId: string, scheduledKey: string): string {
  return `${sipId}_${scheduledKey}`;
}

export function sipNotificationId(
  sipId: string,
  scheduledKey: string,
  kind: "executed" | "skipped" | "failed"
): string {
  return `n_${sipId}_${scheduledKey}_${kind}`;
}

export function startOfLocalDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function calculateNextExecutionDate(
  frequency: SipFrequency,
  executionDay: number,
  fromDate: Date = new Date()
): Date {
  const nextDate = startOfLocalDay(fromDate);

  if (frequency === "daily") {
    nextDate.setDate(nextDate.getDate() + 1);
  } else if (frequency === "weekly") {
    const currentDay = nextDate.getDay();
    let diff = executionDay - currentDay;
    if (diff <= 0) diff += 7;
    nextDate.setDate(nextDate.getDate() + diff);
  } else if (frequency === "monthly") {
    if (nextDate.getDate() >= executionDay) {
      nextDate.setMonth(nextDate.getMonth() + 1);
    }
    const lastDayOfMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
    nextDate.setDate(Math.min(executionDay, lastDayOfMonth));
  } else if (frequency === "quarterly") {
    nextDate.setMonth(nextDate.getMonth() + 3);
    const lastDayOfMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
    nextDate.setDate(Math.min(executionDay, lastDayOfMonth));
  } else if (frequency === "yearly") {
    nextDate.setFullYear(nextDate.getFullYear() + 1);
    const lastDayOfMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
    nextDate.setDate(Math.min(executionDay, lastDayOfMonth));
  }

  return startOfLocalDay(nextDate);
}

export function isSipDue(nextExecutionDate: string, today: Date): boolean {
  const next = startOfLocalDay(new Date(nextExecutionDate));
  if (Number.isNaN(next.getTime())) return false;
  return next.getTime() <= startOfLocalDay(today).getTime();
}

export function isSipEnded(endDate: string | undefined, scheduledKey: string): boolean {
  const end = endDate?.trim().slice(0, 10);
  if (!end) return false;
  return scheduledKey > end;
}

export type SipExecuteOp = {
  kind: "execute";
  planId: string;
  scheduledKey: string;
  txId: string;
  notificationId: string;
  symbol: string;
  quoteKey: string;
  assetName: string;
  assetType: SipPlan["assetType"];
  currency: string;
  amount: number;
  price: number;
  units: number;
  totalInvestedAfter: number;
  totalUnitsAfter: number;
  nextExecutionDate: string;
  vpId: string;
};

export type SipSkipOp = {
  kind: "skip";
  planId: string;
  scheduledKey: string;
  notificationId: string;
  assetName: string;
  nextExecutionDate: string;
};

export type SipFailOp = {
  kind: "fail";
  planId: string;
  scheduledKey: string;
  txId: string;
  notificationId: string;
  symbol: string;
  quoteKey: string;
  assetName: string;
  assetType: SipPlan["assetType"];
  amount: number;
  reason: string;
};

export type SipCompleteOp = {
  kind: "complete";
  planId: string;
};

export type SipRunOp = SipExecuteOp | SipSkipOp | SipFailOp | SipCompleteOp;

export function writesForSipOp(op: SipRunOp): number {
  if (op.kind === "execute") return 4;
  if (op.kind === "complete") return 1;
  return 2;
}

export function chunkSipOps(ops: SipRunOp[], limit = SIP_BATCH_WRITE_LIMIT): SipRunOp[][] {
  const chunks: SipRunOp[][] = [];
  let current: SipRunOp[] = [];
  let used = 0;
  for (const op of ops) {
    const size = writesForSipOp(op);
    if (current.length > 0 && used + size > limit) {
      chunks.push(current);
      current = [];
      used = 0;
    }
    current.push(op);
    used += size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export type SipPlanForRun = Pick<
  SipPlan,
  | "id"
  | "status"
  | "nextExecutionDate"
  | "endDate"
  | "skipNextExecution"
  | "frequency"
  | "executionDay"
  | "investmentAmount"
  | "currency"
  | "symbol"
  | "quoteKey"
  | "assetName"
  | "assetType"
  | "totalInvested"
  | "totalUnits"
>;

/**
 * Decide what one due plan should do. `price` is the live quote; omit it when
 * the fetch failed so we record a failed row instead of inventing ₹100.
 */
export function decideSipRun(
  plan: SipPlanForRun,
  options: {
    today: Date;
    price?: number;
    existingTxStatus?: SipTransactionStatus;
  }
): SipRunOp | null {
  if (plan.status !== "active") return null;
  if (!isSipDue(plan.nextExecutionDate, options.today)) return null;

  const nextDate = startOfLocalDay(new Date(plan.nextExecutionDate));
  const scheduledKey = localDateKey(nextDate);
  if (isSipEnded(plan.endDate, scheduledKey)) {
    return { kind: "complete", planId: plan.id };
  }

  if (options.existingTxStatus === "executed" || options.existingTxStatus === "skipped") {
    return null;
  }

  const nextExecutionDate = calculateNextExecutionDate(
    plan.frequency,
    plan.executionDay,
    nextDate
  ).toISOString();

  if (plan.skipNextExecution) {
    return {
      kind: "skip",
      planId: plan.id,
      scheduledKey,
      notificationId: sipNotificationId(plan.id, scheduledKey, "skipped"),
      assetName: plan.assetName,
      nextExecutionDate,
    };
  }

  const price = Number(options.price);
  if (!(price > 0)) {
    return {
      kind: "fail",
      planId: plan.id,
      scheduledKey,
      txId: sipTransactionId(plan.id, scheduledKey),
      notificationId: sipNotificationId(plan.id, scheduledKey, "failed"),
      symbol: plan.symbol,
      quoteKey: plan.quoteKey,
      assetName: plan.assetName,
      assetType: plan.assetType,
      amount: plan.investmentAmount,
      reason: "Quote unavailable",
    };
  }

  const amount = roundMoney(plan.investmentAmount);
  const units = amount / price;
  const totalInvestedAfter = roundMoney((plan.totalInvested || 0) + amount);
  const totalUnitsAfter = (plan.totalUnits || 0) + units;

  return {
    kind: "execute",
    planId: plan.id,
    scheduledKey,
    txId: sipTransactionId(plan.id, scheduledKey),
    notificationId: sipNotificationId(plan.id, scheduledKey, "executed"),
    symbol: plan.symbol,
    quoteKey: plan.quoteKey,
    assetName: plan.assetName,
    assetType: plan.assetType,
    currency: plan.currency,
    amount,
    price,
    units,
    totalInvestedAfter,
    totalUnitsAfter,
    nextExecutionDate,
    vpId: plan.quoteKey,
  };
}

export function applyExecuteToVirtualPosition(
  existing: VirtualPosition | undefined,
  op: SipExecuteOp
): Omit<VirtualPosition, "updatedAt"> {
  const totalUnits = (existing?.totalUnits || 0) + op.units;
  const totalInvested = roundMoney((existing?.totalInvested || 0) + op.amount);
  const sipIds = existing?.sipIds ? [...existing.sipIds] : [];
  if (!sipIds.includes(op.planId)) sipIds.push(op.planId);
  return {
    id: op.vpId,
    assetType: op.assetType,
    symbol: op.symbol,
    quoteKey: op.quoteKey,
    assetName: op.assetName,
    totalUnits,
    averageBuyPrice: totalUnits > 0 ? totalInvested / totalUnits : 0,
    totalInvested,
    sipIds,
  };
}
