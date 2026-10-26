/**
 * SPENDLY-607 — pure Save Goals model: names, amounts, status and progress.
 *
 * No Firebase or React imports. Everything that decides whether a goal write
 * is valid lives here (and in goalLifecycle / goalMilestones / goalWrites) and
 * is mirrored by firestore.rules, which is the trusted boundary.
 */

import type { FinancialGoal } from "../types/expense";
import {
  GOAL_ICON_KEYS,
  GOAL_LIMITS,
  GOAL_REASONS,
  GOAL_SCHEMA_VERSION,
  GOAL_STATUSES,
  type GoalIconKey,
  type GoalReason,
  type GoalStatus,
} from "../types/goal";
import { roundMoney } from "./money";

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/** Display form: trimmed, inner whitespace collapsed. */
export function cleanGoalName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ");
}

/**
 * Comparison form used for uniqueness: NFKC, trimmed, collapsed whitespace,
 * lower-cased. "  Emergency   FUND " and "emergency fund" are the same goal name.
 */
export function normalizeGoalName(name: string): string {
  return cleanGoalName(name).toLowerCase();
}

/**
 * Firestore document id for `goalNames/{key}`. Percent-encoded so "/" can't
 * create a path, and prefixed so "." / ".." / "__x__" can never be the id.
 */
export function goalNameKey(name: string): string {
  return `n_${encodeURIComponent(normalizeGoalName(name))}`;
}

export type GoalIssue =
  | "name_required"
  | "name_too_long"
  | "name_taken"
  | "amount_invalid"
  | "amount_not_positive"
  | "amount_too_large"
  | "amount_too_precise"
  | "target_invalid"
  | "below_minimum_contribution"
  | "minimum_invalid"
  | "reduction_exceeds_saved"
  | "result_negative"
  | "status_blocks_amount_change"
  | "description_too_long"
  | "note_too_long"
  | "reason_invalid"
  | "icon_invalid"
  | "date_invalid"
  | "dates_out_of_order"
  | "transition_not_allowed"
  | "target_not_reached"
  | "correction_target_invalid"
  | "correction_no_change"
  | "milestones_invalid"
  | "reminders_invalid"
  | "no_change";

export function validateGoalName(name: string): GoalIssue[] {
  const clean = cleanGoalName(name);
  if (!clean) return ["name_required"];
  if (clean.length > GOAL_LIMITS.nameMax) return ["name_too_long"];
  return [];
}

/** True when another goal (not `selfId`) already uses this name. UI hint only; rules enforce. */
export function isGoalNameTaken(
  name: string,
  goals: readonly Pick<FinancialGoal, "id" | "name">[],
  selfId?: string
): boolean {
  const key = normalizeGoalName(name);
  return goals.some((g) => g.id !== selfId && normalizeGoalName(g.name ?? "") === key);
}

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------

function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

/**
 * A positive money amount entered by the user: finite, > 0, below the rules'
 * bound and at most two decimals.
 */
export function validatePositiveAmount(value: unknown): GoalIssue[] {
  if (typeof value !== "number" || !Number.isFinite(value)) return ["amount_invalid"];
  if (value <= 0) return ["amount_not_positive"];
  if (value > GOAL_LIMITS.maxAmount) return ["amount_too_large"];
  if (!hasAtMostTwoDecimals(value)) return ["amount_too_precise"];
  return [];
}

/** Like validatePositiveAmount but 0 is allowed (initial saved amount). */
export function validateNonNegativeAmount(value: unknown): GoalIssue[] {
  if (value === 0) return [];
  return validatePositiveAmount(value);
}

/** Parse a typed amount ("1,000.50", "₹ 500") into a number, or NaN. */
export function parseGoalAmount(text: string): number {
  const cleaned = text.replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}

// ---------------------------------------------------------------------------
// Enum guards
// ---------------------------------------------------------------------------

export function isGoalStatus(value: unknown): value is GoalStatus {
  return typeof value === "string" && (GOAL_STATUSES as readonly string[]).includes(value);
}

export function isGoalReason(value: unknown): value is GoalReason {
  return typeof value === "string" && (GOAL_REASONS as readonly string[]).includes(value);
}

