import { useEffect, useState } from "react";

import { logWarning } from "@/lib/errors";
import { useAuth } from "@/providers/AuthProvider";
import { loadRecentGoalEvents } from "@/services/goals/goalStore";
import type { FinancialGoal } from "@/shared/types/expense";
import { ESTIMATE_WINDOW_DAYS, estimateCompletion, type GoalEstimate } from "@/shared/utils/goalEstimate";

/**
 * SPENDLY-612 — a goal's estimated completion date (FRD FR-11), from the
 * last 90 days of its own events. One bounded read when the goal page opens,
 * repeated only when the goal's saved amount or target changes (its
 * `version`). Null while loading or if the read failed (the page then shows
 * nothing rather than a guess).
 */
export function useGoalEstimate(goal: FinancialGoal | undefined): GoalEstimate | null {
  const { user } = useAuth();
  const uid = user?.uid;
  const [estimate, setEstimate] = useState<GoalEstimate | null>(null);
  const goalId = goal?.id;
  const version = goal?.version ?? 0;
  const saved = goal?.currentAmount;
  const target = goal?.targetAmount;
  const deadline = goal?.deadline;

  useEffect(() => {
    if (!uid || !goalId || saved === undefined || target === undefined) return;
    let cancelled = false;
    const now = Date.now();
    loadRecentGoalEvents(uid, goalId, now - ESTIMATE_WINDOW_DAYS * 86_400_000)
      .then((events) => {
        if (!cancelled) setEstimate(estimateCompletion({ currentAmount: saved, targetAmount: target, deadline }, events, now));
      })
      .catch((error) => {
        logWarning("goalEstimate.load", error);
        if (!cancelled) setEstimate(null);
      });
    return () => {
      cancelled = true;
    };
  }, [uid, goalId, version, saved, target, deadline]);

  return estimate;
}
