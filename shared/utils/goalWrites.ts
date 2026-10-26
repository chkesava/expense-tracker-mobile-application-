/**
 * SPENDLY-607 — every Save Goals write, as a pure plan.
 *
 * A builder validates one user action against the goal as this device sees it
 * and returns a `GoalWritePlan`: the summary fields to write, the signed amount
 * change, how `version` moves, the append-only events, and any name-lock
 * claim/release. `goalWritePlanToOps` turns a plan into `MutationOp[]` for the
 * outbox (`commitMutations`) — one batch, so the summary and its history land
 * together or not at all.
 *
 * Concurrency (FRD FR-13), enforced by rules from SPENDLY-608/609:
 *   - Amount changes write `currentAmount: increment(delta)` and
 *     `version: increment(1)`. Two devices' contributions both apply; rules
 *     check each against the value after the write, so neither is lost and the
 *     saved amount can never go below zero.
 *   - Target, status, name and milestone edits write a *literal*
 *     `version: base + 1`. If another device changed the goal first, the rules
 *     reject the stale edit (surfaced to the user) instead of silently
 *     overwriting it.
 *   - Ordering / pinning / reminders / lock are last-writer-wins settings and
 *     do not move `version`.
 *
 * Idempotency: the caller mints `ctx.eventId` once per user submit and reuses
 * it on retry. Derived events use derived ids (`__mig`, `__rev`, `__ms_*`), and
 * events are create-only in rules, so a replayed batch fails as a whole
 * instead of applying twice.
 *
 * Nothing here can reference an account, a ledger row or a transaction.
 */

import type { FinancialGoal } from "../types/expense";
import {
  GOAL_LIMITS,
  GOAL_REMINDER_FREQUENCIES,
  GOAL_SCHEMA_VERSION,
  type GoalEvent,
  type GoalIconKey,
  type GoalMilestone,
  type GoalReason,
  type GoalReminders,
  type GoalStatus,
} from "../types/goal";
import type { MutationOp } from "../types/mutations";
import { isValidDateKey } from "./dates";
import { checkGoalTransition } from "./goalLifecycle";
import { goalMilestones, milestoneCrossings, validateMilestones } from "./goalMilestones";
import {
  cleanGoalName,
  goalNameKey,
  goalStatus,
  isGoalIconKey,
  isGoalNameTaken,
  isGoalReason,
  isLegacyGoal,
  normalizeGoalName,
  statusAllowsAmountChange,
  validateGoalName,
  validateNonNegativeAmount,
  validatePositiveAmount,
  type GoalIssue,
} from "./goalModel";
import { reversedEventIds, effectiveEventAmount } from "./goalReconcile";
import { roundMoney } from "./money";

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export type GoalWriteContext = {
  uid: string;
  nowMs: number;
  /** Minted once per user submit; reused on retry. */
  eventId: string;
};

export type VersionMode =
  | { kind: "none" }
  | { kind: "increment" }
  /** Literal next version — a stale edit is rejected by rules. */
  | { kind: "expect"; next: number };

export type GoalWritePlan = {
  goalId: string;
  mode: "create" | "update";
  /** Plain values (no sentinels). Never contains currentAmount on update. */
  fields: Record<string, unknown>;
  /** Signed change to the saved amount, applied as increment() on update. */
  amountDelta: number;
  version: VersionMode;
  events: GoalEvent[];
  claimNameKey?: string;
  releaseNameKey?: string;
  nowMs: number;
};

export type GoalWriteResult = { ok: true; plan: GoalWritePlan } | { ok: false; issues: GoalIssue[] };

const fail = (...issues: GoalIssue[]): GoalWriteResult => ({ ok: false, issues });

function event(ctx: GoalWriteContext, goalId: string, partial: Omit<GoalEvent, "goalId" | "actorUid" | "createdAtMs" | "id"> & { id?: string; createdAtMs?: number }): GoalEvent {
  return {
    id: partial.id ?? ctx.eventId,
    goalId,
    actorUid: ctx.uid,
    createdAtMs: partial.createdAtMs ?? ctx.nowMs,
    ...stripUndefined(partial),
  } as GoalEvent;
}

function stripUndefined<T extends object>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = v;
  return out as T;
}

