import { describe, expect, it } from "vitest";

import type { FinancialGoal } from "../types/expense";
import { GOAL_STATUSES, type GoalStatus } from "../types/goal";
import { availableGoalActions, checkGoalTransition } from "./goalLifecycle";

const goal = (over: Partial<FinancialGoal> = {}): FinancialGoal => ({
  id: "g1",
  name: "Car",
  targetAmount: 1000,
  currentAmount: 400,
  ...over,
});

const allowed = (g: FinancialGoal) => GOAL_STATUSES.filter((to) => checkGoalTransition(g, to).ok);

describe("transitions", () => {
  it("active can pause, cancel and archive; complete needs the target", () => {
    // Listed in GOAL_STATUSES order.
    expect(allowed(goal())).toEqual(["paused", "archived", "cancelled"]);
    expect(checkGoalTransition(goal(), "completed")).toEqual({ ok: false, issue: "target_not_reached" });
    expect(allowed(goal({ currentAmount: 1000 }))).toEqual(["paused", "completed", "archived", "cancelled"]);
  });

  it("legacy goals (no status) behave as active", () => {
    expect(allowed(goal({ status: undefined }))).toEqual(allowed(goal({ status: "active" })));
  });

  it("paused can resume, cancel, archive, or complete when reached", () => {
    expect(allowed(goal({ status: "paused" }))).toEqual(["active", "archived", "cancelled"]);
    expect(allowed(goal({ status: "paused", currentAmount: 1500 }))).toEqual(["active", "completed", "archived", "cancelled"]);
  });

  it("completed can only reopen or archive", () => {
    expect(allowed(goal({ status: "completed", currentAmount: 1000 }))).toEqual(["active", "archived"]);
  });

  it("cancelled can restore or archive", () => {
    expect(allowed(goal({ status: "cancelled" }))).toEqual(["active", "archived"]);
  });

  it("archived restores only to the status it came from", () => {
    expect(allowed(goal({ status: "archived", statusBeforeArchive: "completed" }))).toEqual(["completed"]);
    expect(allowed(goal({ status: "archived", statusBeforeArchive: "paused" }))).toEqual(["paused"]);
    expect(allowed(goal({ status: "archived" }))).toEqual(["active"]);
  });

  it("never allows a no-op transition", () => {
    for (const s of GOAL_STATUSES) {
      expect(checkGoalTransition(goal({ status: s as GoalStatus, currentAmount: 1000 }), s).ok).toBe(false);
    }
  });
});

describe("actions", () => {
  it("offers only valid actions", () => {
    expect(availableGoalActions(goal())).toEqual(["pause", "cancel", "archive"]);
    expect(availableGoalActions(goal({ currentAmount: 1000 }))).toEqual(["complete", "pause", "cancel", "archive"]);
    expect(availableGoalActions(goal({ status: "paused" }))).toEqual(["resume", "cancel", "archive"]);
    expect(availableGoalActions(goal({ status: "completed", currentAmount: 1000 }))).toEqual(["reopen", "archive"]);
    expect(availableGoalActions(goal({ status: "cancelled" }))).toEqual(["restore", "archive"]);
    expect(availableGoalActions(goal({ status: "archived", statusBeforeArchive: "cancelled" }))).toEqual(["unarchive"]);
  });

  it("never offers delete", () => {
    for (const s of GOAL_STATUSES) {
      expect(availableGoalActions(goal({ status: s }))).not.toContain("delete");
    }
  });
});
