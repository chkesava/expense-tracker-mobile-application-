import { describe, expect, it } from "vitest";

import type { FinancialGoal } from "../types/expense";
import type { GoalEvent } from "../types/goal";
import { analyticsSummaryText, analyzeGoals, comparePeriods, goalRange, reconcileGoals } from "./goalAnalytics";

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
const NOW = at(2026, 10, 26);

const goal = (id: string, over: Partial<FinancialGoal> = {}): FinancialGoal => ({
  id,
  name: id.toUpperCase(),
  targetAmount: 1000,
  currentAmount: 0,
  schemaVersion: 2,
  openingAmount: 0,
  status: "active",
  ...over,
});
let n = 0;
const ev = (goalId: string, type: GoalEvent["type"], amountDelta: number, createdAtMs: number): GoalEvent => ({
  id: `e${(n += 1)}`,
  goalId,
  type,
  amountDelta,
  actorUid: "u",
  createdAtMs,
});

describe("goalRange", () => {
  it("builds calendar ranges with the previous period", () => {
    const m = goalRange("month", NOW)!;
    expect(new Date(m.fromMs).getMonth()).toBe(9);
    expect(new Date(m.toMs).getMonth()).toBe(10);
    expect(m.label).toBe("Oct 2026");
    expect(m.previous?.label).toBe("Sep 2026");
    expect(goalRange("quarter", NOW)!.label).toBe("Q4 2026");
    expect(goalRange("quarter", at(2026, 2, 1))!.previous?.label).toBe("Q4 2025");
    expect(goalRange("year", NOW)!.previous?.label).toBe("2025");
    expect(goalRange("all", NOW)!.previous).toBeNull();
  });

  it("includes both custom end days and rejects bad input", () => {
    const r = goalRange("custom", NOW, { from: "2026-10-01", to: "2026-10-01" })!;
    expect(r.toMs - r.fromMs).toBe(new Date(2026, 9, 2).getTime() - new Date(2026, 9, 1).getTime());
    expect(r.previous!.toMs).toBe(r.fromMs);
    expect(goalRange("custom", NOW, { from: "2026-10-05", to: "2026-10-01" })).toBeNull();
    expect(goalRange("custom", NOW, { from: "bad", to: "2026-10-01" })).toBeNull();
  });
});

describe("analyzeGoals", () => {
  const goals = [goal("a"), goal("b", { status: "completed" }), goal("c", { status: "archived" })];
  const events = [
    ev("a", "created", 100, at(2026, 9, 1)),
    ev("a", "contribution", 500, at(2026, 10, 2)),
    ev("a", "reduction", -200, at(2026, 10, 3)),
    ev("a", "correction", -50, at(2026, 10, 4)),
    ev("b", "contribution", 1000, at(2026, 10, 5)),
    ev("b", "milestone_reached", 0, at(2026, 10, 5)),
    ev("b", "completed", 0, at(2026, 10, 6)),
    ev("c", "contribution", 300, at(2026, 10, 7)),
    ev("zzz", "contribution", 9999, at(2026, 10, 7)),
  ];
  const october = goalRange("month", NOW)!;

  it("totals increases, decreases and net from the events in range and scope", () => {
    const a = analyzeGoals(goals, events, { statuses: [], range: october });
    expect(a).toMatchObject({
      goalCount: 3,
      increased: 1800,
      decreased: 250,
      net: 1550,
      contributionCount: 3,
      reductionCount: 1,
      averageContribution: 600,
      completions: 1,
      milestonesReached: 1,
    });
    expect(a.completionRate).toBeCloseTo(1 / 3);
    expect(a.perGoal.map((r) => [r.goalId, r.net])).toEqual([["b", 1000], ["c", 300], ["a", 250]]);
  });

  it("filters by status, including archived and cancelled history", () => {
    const archived = analyzeGoals(goals, events, { statuses: ["archived"], range: october });
    expect(archived).toMatchObject({ goalCount: 1, net: 300 });
    expect(analyzeGoals(goals, events, { statuses: ["cancelled"], range: october }).goalCount).toBe(0);
  });

  it("builds a monthly series with a running total", () => {
    const all = analyzeGoals(goals, events, { statuses: [], range: goalRange("all", NOW)! });
    expect(all.months).toEqual([
      { key: "2026-09", increased: 100, decreased: 0, net: 100, cumulative: 100 },
      { key: "2026-10", increased: 1800, decreased: 250, net: 1550, cumulative: 1650 },
    ]);
  });

  it("compares periods and describes itself in plain text", () => {
    const cur = analyzeGoals(goals, events, { statuses: [], range: october });
    const prev = analyzeGoals(goals, events, { statuses: [], range: october.previous! });
    const cmp = comparePeriods(cur, prev);
    expect(cmp.net).toEqual({ current: 1550, previous: 100, change: 14.5 });
    expect(comparePeriods(prev, analyzeGoals(goals, [], { statuses: [], range: october })).net.change).toBeNull();
    expect(analyticsSummaryText(cur, "Oct 2026", (v) => `₹${v}`)).toContain("Saved ₹1800 and took out ₹250, net ₹1550.");
  });
});

describe("reconcileGoals", () => {
  it("flags only goals whose saved amount doesn't match opening + history", () => {
    const g = [goal("a", { currentAmount: 350 }), goal("b", { currentAmount: 999 })];
    const e = [ev("a", "created", 100, 1), ev("a", "contribution", 250, 2), ev("b", "contribution", 500, 3)];
    expect(reconcileGoals(g, e)).toEqual([{ goalId: "b", name: "B", difference: 499 }]);
  });
});