function crossingEvents(
  ctx: GoalWriteContext,
  goalId: string,
  before: { milestones: readonly GoalMilestone[]; saved: number },
  after: { milestones: readonly GoalMilestone[]; saved: number }
): GoalEvent[] {
  return milestoneCrossings(before, after, ctx.eventId).map((c) =>
    event(ctx, goalId, {
      id: c.eventId,
      type: c.type,
      amountDelta: 0,
      milestoneId: c.milestoneId,
      milestoneAmount: c.milestoneAmount,
    })
  );
}

/** Version for an "expect" write, based on what this device last saw. */
function expectNext(goal: Pick<FinancialGoal, "version">): VersionMode {
  return { kind: "expect", next: (goal.version ?? 0) + 1 };
}

/**
 * Legacy goals (no schemaVersion) are upgraded by their first Save Goals
 * write, in the same batch: the current amount becomes the immutable
 * `openingAmount`, the name is claimed, and a `migrated` event (delta 0)
 * opens the audit log. Nothing is backfilled in bulk and no amount changes.
 */
function withUpgrade(goal: FinancialGoal, plan: GoalWritePlan, ctx: GoalWriteContext): GoalWritePlan {
  if (!isLegacyGoal(goal)) return plan;
  const migrated = event(ctx, goal.id, {
    id: `${ctx.eventId}__mig`,
    // One millisecond before the action, so the timeline orders them.
    createdAtMs: ctx.nowMs - 1,
    type: "migrated",
    amountDelta: 0,
    targetAfter: goal.targetAmount,
    statusAfter: goalStatus(goal),
  });
  const fields: Record<string, unknown> = {
    schemaVersion: GOAL_SCHEMA_VERSION,
    openingAmount: roundMoney(Math.max(0, Number(goal.currentAmount) || 0)),
    status: goalStatus(goal),
    ...plan.fields,
  };
  if (!("normalizedName" in fields)) fields.normalizedName = normalizeGoalName(goal.name ?? "");
  if (!("lastEventId" in fields)) fields.lastEventId = migrated.id;
  return {
    ...plan,
    fields,
    version: plan.version.kind === "increment" ? plan.version : { kind: "expect", next: 1 },
    events: [migrated, ...plan.events],
    claimNameKey: plan.claimNameKey ?? goalNameKey(goal.name ?? ""),
  };
}

// ---------------------------------------------------------------------------
// Create and edit
// ---------------------------------------------------------------------------

export type GoalInput = {
  name: string;
  targetAmount: number;
  description?: string;
  iconKey?: GoalIconKey;
  startDate?: string;
  /** Stored as the legacy `deadline` field so existing consumers keep working. */
  targetDate?: string;
  minimumContribution?: number;
};

function validateDetails(input: Partial<GoalInput>, target: number): GoalIssue[] {
  const issues: GoalIssue[] = [];
  if (input.description !== undefined && input.description.length > GOAL_LIMITS.descriptionMax) issues.push("description_too_long");
  if (input.iconKey !== undefined && !isGoalIconKey(input.iconKey)) issues.push("icon_invalid");
  if (input.startDate && !isValidDateKey(input.startDate)) issues.push("date_invalid");
  if (input.targetDate && !isValidDateKey(input.targetDate)) issues.push("date_invalid");
  if (input.startDate && input.targetDate && isValidDateKey(input.startDate) && isValidDateKey(input.targetDate) && input.startDate > input.targetDate) {
    issues.push("dates_out_of_order");
  }
  if (input.minimumContribution !== undefined) {
    if (validatePositiveAmount(input.minimumContribution).length > 0 || input.minimumContribution > target) issues.push("minimum_invalid");
  }
  return issues;
}

