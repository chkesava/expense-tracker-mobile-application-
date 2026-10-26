import { useCallback, useEffect } from "react";

import { friendlyErrorMessage, logError } from "@/lib/errors";
import { writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useAuth } from "@/providers/AuthProvider";
import { useExpenseReferenceData } from "@/providers/ExpenseReferenceDataProvider";
import { commitGoalWrite, newGoalEventId, newGoalId } from "@/services/goals/goalStore";
import type { FinancialGoal } from "@/shared/types/expense";
import type { GoalStatus } from "@/shared/types/goal";
import { goalIssuesMessage } from "@/shared/utils/goalMessages";
import {
  buildAmountChange,
  buildCreateGoal,
  buildEditGoal,
  buildSettingsChange,
  buildStatusChange,
  buildTargetChange,
  type GoalDetailsPatch,
  type GoalInput,
  type GoalSettingsPatch,
  type GoalWriteContext,
  type GoalWriteResult,
} from "@/shared/utils/goalWrites";

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
      build: (ctx: GoalWriteContext) => GoalWriteResult
    ): Promise<boolean> => {
      if (!uid) return false;
      let result: GoalWriteResult;
      try {
        result = build({ uid, nowMs: Date.now(), eventId: newGoalEventId(uid) });
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
    (goal: FinancialGoal, targetAmount: number) =>
      run("changeTarget", "goal target", "Target updated", (ctx) => buildTargetChange(goal, targetAmount, ctx)),
    [run]
  );

  const changeStatus = useCallback(
    (goal: FinancialGoal, to: GoalStatus, success: string) =>
      run("changeStatus", "goal", success, (ctx) => buildStatusChange(goal, to, ctx)),
    [run]
  );

  const updateSettings = useCallback(
    (goal: FinancialGoal, patch: GoalSettingsPatch, success = "Goal updated") =>
      run("updateSettings", "goal", success, (ctx) => buildSettingsChange(goal, patch, ctx)),
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
    addGoal,
    addGoalContribution,
    deleteGoal,
  };
};
