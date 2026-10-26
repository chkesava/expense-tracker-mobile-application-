/**
 * SPENDLY-607 — Save Goals data contract (epic SPENDLY-606).
 *
 * A goal is manual savings tracking. Nothing here is money that moved between
 * accounts: no goal write may touch an account, a ledger row, an expense, an
 * income or a transfer.
 *
 * Three stores, all under `users/{uid}`:
 *   - `financialGoals/{goalId}`  — the summary. The pre-existing fields
 *     (name, targetAmount, currentAmount, deadline, createdAt) keep their names
 *     and meaning so the Goal Funding Optimizer, the calendar, the dashboard
 *     widget and decision links keep working. Everything added is optional.
 *   - `goalEvents/{eventId}`     — the append-only audit log. The event id is
 *     the client idempotency key. Events are never updated or deleted.
 *   - `goalNames/{nameKey}`      — a create-only lock that makes goal names
 *     unique per user at the trusted (rules) boundary.
 *
 * Invariant (checked by `reconcileGoal`, enforced per write by rules):
 *   openingAmount + Σ goalEvents.amountDelta == currentAmount
 *
 * Full design: docs/features/save-goals/IMPLEMENTATION_PLAN.md
 */

/** Persisted ids — append only, never rename. Missing `status` means active. */
export const GOAL_STATUSES = ["active", "paused", "completed", "archived", "cancelled"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

/** Persisted ids — append only, never rename. */
export const GOAL_EVENT_TYPES = [
  "created",
  "migrated",
  "contribution",
  "reduction",
  "correction",
  "reversal",
  "target_changed",
  "status_changed",
  "edited",
  "milestone_reached",
  "milestone_lost",
  "completed",
] as const;
export type GoalEventType = (typeof GOAL_EVENT_TYPES)[number];

/** Event types that may carry a non-zero amountDelta. */
export const GOAL_AMOUNT_EVENT_TYPES = [
  "created",
  "contribution",
  "reduction",
  "correction",
  "reversal",
] as const satisfies readonly GoalEventType[];

/** Persisted ids — append only, never rename. */
export const GOAL_REASONS = ["salary", "savings", "bonus", "gift", "other"] as const;
export type GoalReason = (typeof GOAL_REASONS)[number];

/** Predefined icon keys (rendered with lucide icons in the UI). */
export const GOAL_ICON_KEYS = [
  "piggy-bank",
  "shield",
  "plane",
  "home",
  "car",
  "smartphone",
  "laptop",
  "graduation-cap",
  "heart",
  "gift",
  "briefcase",
  "target",
] as const;
export type GoalIconKey = (typeof GOAL_ICON_KEYS)[number];

export const GOAL_REMINDER_FREQUENCIES = ["off", "daily", "weekly", "monthly"] as const;
export type GoalReminderFrequency = (typeof GOAL_REMINDER_FREQUENCIES)[number];

export const GOAL_SCHEMA_VERSION = 2;

export const GOAL_LIMITS = {
  /** Mirrors the rules' `boundedNonNeg` (0 ≤ v < 1e9). */
  maxAmount: 999_999_999,
  nameMax: 60,
  descriptionMax: 280,
  noteMax: 500,
  maxMilestones: 10,
  milestoneLabelMax: 40,
  minInactivityDays: 1,
  maxInactivityDays: 365,
} as const;

/** Milestone configuration. Reached state is derived from currentAmount, never stored. */
export interface GoalMilestone {
  id: string;
  amount: number;
  label?: string;
}

export interface GoalReminders {
  frequency: GoalReminderFrequency;
  /** Local wall-clock time, "HH:mm". */
  time: string;
  milestoneEnabled: boolean;
  inactivityEnabled: boolean;
  inactivityDays: number;
}

export interface GoalImage {
  path: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number;
  width: number;
  height: number;
  uploadedAtMs: number;
}

/** Fields added by schema v2. All optional so legacy documents stay valid. */
export interface GoalV2Fields {
  schemaVersion?: number;
  /** +1 on every write that changes amount, target or status. */
  version?: number;
  lastEventId?: string;
  normalizedName?: string;
  description?: string;
  iconKey?: GoalIconKey;
  image?: GoalImage | null;
  status?: GoalStatus;
  statusBeforeArchive?: GoalStatus;
  startDate?: string;
  minimumContribution?: number;
  currency?: string;
  pinned?: boolean;
  sortOrder?: number;
  /** Saved amount before the audit log existed. Immutable once set. */
  openingAmount?: number;
  lastContributionAtMs?: number;
  completedAtMs?: number;
  milestones?: GoalMilestone[];
  reminders?: GoalReminders;
  /** Per-goal device-authentication lock (privacy, not data security). */
  locked?: boolean;
  createdAtMs?: number;
  updatedAt?: unknown;
}

export interface GoalEvent {
  id: string;
  goalId: string;
  type: GoalEventType;
  /** Signed change to the saved amount; 0 for non-amount events. */
  amountDelta: number;
  reason?: GoalReason;
  note?: string;
  /** Id of the event a correction/reversal compensates. */
  correctionOf?: string;
  targetBefore?: number;
  targetAfter?: number;
  statusBefore?: GoalStatus;
  statusAfter?: GoalStatus;
  milestoneId?: string;
  /** Milestone amount at the time of the event (milestones can be edited later). */
  milestoneAmount?: number;
  /** For `edited`: which summary fields changed (names only, never values). */
  changedFields?: string[];
  actorUid: string;
  createdAtMs: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface GoalNameClaim {
  goalId: string;
  createdAtMs: number;
}