export function buildCreateGoal(
  input: GoalInput & { initialAmount?: number; currency?: string },
  ctx: GoalWriteContext & { goalId: string },
  existingGoals: readonly Pick<FinancialGoal, "id" | "name">[]
): GoalWriteResult {
  const initial = input.initialAmount ?? 0;
  const issues: GoalIssue[] = [...validateGoalName(input.name)];
  if (issues.length === 0 && isGoalNameTaken(input.name, existingGoals)) issues.push("name_taken");
  if (validatePositiveAmount(input.targetAmount).length > 0) issues.push("target_invalid");
  if (validateNonNegativeAmount(initial).length > 0) issues.push("amount_invalid");
  issues.push(...validateDetails(input, input.targetAmount));
  if (issues.length > 0) return { ok: false, issues };

  const name = cleanGoalName(input.name);
  const fields = stripUndefined({
    name,
    normalizedName: normalizeGoalName(name),
    targetAmount: input.targetAmount,
    currentAmount: initial,
    deadline: input.targetDate ?? "",
    schemaVersion: GOAL_SCHEMA_VERSION,
    version: 1,
    lastEventId: ctx.eventId,
    status: "active" as GoalStatus,
    openingAmount: 0,
    createdAtMs: ctx.nowMs,
    sortOrder: ctx.nowMs,
    pinned: false,
    currency: input.currency,
    description: input.description?.trim() || undefined,
    iconKey: input.iconKey,
    startDate: input.startDate || undefined,
    minimumContribution: input.minimumContribution,
    lastContributionAtMs: initial > 0 ? ctx.nowMs : undefined,
  });
  const milestones = goalMilestones({ targetAmount: input.targetAmount });
  const events = [
    event(ctx, ctx.goalId, { type: "created", amountDelta: initial, targetAfter: input.targetAmount, statusAfter: "active" }),
    ...crossingEvents(ctx, ctx.goalId, { milestones, saved: 0 }, { milestones, saved: initial }),
  ];
  return {
    ok: true,
    plan: {
      goalId: ctx.goalId,
      mode: "create",
      fields,
      amountDelta: 0, // folded into fields.currentAmount on create
      version: { kind: "none" }, // literal version: 1 is in fields
      events,
      claimNameKey: goalNameKey(name),
      nowMs: ctx.nowMs,
    },
  };
}

/** Non-financial details. The target has its own confirmed path. */
export type GoalDetailsPatch = Partial<Omit<GoalInput, "targetAmount">>;

export function buildEditGoal(
  goal: FinancialGoal,
  patch: GoalDetailsPatch,
  ctx: GoalWriteContext,
  existingGoals: readonly Pick<FinancialGoal, "id" | "name">[]
): GoalWriteResult {
  const issues: GoalIssue[] = [];
  const fields: Record<string, unknown> = {};
  const changed: string[] = [];
  let claimNameKey: string | undefined;
  let releaseNameKey: string | undefined;

  if (patch.name !== undefined) {
    issues.push(...validateGoalName(patch.name));
    const name = cleanGoalName(patch.name);
    if (issues.length === 0 && name !== goal.name) {
      if (isGoalNameTaken(name, existingGoals, goal.id)) issues.push("name_taken");
      fields.name = name;
      changed.push("name");
      const nextKey = goalNameKey(name);
      const prevKey = goalNameKey(goal.name ?? "");
      fields.normalizedName = normalizeGoalName(name);
      // Case/space-only renames keep the same lock.
      if (nextKey !== prevKey) {
        claimNameKey = nextKey;
        // A legacy goal never claimed its old name, so there is nothing to release.
        if (!isLegacyGoal(goal)) releaseNameKey = prevKey;
      }
    }
  }
  issues.push(...validateDetails(patch, goal.targetAmount));
  if (patch.description !== undefined && (patch.description.trim() || undefined) !== goal.description) {
    fields.description = patch.description.trim();
    changed.push("description");
  }
  if (patch.iconKey !== undefined && patch.iconKey !== goal.iconKey) {
    fields.iconKey = patch.iconKey;
    changed.push("iconKey");
  }
  if (patch.startDate !== undefined && patch.startDate !== (goal.startDate ?? "")) {
    fields.startDate = patch.startDate;
    changed.push("startDate");
  }
  if (patch.targetDate !== undefined && patch.targetDate !== (goal.deadline ?? "")) {
    fields.deadline = patch.targetDate;
    changed.push("targetDate");
  }
  if (patch.minimumContribution !== undefined && patch.minimumContribution !== goal.minimumContribution) {
    fields.minimumContribution = patch.minimumContribution;
    changed.push("minimumContribution");
  }
  if (issues.length > 0) return { ok: false, issues };
  if (changed.length === 0) return fail("no_change");

  fields.lastEventId = ctx.eventId;
  const plan: GoalWritePlan = {
    goalId: goal.id,
    mode: "update",
    fields,
    amountDelta: 0,
    version: expectNext(goal),
    events: [event(ctx, goal.id, { type: "edited", amountDelta: 0, changedFields: changed })],
    claimNameKey,
    releaseNameKey,
    nowMs: ctx.nowMs,
  };
  return { ok: true, plan: withUpgrade(goal, plan, ctx) };
}

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------

