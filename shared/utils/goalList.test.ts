import { describe, expect, it } from "vitest";

import type { FinancialGoal } from "../types/expense";
import { goalsForTab, moveGoal, tabCounts } from "./goalList";

const goal = (id: string, over: Partial<FinancialGoal> = {}): FinancialGoal => ({
  id,
  name: id,
  targetAmount: 1000,
  currentAmount: 100,
  ...over,
});

describe("tabs and filters", () => {
  const goals = [
    goal("a"),
    goal("b", { status: "paused" }),
    goal("c", { status: "completed" }),
    goal("d", { status: "archived" }),
    goal("e", { status: "cancelled" }),
  ];

  it("splits goals across the three tabs without losing paused or cancelled ones", () => {
    expect(tabCounts(goals)).toEqual({ active: 2, completed: 1, archived: 2 });
    expect(goalsForTab(goals, "active", "all", "name").map((g) => g.id)).toEqual(["a", "b"]);
    expect(goalsForTab(goals, "active", "paused", "name").map((g) => g.id)).toEqual(["b"]);
    expect(goalsForTab(goals, "archived", "cancelled", "name").map((g) => g.id)).toEqual(["e"]);
    expect(goalsForTab(goals, "completed", "all", "name").map((g) => g.id)).toEqual(["c"]);
  });
});

describe("moveGoal", () => {
  it("swaps sortOrder with the neighbour", () => {
    const list = [goal("a", { sortOrder: 10 }), goal("b", { sortOrder: 20 }), goal("c", { sortOrder: 30 })];
    expect(moveGoal(list, 1, -1).map((u) => [u.goal.id, u.sortOrder])).toEqual([
      ["b", 10],
      ["a", 20],
    ]);
  });

  it("renumbers when neighbours have no order yet (legacy goals)", () => {
    const list = [goal("a"), goal("b"), goal("c")];
    expect(moveGoal(list, 2, -1).map((u) => [u.goal.id, u.sortOrder])).toEqual([
      ["a", 1],
      ["c", 2],
      ["b", 3],
    ]);
  });

  it("does nothing at the edges or across the pinned boundary", () => {
    const list = [goal("p", { pinned: true, sortOrder: 1 }), goal("a", { sortOrder: 2 })];
    expect(moveGoal(list, 0, -1)).toEqual([]);
    expect(moveGoal(list, 1, 1)).toEqual([]);
    expect(moveGoal(list, 1, -1)).toEqual([]);
  });
});
