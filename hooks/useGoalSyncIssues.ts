import { useSyncExternalStore } from "react";

import { goalSyncIssues, type GoalSyncIssue } from "@/lib/goalSyncIssues";

/** SPENDLY-613: unsaved goal changes awaiting a retry, optionally for one goal. */
export function useGoalSyncIssues(goalId?: string): readonly GoalSyncIssue[] {
  const all = useSyncExternalStore(goalSyncIssues.subscribe, goalSyncIssues.list, goalSyncIssues.list);
  return goalId ? all.filter((i) => i.goalId === goalId) : all;
}
