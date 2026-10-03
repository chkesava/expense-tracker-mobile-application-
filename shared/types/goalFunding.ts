/**
 * Goal Funding Optimizer contract (SPENDLY-214, epic SPENDLY-213).
 *
 * Planning only. The optimizer reads canonical goals (`FinancialGoal`) and
 * funding data, and produces hypothetical allocations. It never writes a
 * goal, transaction, account or investment. Everything the goal model
 * doesn't carry — priority, minimums, the user's current contribution,
 * one-time top-ups, growth assumptions — lives here, in planning inputs,
 * never on the goal.
 *
 * Documented in docs/SPENDLY-214-goal-funding-model.md.
 */

export const GOAL_FUNDING_ENGINE_VERSION = 1;

export const GOAL_FUNDING_MODES = ["target_date", "fixed_budget", "priority", "balanced"] as const;
export type GoalFundingMode = (typeof GOAL_FUNDING_MODES)[number];

/** A read-only copy of the goal values a scenario was computed against. */
export interface GoalSnapshot {
  goalId: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  /** YYYY-MM-DD, from the goal's `deadline`. */
  targetDate?: string;
}

/**
 * The user's planning inputs for one goal. Every field is optional and owned
 * by the plan, not the goal. `currentContribution` left blank means unknown —
 * never zero.
 */
export interface GoalPlanInput {
  goalId: string;
  /** 1 = first. Undefined = no priority given. Never inferred. */
  priority?: number;
  minContribution?: number;
  /** What the user puts in each month today, if they tell us. */
  currentContribution?: number;
  oneTime?: { amount: number; date: string };
  /** Annual growth assumption, only for goals the user marks investment-linked. Not a guarantee. */
  annualReturnPct?: number;
  /** When contributions start; defaults to next month. */
  startDate?: string;
  /** Leave this goal out of the scenario. */
  excluded?: boolean;
}

export interface GoalFundingScenario {
  mode: GoalFundingMode;
  /** Monthly money available for goals. Null = unknown capacity. */
  monthlyPool: number | null;
  /** A hypothetical: allow allocations above the pool (shown as over-allocated). */
  allowOverAllocation: boolean;
  inputs: GoalPlanInput[];
}

export type GoalFundingStatus =
  | "on_track"
  | "behind"
  | "ahead"
  | "funded"
  | "no_target_date"
  | "target_date_passed"
  | "not_fundable"
  | "excluded";

export interface GoalFundingResult {
  goalId: string;
  name: string;
  remaining: number;
  /** Months from the plan start to the target date (0 if passed, null if none). */
  monthsToTarget: number | null;
  /** Monthly amount needed to reach the target by its date. Null if no date. */
  requiredMonthly: number | null;
  /** The user's current contribution, or null if unknown. */
  currentMonthly: number | null;
  /** What the scenario allocates per month. */
  allocatedMonthly: number;
  /** allocated − required (negative = gap). Null if required is unknown. */
  gapMonthly: number | null;
  projectedCompletion: string | null;
  /** Positive = ahead of the target date, negative = behind. */
  monthsAheadOfTarget: number | null;
  /** allocated − current (null if current unknown). */
  changeVsCurrent: number | null;
  status: GoalFundingStatus;
  /** Why the allocation is what it is, in words. */
  reasons: string[];
}

export interface GoalFundingTradeOff {
  /** The goal whose allocation rose. */
  goalId: string;
  /** Goals whose allocation is lower as a result, with how much. */
  affects: Array<{ goalId: string; monthly: number }>;
}

export type GoalFundingAssumptionCode =
  | "current_contribution_unknown"
  | "capacity_unknown"
  | "capacity_non_positive"
  | "growth_assumed"
  | "over_allocation_hypothetical"
  | "no_priority_given"
  | "target_date_missing"
  | "target_date_passed";

export interface GoalFundingResultSet {
  engineVersion: number;
  mode: GoalFundingMode;
  /** YYYY-MM-DD the plan was computed for. */
  asOf: string;
  monthlyPool: number | null;
  totalRequired: number;
  totalAllocated: number;
  /** Pool − allocated (null if pool unknown; negative only when over-allocation is allowed). */
  unallocated: number | null;
  goals: GoalFundingResult[];
  tradeOffs: GoalFundingTradeOff[];
  assumptions: GoalFundingAssumptionCode[];
}
