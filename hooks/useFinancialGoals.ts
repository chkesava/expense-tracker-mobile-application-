import { useCallback, useEffect } from "react";

import { friendlyErrorMessage, logError } from "@/lib/errors";
import { writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useAuth } from "@/providers/AuthProvider";
import { useExpenseReferenceData } from "@/providers/ExpenseReferenceDataProvider";
import { commitGoalWrite, loadGoalCorrections, newGoalEventId, newGoalId } from "@/services/goals/goalStore";
import type { FinancialGoal } from "@/shared/types/expense";
import type { GoalEvent, GoalMilestone, GoalStatus } from "@/shared/types/goal";
import { goalIssuesMessage } from "@/shared/utils/goalMessages";
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

/**
 * Financial goals (SPENDLY-606 Save Goals).
 *
 * Reads come from the one shared, ref-counted listener in
 * ExpenseReferenceDataProvider — summaries only, never history. Every write is
 * built by shared/utils/goalWrites and committed as one outbox batch by
 * services/goals/goalStore; firestore.rules enforce the same invariants.
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
    retryGoals,
    registerGoalsSubscriber,
  } = useExpenseReferenceData();
  const goals = enabled ? sharedGoals : [];
  const loading = enabled ? goalsLoading : false;
  const error = enabled ? goalsError : null;
  const retry = retryGoals;

  useEffect(() => {
    if (!enabled) return;
    return registerGoalsSubscriber?.();
  }, [enabled, registerGoalsSubscriber]);

  const run = useCallback(
    async (
      scope: string,
      label: string,
      success: string,
      build: (ctx: GoalWriteContext) => GoalWriteResult | Promise<GoalWriteResult>,
      /** The submit's idempotency key; reuse it when retrying the same submit. */
      eventId?: string,
      /** Called once the write is saved or durably queued — never for a refused one. */
      onSaved?: OnGoalSaved
    ): Promise<boolean> => {
      if (!uid) return false;
      let result: GoalWriteResult;
      try {
        result = await build({ uid, nowMs: Date.now(), eventId: eventId ?? newGoalEventId(uid) });
      } catch (err) {
        logError(`financialGoals.${scope}`, err);
        toast.error("Couldn't save the goal. Try again.");
        return false;
      }
      if (!result.ok) {
        toast.error(goalIssuesMessage(result.issues));
        return false;
      }
      try {
        const outcome = await commitGoalWrite(uid, result, label);
        toast.success(writeSavedMessage(outcome, success));
        onSaved?.(result.plan);
        return true;
      } catch (err) {
        logError(`financialGoals.${scope}`, err);
        toast.error(friendlyErrorMessage(err, "Couldn't save the goal."));
        return false;
      }
    },
    [uid]
  );

  const createGoal = useCallback(
    (input: GoalInput & { initialAmount?: number }) =>
      run("createGoal", "goal", "Goal added", (ctx) =>
        buildCreateGoal({ ...input, currency }, { ...ctx, goalId: newGoalId(ctx.uid) }, sharedGoals)
      ),
    [run, currency, sharedGoals]
  );

  const editGoal = useCallback(
    (goal: FinancialGoal, patch: GoalDetailsPatch) =>
      run("editGoal", "goal", "Goal updated", (ctx) => buildEditGoal(goal, patch, ctx, sharedGoals)),
    [run, sharedGoals]
  );

  /** Callers confirm with the user first (FRD FR-05). */
  const changeTarget = useCallback(
    (goal: FinancialGoal, targetAmount: number, onSaved?: OnGoalSaved) =>
      run("changeTarget", "goal target", "Target updated", (ctx) => buildTargetChange(goal, targetAmount, ctx), undefined, onSaved),
    [run]
  );

  const changeStatus = useCallback(
    (goal: FinancialGoal, to: GoalStatus, success: string, onSaved?: OnGoalSaved) =>
      run("changeStatus", "goal", success, (ctx) => buildStatusChange(goal, to, ctx), undefined, onSaved),
    [run]
  );

  /** SPENDLY-610: custom milestones, or `null` to go back to 25/50/75/100%. */
  const changeMilestones = useCallback(
    (goal: FinancialGoal, milestones: GoalMilestone[] | null, onSaved?: OnGoalSaved) =>
      run(
        "changeMilestones",
        "goal milestones",
        milestones ? "Milestones saved" : "Milestones reset",
        (ctx) => buildMilestonesChange(goal, milestones, ctx),
        undefined,
        onSaved
      ),
    [run]
  );

  const updateSettings = useCallback(
    (goal: FinancialGoal, patch: GoalSettingsPatch, success = "Goal updated") =>
      run("updateSettings", "goal", success, (ctx) => buildSettingsChange(goal, patch, ctx)),
    [run]
  );

  /**
   * SPENDLY-609: a contribution or reduction, recorded as an audit event. A
   * manual savings record only — no account, ledger row or transfer changes.
   */
  const recordAmountChange = useCallback(
    (goal: FinancialGoal, input: AmountChangeInput, eventId: string, onSaved?: OnGoalSaved) =>
      run(
        "recordAmountChange",
        input.kind === "contribution" ? "goal contribution" : "goal reduction",
        input.kind === "contribution" ? "Added to goal" : "Taken out of goal",
        (ctx) => buildAmountChange(goal, input, ctx),
        eventId,
        onSaved
      ),
    [run]
  );

  /**
   * SPENDLY-609: correct or reverse an earlier entry. The original stays; a
   * linked event carries the difference. Its existing corrections are read
   * fresh first, so the change is computed from the entry's effective amount.
   */
  const correctEvent = useCallback(
    (goal: FinancialGoal, original: GoalEvent, input: CorrectionInput, eventId: string, onSaved?: OnGoalSaved) =>
      run(
        "correctEvent",
        "goal correction",
        input.mode === "reverse" ? "Entry reversed" : "Entry corrected",
        async (ctx) => buildCorrection(goal, original, await loadGoalCorrections(ctx.uid, original.id), input, ctx),
        eventId,
        onSaved
      ),
    [run]
  );

  /** @deprecated Kept for older callers; prefer `createGoal`. */
  const addGoal = (name: string, targetAmount: number, currentAmount: number, deadline?: string) =>
    createGoal({ name, targetAmount, initialAmount: Number(currentAmount) || 0, targetDate: deadline || undefined });

  /** Records a contribution (positive) or reduction (negative) with an audit event. */
  const addGoalContribution = (id: string, amountDelta: number) => {
    const goal = sharedGoals.find((g) => g.id === id);
    if (!goal || !amountDelta) return Promise.resolve(false);
    return run("addGoalContribution", "goal contribution", "Goal progress updated", (ctx) =>
      buildAmountChange(
        goal,
        { kind: amountDelta > 0 ? "contribution" : "reduction", amount: Math.abs(amountDelta) },
        ctx
      )
    );
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
    createGoal,
    editGoal,
    changeTarget,
    changeStatus,
    updateSettings,
    changeMilestones,
    recordAmountChange,
    correctEvent,
    addGoal,
    addGoalContribution,
    deleteGoal,
  };
};
