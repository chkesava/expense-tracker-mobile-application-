import { useCallback, useEffect, useRef } from "react";

import { friendlyErrorMessage, logError } from "@/lib/errors";
import { writeSavedMessage } from "@/lib/firestoreWrite";
import { goalSyncIssues } from "@/lib/goalSyncIssues";
import { perfEvent } from "@/lib/perf";
import { toast } from "@/lib/toast";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useAuth } from "@/providers/AuthProvider";
import { useExpenseReferenceData } from "@/providers/ExpenseReferenceDataProvider";
import { commitGoalWrite, loadGoalCorrections, newGoalEventId, newGoalId } from "@/services/goals/goalStore";
import type { FinancialGoal } from "@/shared/types/expense";
import type { GoalEvent, GoalMilestone, GoalStatus } from "@/shared/types/goal";
import { goalIssuesMessage } from "@/shared/utils/goalMessages";
import { classifyGoalWriteFailure, errorCode, goalFailureMessage } from "@/shared/utils/goalWriteFailure";
import {
  buildAmountChange,
  buildCorrection,
  buildCreateGoal,
  buildEditGoal,
  buildMilestonesChange,
  buildSettingsChange,
  buildStatusChange,
  buildTargetChange,
  type AmountChangeInput,
  type CorrectionInput,
  type GoalDetailsPatch,
  type GoalInput,
  type GoalSettingsPatch,
  type GoalWriteContext,
  type GoalWritePlan,
  type GoalWriteResult,
} from "@/shared/utils/goalWrites";

/** Receives the committed plan (its events say what was achieved). */
export type OnGoalSaved = (plan: GoalWritePlan) => void;

type WriteSpec = {
  scope: string;
  /** Short noun for messages, e.g. "goal contribution". */
  label: string;
  success: string;
  /** Built against the latest goal each time it runs (first try and retry). */
  build: (ctx: GoalWriteContext) => GoalWriteResult | Promise<GoalWriteResult>;
  /** The submit's idempotency key; reused for a retry of the same submit. */
  eventId?: string;
  /** Called once the write is saved or durably queued — never for a refused one. */
  onSaved?: OnGoalSaved;
};

/**
 * Financial goals (SPENDLY-606 Save Goals).
 *
 * Reads come from the one shared, ref-counted listener in
 * ExpenseReferenceDataProvider — summaries only, never history — including
 * which goals have a write still waiting to sync (`pendingGoalIds`). Every
 * write is built by shared/utils/goalWrites and committed as one outbox batch
 * by services/goals/goalStore; firestore.rules enforce the same invariants.
 *
 * SPENDLY-613: a write refused by the server says why (a conflict with another
 * device, a closed goal, a negative balance) and, when it fails after being
 * reported as queued, is kept in `goalSyncIssues` with a retry that re-applies
 * the same change, with the same idempotency key, to the latest goal.
 *
 * Actions resolve to `true` when the change was saved (or durably queued) and
 * `false` when it was refused, after telling the user why.
 */
