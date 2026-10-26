/**
 * SPENDLY-612 — estimated completion date (FRD FR-11), pure.
 *
 * Based on the average of recent contributions: the net amount that moved
 * into the goal over the last 90 days, from its first contribution in that
 * window, as a daily rate. With too little history the answer says so — it
 * never invents a date.
 */

import type { FinancialGoal } from "../types/expense";
import type { GoalEvent } from "../types/goal";
import { goalProgress } from "./goalModel";
import { roundMoney } from "./money";

export const ESTIMATE_WINDOW_DAYS = 90;
export const ESTIMATE_MIN_CONTRIBUTIONS = 2;
export const ESTIMATE_MIN_SPAN_DAYS = 14;
const DAY = 86_400_000;

export type GoalEstimate =
  | { kind: "reached" }
  | { kind: "insufficient"; contributions: number; spanDays: number }
  | { kind: "not_growing"; perMonth: number }
  | { kind: "estimate"; dateMs: number; perMonth: number; contributions: number; spanDays: number; afterTargetDate: boolean };

const AMOUNT_TYPES = new Set(["created", "contribution", "reduction", "correction", "reversal"]);

export function estimateCompletion(
  goal: Pick<FinancialGoal, "currentAmount" | "targetAmount" | "deadline">,
  recent: readonly Pick<GoalEvent, "type" | "amountDelta" | "createdAtMs">[],
  nowMs: number
): GoalEstimate {
  const p = goalProgress(goal);
  if (p.reached) return { kind: "reached" };
  const since = nowMs - ESTIMATE_WINDOW_DAYS * DAY;
  const window = recent.filter((e) => e.createdAtMs >= since && e.createdAtMs <= nowMs);
  const contributions = window.filter((e) => e.type === "contribution" && e.amountDelta > 0);
  const first = contributions.reduce<number | null>((m, e) => (m === null || e.createdAtMs < m ? e.createdAtMs : m), null);
  const spanDays = first === null ? 0 : (nowMs - first) / DAY;
  if (contributions.length < ESTIMATE_MIN_CONTRIBUTIONS || spanDays < ESTIMATE_MIN_SPAN_DAYS) {
    return { kind: "insufficient", contributions: contributions.length, spanDays: Math.floor(spanDays) };
  }
  // Net movement since the first contribution in the window (reductions and corrections count).
  const net = window
    .filter((e) => AMOUNT_TYPES.has(e.type) && e.createdAtMs >= (first as number))
    .reduce((s, e) => s + (Number.isFinite(e.amountDelta) ? e.amountDelta : 0), 0);
  const perDay = net / spanDays;
  const perMonth = roundMoney(perDay * 30);
  if (perDay <= 0) return { kind: "not_growing", perMonth };
  const dateMs = nowMs + Math.ceil(p.remaining / perDay) * DAY;
  const deadline = goal.deadline && /^\d{4}-\d{2}-\d{2}$/.test(goal.deadline) ? goal.deadline : null;
  const d = new Date(dateMs);
  const localKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const afterTargetDate = deadline !== null && localKey > deadline;
  return { kind: "estimate", dateMs, perMonth, contributions: contributions.length, spanDays: Math.floor(spanDays), afterTargetDate };
}