export type AmountChangeInput = {
  kind: "contribution" | "reduction";
  amount: number;
  reason?: GoalReason;
  note?: string;
};

function validateNoteAndReason(input: { reason?: unknown; note?: string }): GoalIssue[] {
  const issues: GoalIssue[] = [];
  if (input.reason !== undefined && !isGoalReason(input.reason)) issues.push("reason_invalid");
  if (input.note !== undefined && input.note.length > GOAL_LIMITS.noteMax) issues.push("note_too_long");
  return issues;
}

export function buildAmountChange(goal: FinancialGoal, input: AmountChangeInput, ctx: GoalWriteContext): GoalWriteResult {
  if (!statusAllowsAmountChange(goalStatus(goal))) return fail("status_blocks_amount_change");
  const issues = [...validatePositiveAmount(input.amount), ...validateNoteAndReason(input)];
  if (issues.length > 0) return { ok: false, issues };
  const saved = Number(goal.currentAmount) || 0;
  if (input.kind === "contribution" && goal.minimumContribution && input.amount < goal.minimumContribution) {
    return fail("below_minimum_contribution");
  }
  if (input.kind === "reduction" && roundMoney(saved - input.amount) < 0) return fail("reduction_exceeds_saved");

  const delta = input.kind === "contribution" ? input.amount : -input.amount;
  const milestones = goalMilestones(goal);
  const fields: Record<string, unknown> = { lastEventId: ctx.eventId };
  if (input.kind === "contribution") fields.lastContributionAtMs = ctx.nowMs;
  const plan: GoalWritePlan = {
    goalId: goal.id,
    mode: "update",
    fields,
    amountDelta: delta,
    version: { kind: "increment" },
    events: [
      event(ctx, goal.id, { type: input.kind, amountDelta: delta, reason: input.reason, note: input.note?.trim() || undefined }),
      ...crossingEvents(ctx, goal.id, { milestones, saved }, { milestones, saved: roundMoney(saved + delta) }),
    ],
    nowMs: ctx.nowMs,
  };
  return { ok: true, plan: withUpgrade(goal, plan, ctx) };
}

const CORRECTABLE_TYPES = new Set(["created", "contribution", "reduction"]);

export type CorrectionInput =
  | { mode: "reverse"; reason?: GoalReason; note?: string }
  /** The amount the original entry should have been (unsigned). */
  | { mode: "correct"; amount: number; reason?: GoalReason; note?: string };

/**
 * Correct or reverse an earlier amount event without touching it: a new
 * linked event carries the difference. `related` must contain every event
 * already linked to `original` (query `correctionOf == original.id`).
 */
export function buildCorrection(
  goal: FinancialGoal,
  original: GoalEvent,
  related: readonly GoalEvent[],
  input: CorrectionInput,
  ctx: GoalWriteContext
): GoalWriteResult {
  if (!statusAllowsAmountChange(goalStatus(goal))) return fail("status_blocks_amount_change");
  if (original.goalId !== goal.id || !CORRECTABLE_TYPES.has(original.type) || !original.amountDelta) {
    return fail("correction_target_invalid");
  }
  if (reversedEventIds(related).has(original.id)) return fail("correction_target_invalid");
  const issues = validateNoteAndReason(input);
  if (input.mode === "correct") issues.push(...validatePositiveAmount(input.amount));
  if (issues.length > 0) return { ok: false, issues };

  const effective = effectiveEventAmount(original, related);
  const sign = original.amountDelta > 0 ? 1 : -1;
  const delta = roundMoney(input.mode === "reverse" ? -effective : sign * input.amount - effective);
  if (delta === 0) return fail("correction_no_change");
  const saved = Number(goal.currentAmount) || 0;
  if (roundMoney(saved + delta) < 0) return fail("result_negative");

  const milestones = goalMilestones(goal);
  const plan: GoalWritePlan = {
    goalId: goal.id,
    mode: "update",
    fields: { lastEventId: input.mode === "reverse" ? `${original.id}__rev` : ctx.eventId },
    amountDelta: delta,
    version: { kind: "increment" },
    events: [
      event(ctx, goal.id, {
        // One reversal per event, ever: the id is derived, and events are create-only.
        id: input.mode === "reverse" ? `${original.id}__rev` : ctx.eventId,
        type: input.mode === "reverse" ? "reversal" : "correction",
        amountDelta: delta,
        correctionOf: original.id,
        reason: input.reason,
        note: input.note?.trim() || undefined,
      }),
      ...crossingEvents(ctx, goal.id, { milestones, saved }, { milestones, saved: roundMoney(saved + delta) }),
    ],
    nowMs: ctx.nowMs,
  };
  return { ok: true, plan: withUpgrade(goal, plan, ctx) };
}