export const useFinancialGoals = (options?: { enabled?: boolean }) => {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;
  const currency = useDisplayCurrency();
  const {
    goals: sharedGoals,
    goalsLoading,
    goalsError,
    pendingGoalIds,
    retryGoals,
    registerGoalsSubscriber,
  } = useExpenseReferenceData();
  const goals = enabled ? sharedGoals : [];
  const loading = enabled ? goalsLoading : false;
  const error = enabled ? goalsError : null;
  const retry = retryGoals;
  // The latest snapshot, so a build (or a later retry) never uses a stale goal.
  const goalsRef = useRef(sharedGoals);
  goalsRef.current = sharedGoals;
  const fresh = useCallback((goal: FinancialGoal) => goalsRef.current.find((g) => g.id === goal.id) ?? goal, []);

  useEffect(() => {
    if (!enabled) return;
    return registerGoalsSubscriber?.();
  }, [enabled, registerGoalsSubscriber]);

  const run = useCallback(
    async (spec: WriteSpec, goalId: string | null): Promise<boolean> => {
      if (!uid) return false;
      const eventId = spec.eventId ?? newGoalEventId(uid);
      let result: GoalWriteResult;
      try {
        result = await spec.build({ uid, nowMs: Date.now(), eventId });
      } catch (err) {
        logError(`financialGoals.${spec.scope}`, err);
        toast.error("Couldn't prepare this change. Check your connection and try again.");
        return false;
      }
      if (!result.ok) {
        toast.error(goalIssuesMessage(result.issues));
        return false;
      }
      const plan = result.plan;
      const describe = (err: unknown) => {
        const kind = classifyGoalWriteFailure(errorCode(err), plan);
        return kind === "other" ? friendlyErrorMessage(err, goalFailureMessage(kind, plan)) : goalFailureMessage(kind, plan);
      };
      try {
        const outcome = await commitGoalWrite(uid, result, spec.label, {
          // A failure after "saved"/"queued" was shown: say so, and keep it retryable.
          onLateFailure: (err) => {
            logError(`financialGoals.${spec.scope}.late`, err);
            const message = describe(err);
            toast.error(`Your ${spec.label} was not saved after all. ${message}`);
            goalSyncIssues.add({
              id: eventId,
              goalId: goalId ?? plan.goalId,
              label: spec.label,
              message,
              atMs: Date.now(),
              retry: () => run({ ...spec, eventId }, goalId),
            });
          },
        });
        toast.success(writeSavedMessage(outcome, spec.success));
        // SPENDLY-615 telemetry: what kind of write and how it landed — never amounts or notes.
        perfEvent("goal_write", { scope: spec.scope, outcome, events: plan.events.length });
        goalSyncIssues.dismiss(eventId);
        spec.onSaved?.(plan);
        return true;
      } catch (err) {
        logError(`financialGoals.${spec.scope}`, err);
        toast.error(describe(err));
        return false;
      }
    },
    [uid]
  );

  const createGoal = useCallback(
    (input: GoalInput & { initialAmount?: number }) =>
      run(
        {
          scope: "createGoal",
          label: "goal",
          success: "Goal added",
          build: (ctx) => buildCreateGoal({ ...input, currency }, { ...ctx, goalId: newGoalId(ctx.uid) }, goalsRef.current),
        },
        null
      ),
    [run, currency]
  );

  const editGoal = useCallback(
    (goal: FinancialGoal, patch: GoalDetailsPatch) =>
      run(
        { scope: "editGoal", label: "goal change", success: "Goal updated", build: (ctx) => buildEditGoal(fresh(goal), patch, ctx, goalsRef.current) },
        goal.id
      ),
    [run, fresh]
  );

  /** Callers confirm with the user first (FRD FR-05). */
  const changeTarget = useCallback(
    (goal: FinancialGoal, targetAmount: number, onSaved?: OnGoalSaved) =>
      run(
        { scope: "changeTarget", label: "goal target", success: "Target updated", build: (ctx) => buildTargetChange(fresh(goal), targetAmount, ctx), onSaved },
        goal.id
      ),
    [run, fresh]
  );

  const changeStatus = useCallback(
    (goal: FinancialGoal, to: GoalStatus, success: string, onSaved?: OnGoalSaved) =>
      run({ scope: "changeStatus", label: "goal status change", success, build: (ctx) => buildStatusChange(fresh(goal), to, ctx), onSaved }, goal.id),
    [run, fresh]
  );

  /** SPENDLY-610: custom milestones, or `null` to go back to 25/50/75/100%. */
  const changeMilestones = useCallback(
    (goal: FinancialGoal, milestones: GoalMilestone[] | null, onSaved?: OnGoalSaved) =>
      run(
        {
          scope: "changeMilestones",
          label: "goal milestones",
          success: milestones ? "Milestones saved" : "Milestones reset",
          build: (ctx) => buildMilestonesChange(fresh(goal), milestones, ctx),
          onSaved,
        },
        goal.id
      ),
    [run, fresh]
  );

  const updateSettings = useCallback(
    (goal: FinancialGoal, patch: GoalSettingsPatch, success = "Goal updated") =>
      run({ scope: "updateSettings", label: "goal setting", success, build: (ctx) => buildSettingsChange(fresh(goal), patch, ctx) }, goal.id),
    [run, fresh]
  );

  /**
   * SPENDLY-609: a contribution or reduction, recorded as an audit event. A
   * manual savings record only — no account, ledger row or transfer changes.
   */
  const recordAmountChange = useCallback(
    (goal: FinancialGoal, input: AmountChangeInput, eventId: string, onSaved?: OnGoalSaved) =>
      run(
        {
          scope: "recordAmountChange",
          label: input.kind === "contribution" ? "goal contribution" : "goal reduction",
          success: input.kind === "contribution" ? "Added to goal" : "Taken out of goal",
          build: (ctx) => buildAmountChange(fresh(goal), input, ctx),
          eventId,
          onSaved,
        },
        goal.id
      ),
    [run, fresh]
  );

  /**
   * SPENDLY-609: correct or reverse an earlier entry. The original stays; a
   * linked event carries the difference. Its existing corrections are read
   * fresh first, so the change is computed from the entry's effective amount.
   */
  const correctEvent = useCallback(
    (goal: FinancialGoal, original: GoalEvent, input: CorrectionInput, eventId: string, onSaved?: OnGoalSaved) =>
      run(
        {
          scope: "correctEvent",
          label: "goal correction",
          success: input.mode === "reverse" ? "Entry reversed" : "Entry corrected",
          build: async (ctx) => buildCorrection(fresh(goal), original, await loadGoalCorrections(ctx.uid, original.id), input, ctx),
          eventId,
          onSaved,
        },
        goal.id
      ),
    [run, fresh]
  );

  /** @deprecated Kept for older callers; prefer `createGoal`. */
  const addGoal = (name: string, targetAmount: number, currentAmount: number, deadline?: string) =>
    createGoal({ name, targetAmount, initialAmount: Number(currentAmount) || 0, targetDate: deadline || undefined });

  /** Records a contribution (positive) or reduction (negative) with an audit event. */
  const addGoalContribution = (id: string, amountDelta: number) => {
    const goal = sharedGoals.find((g) => g.id === id);
    if (!goal || !amountDelta || !uid) return Promise.resolve(false);
    return recordAmountChange(goal, { kind: amountDelta > 0 ? "contribution" : "reduction", amount: Math.abs(amountDelta) }, newGoalEventId(uid));
  };

  /**
   * Goals are never permanently deleted (FRD FR-06): this archives the goal and
   * keeps its history. Kept under the old name for existing callers.
   */
  const deleteGoal = (id: string) => {
    const goal = sharedGoals.find((g) => g.id === id);
    if (!goal) return Promise.resolve(false);
    return changeStatus(goal, "archived", "Goal archived");
  };

  return {
    goals,
    loading,
    error,
    retry,
    /** SPENDLY-613: goals with a write not yet acknowledged by the server. */
    pendingGoalIds,
    createGoal,
    editGoal,
    changeTarget,
    changeStatus,
    changeMilestones,
    updateSettings,
    recordAmountChange,
    correctEvent,
    addGoal,
    addGoalContribution,
    deleteGoal,
  };
};