export function isGoalIconKey(value: unknown): value is GoalIconKey {
  return typeof value === "string" && (GOAL_ICON_KEYS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Status and legacy documents
// ---------------------------------------------------------------------------

/** A goal written before Save Goals (no audit log yet). */
export function isLegacyGoal(goal: Pick<FinancialGoal, "schemaVersion">): boolean {
  return (goal.schemaVersion ?? 0) < GOAL_SCHEMA_VERSION;
}

/** Missing or unknown status reads as active — every legacy goal is active. */
export function goalStatus(goal: Pick<FinancialGoal, "status">): GoalStatus {
  return isGoalStatus(goal.status) ? goal.status : "active";
}

/** Statuses whose saved amount may change. Paused only silences reminders. */
export function statusAllowsAmountChange(status: GoalStatus): boolean {
  return status === "active" || status === "paused";
}

/**
 * Saved amount before the audit log. Legacy goals: their whole current amount
 * (nothing explains it yet). Upgraded goals: the stored, immutable value.
 */
export function goalOpeningAmount(goal: Pick<FinancialGoal, "openingAmount" | "currentAmount" | "schemaVersion">): number {
  if (isLegacyGoal(goal)) return safeAmount(goal.currentAmount);
  return safeAmount(goal.openingAmount);
}

function safeAmount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export type GoalProgress = {
  saved: number;
  target: number;
  /** Still needed; 0 once reached. */
  remaining: number;
  /** Saved above target; 0 until reached. */
  surplus: number;
  /** 0..100, capped — use `surplus` to show anything above. */
  percent: number;
  reached: boolean;
};

export function goalProgress(goal: Pick<FinancialGoal, "currentAmount" | "targetAmount">): GoalProgress {
  const saved = roundMoney(Math.max(0, safeAmount(goal.currentAmount)));
  const target = roundMoney(Math.max(0, safeAmount(goal.targetAmount)));
  const reached = target > 0 && saved >= target;
  const percent = target > 0 ? Math.min(100, Math.floor((saved / target) * 1000) / 10) : 0;
  return {
    saved,
    target,
    remaining: roundMoney(Math.max(0, target - saved)),
    surplus: roundMoney(Math.max(0, saved - target)),
    percent,
    reached,
  };
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

export const GOAL_SORTS = ["manual", "created", "progress", "remaining", "name", "target"] as const;
export type GoalSort = (typeof GOAL_SORTS)[number];

function createdMs(goal: FinancialGoal): number {
  if (typeof goal.createdAtMs === "number") return goal.createdAtMs;
  const ts = goal.createdAt as { toMillis?: () => number; seconds?: number } | undefined;
  if (ts && typeof ts.toMillis === "function") return ts.toMillis();
  if (ts && typeof ts.seconds === "number") return ts.seconds * 1000;
  return 0;
}

/**
 * Pinned goals first, then the chosen sort. "manual" uses `sortOrder`
 * (falling back to creation time for goals never reordered). Ties break on id
 * so the order is stable across devices.
 */
export function sortGoals(goals: readonly FinancialGoal[], sort: GoalSort): FinancialGoal[] {
  const key = (g: FinancialGoal): number | string => {
    const p = goalProgress(g);
    switch (sort) {
      case "manual":
        return typeof g.sortOrder === "number" ? g.sortOrder : createdMs(g);
      case "created":
        return createdMs(g);
      case "progress":
        return -p.percent;
      case "remaining":
        return p.remaining;
      case "name":
        return normalizeGoalName(g.name ?? "");
      case "target":
        return -p.target;
    }
  };
  return [...goals].sort((a, b) => {
    const pin = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
    if (pin !== 0) return pin;
    const ka = key(a);
    const kb = key(b);
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return a.id.localeCompare(b.id);
  });
}

/** The tabs on the Goals screen. Paused rides with Active; Cancelled with Archived. */
export type GoalTab = "active" | "completed" | "archived";

export function goalTab(goal: Pick<FinancialGoal, "status">): GoalTab {
  const status = goalStatus(goal);
  if (status === "completed") return "completed";
  if (status === "archived" || status === "cancelled") return "archived";
  return "active";
}

/** Goals that count as "in progress" for the dashboard, optimizer and reminders. */
export function isGoalInProgress(goal: Pick<FinancialGoal, "status">): boolean {
  const status = goalStatus(goal);
  return status === "active" || status === "paused";
}