// ---------------------------------------------------------------------------
// Target, status, milestones, settings
// ---------------------------------------------------------------------------

/** Callers must confirm with the user first (FRD FR-05). */
export function buildTargetChange(goal: FinancialGoal, newTarget: number, ctx: GoalWriteContext): GoalWriteResult {
  if (!statusAllowsAmountChange(goalStatus(goal))) return fail("status_blocks_amount_change");
  if (validatePositiveAmount(newTarget).length > 0) return fail("target_invalid");
  if (newTarget === goal.targetAmount) return fail("no_change");
  if (goal.minimumContribution && goal.minimumContribution > newTarget) return fail("minimum_invalid");
  const saved = Number(goal.currentAmount) || 0;
  const plan: GoalWritePlan = {
    goalId: goal.id,
    mode: "update",
    fields: { targetAmount: newTarget, lastEventId: ctx.eventId },
    amountDelta: 0,
    version: expectNext(goal),
    events: [
      event(ctx, goal.id, { type: "target_changed", amountDelta: 0, targetBefore: goal.targetAmount, targetAfter: newTarget }),
      ...crossingEvents(
        ctx,
        goal.id,
        { milestones: goalMilestones(goal), saved },
        { milestones: goalMilestones({ ...goal, targetAmount: newTarget }), saved }
      ),
    ],
    nowMs: ctx.nowMs,
  };
  return { ok: true, plan: withUpgrade(goal, plan, ctx) };
}

export function buildStatusChange(goal: FinancialGoal, to: GoalStatus, ctx: GoalWriteContext): GoalWriteResult {
  const check = checkGoalTransition(goal, to);
  if (!check.ok) return fail(check.issue);
  const from = goalStatus(goal);
  const fields: Record<string, unknown> = { status: to, lastEventId: ctx.eventId };
  if (to === "archived") fields.statusBeforeArchive = from;
  if (to === "completed") fields.completedAtMs = ctx.nowMs;
  const plan: GoalWritePlan = {
    goalId: goal.id,
    mode: "update",
    fields,
    amountDelta: 0,
    version: expectNext(goal),
    events: [
      event(ctx, goal.id, {
        type: to === "completed" ? "completed" : "status_changed",
        amountDelta: 0,
        statusBefore: from,
        statusAfter: to,
      }),
    ],
    nowMs: ctx.nowMs,
  };
  return { ok: true, plan: withUpgrade(goal, plan, ctx) };
}

/** `null` resets to the default 25/50/75/100% milestones. */
export function buildMilestonesChange(goal: FinancialGoal, milestones: GoalMilestone[] | null, ctx: GoalWriteContext): GoalWriteResult {
  const next = milestones ?? [];
  const issues = validateMilestones(next);
  if (issues.length > 0) return { ok: false, issues };
  const saved = Number(goal.currentAmount) || 0;
  const plan: GoalWritePlan = {
    goalId: goal.id,
    mode: "update",
    fields: { milestones: next.map((m) => stripUndefined({ id: m.id, amount: m.amount, label: m.label })), lastEventId: ctx.eventId },
    amountDelta: 0,
    version: expectNext(goal),
    events: [
      event(ctx, goal.id, { type: "edited", amountDelta: 0, changedFields: ["milestones"] }),
      ...crossingEvents(
        ctx,
        goal.id,
        { milestones: goalMilestones(goal), saved },
        { milestones: goalMilestones({ ...goal, milestones: next }), saved }
      ),
    ],
    nowMs: ctx.nowMs,
  };
  return { ok: true, plan: withUpgrade(goal, plan, ctx) };
}

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateReminders(r: GoalReminders): GoalIssue[] {
  const ok =
    (GOAL_REMINDER_FREQUENCIES as readonly string[]).includes(r.frequency) &&
    HH_MM.test(r.time) &&
    typeof r.milestoneEnabled === "boolean" &&
    typeof r.inactivityEnabled === "boolean" &&
    Number.isInteger(r.inactivityDays) &&
    r.inactivityDays >= GOAL_LIMITS.minInactivityDays &&
    r.inactivityDays <= GOAL_LIMITS.maxInactivityDays;
  return ok ? [] : ["reminders_invalid"];
}

