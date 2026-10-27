/**
 * SPENDLY-608 — Goals screen list logic: tabs, status filters, sorting and
 * manual reordering. Pure; the screen only renders what this returns.
 */

import type { FinancialGoal } from "../types/expense";
import type { GoalStatus } from "../types/goal";
import { goalStatus, goalTab, sortGoals, type GoalSort, type GoalTab } from "./goalModel";

export const GOAL_TABS: ReadonlyArray<{ id: GoalTab; label: string }> = [
  { id: "active", label: "Active" },
  { id: "completed", label: "Completed" },
  { id: "archived", label: "Archived" },
];

/** Status chips inside a tab, so paused and cancelled goals stay discoverable. */
export const GOAL_TAB_STATUSES: Readonly<Record<GoalTab, readonly GoalStatus[]>> = {
  active: ["active", "paused"],
  completed: ["completed"],
  archived: ["archived", "cancelled"],
};

export const GOAL_SORT_OPTIONS: ReadonlyArray<{ id: GoalSort; label: string }> = [
  { id: "manual", label: "My order" },
  { id: "created", label: "Date created" },
  { id: "progress", label: "Progress" },
  { id: "remaining", label: "Amount remaining" },
  { id: "name", label: "Name" },
  { id: "target", label: "Target amount" },
];

export function goalsForTab(
  goals: readonly FinancialGoal[],
  tab: GoalTab,
  status: GoalStatus | "all",
  sort: GoalSort
): FinancialGoal[] {
  const inTab = goals.filter((g) => goalTab(g) === tab && (status === "all" || goalStatus(g) === status));
  return sortGoals(inTab, sort);
}

export function tabCounts(goals: readonly FinancialGoal[]): Record<GoalTab, number> {
  const out: Record<GoalTab, number> = { active: 0, completed: 0, archived: 0 };
  for (const g of goals) out[goalTab(g)] += 1;
  return out;
}

export type SortOrderUpdate = { goal: FinancialGoal; sortOrder: number };

/**
 * Move one goal up or down in a list already sorted by "manual". Pinned goals
 * and unpinned goals reorder within their own group. Returns the minimum set
 * of `sortOrder` writes: usually a swap of two values; when neighbours share a
 * value (legacy goals with none set), the whole group is renumbered so the
 * order sticks on every device.
 */
export function moveGoal(sorted: readonly FinancialGoal[], index: number, direction: -1 | 1): SortOrderUpdate[] {
  const target = index + direction;
  if (index < 0 || index >= sorted.length || target < 0 || target >= sorted.length) return [];
  const a = sorted[index];
  const b = sorted[target];
  if (Boolean(a.pinned) !== Boolean(b.pinned)) return [];

  const keyOf = (g: FinancialGoal, i: number) => (typeof g.sortOrder === "number" ? g.sortOrder : i);
  const ka = keyOf(a, index);
  const kb = keyOf(b, target);
  if (ka !== kb && typeof a.sortOrder === "number" && typeof b.sortOrder === "number") {
    return [
      { goal: a, sortOrder: kb },
      { goal: b, sortOrder: ka },
    ];
  }
  // Renumber the group 1..n in the new order.
  const group = sorted.filter((g) => Boolean(g.pinned) === Boolean(a.pinned));
  const from = group.indexOf(a);
  const to = group.indexOf(b);
  const next = [...group];
  next.splice(from, 1);
  next.splice(to, 0, a);
  return next
    .map((goal, i) => ({ goal, sortOrder: i + 1 }))
    .filter((u) => u.goal.sortOrder !== u.sortOrder);
}