export type GoalSettingsPatch = {
  pinned?: boolean;
  sortOrder?: number;
  reminders?: GoalReminders;
  locked?: boolean;
};

/** Last-writer-wins preferences: no event, no version move (unless upgrading). */
export function buildSettingsChange(goal: FinancialGoal, patch: GoalSettingsPatch, ctx: GoalWriteContext): GoalWriteResult {
  const fields: Record<string, unknown> = {};
  if (patch.pinned !== undefined) fields.pinned = patch.pinned;
  if (patch.sortOrder !== undefined) {
    if (!Number.isFinite(patch.sortOrder)) return fail("no_change");
    fields.sortOrder = patch.sortOrder;
  }
  if (patch.reminders !== undefined) {
    const issues = validateReminders(patch.reminders);
    if (issues.length > 0) return { ok: false, issues };
    fields.reminders = { ...patch.reminders };
  }
  if (patch.locked !== undefined) fields.locked = patch.locked;
  if (Object.keys(fields).length === 0) return fail("no_change");
  const plan: GoalWritePlan = {
    goalId: goal.id,
    mode: "update",
    fields,
    amountDelta: 0,
    version: { kind: "none" },
    events: [],
    nowMs: ctx.nowMs,
  };
  return { ok: true, plan: withUpgrade(goal, plan, ctx) };
}

// ---------------------------------------------------------------------------
// Plan → outbox ops
// ---------------------------------------------------------------------------

/** Firestore field-value factories, injected so this module stays SDK-free. */
export type GoalSentinels = {
  serverTimestamp: () => unknown;
  increment: (n: number) => unknown;
};

export const goalPath = (uid: string, goalId: string) => `users/${uid}/financialGoals/${goalId}`;
export const goalEventPath = (uid: string, eventId: string) => `users/${uid}/goalEvents/${eventId}`;
export const goalNamePath = (uid: string, key: string) => `users/${uid}/goalNames/${key}`;

/**
 * One batch: the summary, its events and the name lock. Stamps createdAt /
 * updatedAt with server timestamps (READ_MODEL_RULES R1.2).
 */
export function goalWritePlanToOps(uid: string, plan: GoalWritePlan, s: GoalSentinels): MutationOp[] {
  const ops: MutationOp[] = [];
  if (plan.mode === "create") {
    ops.push({
      op: "set",
      ref: { path: goalPath(uid, plan.goalId) },
      data: { ...plan.fields, createdAt: s.serverTimestamp(), updatedAt: s.serverTimestamp() },
    });
  } else {
    const data: Record<string, unknown> = { ...plan.fields, updatedAt: s.serverTimestamp() };
    if (plan.amountDelta !== 0) data.currentAmount = s.increment(plan.amountDelta);
    if (plan.version.kind === "increment") data.version = s.increment(1);
    if (plan.version.kind === "expect") data.version = plan.version.next;
    ops.push({ op: "update", ref: { path: goalPath(uid, plan.goalId) }, data });
  }
  for (const e of plan.events) {
    const { id, ...rest } = e;
    ops.push({
      op: "set",
      ref: { path: goalEventPath(uid, id) },
      data: { ...stripUndefined(rest), createdAt: s.serverTimestamp(), updatedAt: s.serverTimestamp() },
    });
  }
  if (plan.claimNameKey) {
    ops.push({
      op: "set",
      ref: { path: goalNamePath(uid, plan.claimNameKey) },
      data: { goalId: plan.goalId, createdAtMs: plan.nowMs },
    });
  }
  if (plan.releaseNameKey && plan.releaseNameKey !== plan.claimNameKey) {
    ops.push({ op: "delete", ref: { path: goalNamePath(uid, plan.releaseNameKey) } });
  }
  return ops;
}
