import { describe, expect, it } from "vitest";

import type { GoalEvent } from "../types/goal";
import { estimateCompletion } from "./goalEstimate";

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 26, 12).getTime();
const ev = (type: GoalEvent["type"], amountDelta: number, daysAgo: number) => ({ type, amountDelta, createdAtMs: NOW - daysAgo * DAY });
const goal = { currentAmount: 3000, targetAmount: 12000, deadline: "" };

describe("estimateCompletion", () => {
  it("says the goal is reached instead of estimating", () => {
    expect(estimateCompletion({ ...goal, currentAmount: 12000 }, [], NOW)).toEqual({ kind: "reached" });
  });

  it("refuses to estimate with too few contributions or too short a span", () => {
    expect(estimateCompletion(goal, [ev("contribution", 1000, 30)], NOW)).toMatchObject({ kind: "insufficient", contributions: 1 });
    expect(estimateCompletion(goal, [ev("contribution", 1000, 5), ev("contribution", 1000, 1)], NOW)).toMatchObject({ kind: "insufficient", contributions: 2, spanDays: 5 });
    expect(estimateCompletion(goal, [], NOW)).toMatchObject({ kind: "insufficient", contributions: 0 });
  });

  it("ignores contributions older than 90 days", () => {
    expect(estimateCompletion(goal, [ev("contribution", 1000, 200), ev("contribution", 1000, 120)], NOW)).toMatchObject({ kind: "insufficient" });
  });

  it("estimates from the average net rate since the first recent contribution", () => {
    // 3,000 net over 30 days = 100/day; 9,000 left = 90 days.
    const e = estimateCompletion(goal, [ev("contribution", 2000, 30), ev("contribution", 1500, 15), ev("reduction", -500, 10)], NOW);
    expect(e).toMatchObject({ kind: "estimate", perMonth: 3000, contributions: 2, spanDays: 30, afterTargetDate: false });
    if (e.kind === "estimate") expect(Math.round((e.dateMs - NOW) / DAY)).toBe(90);
  });

  it("flags an estimate past the target date", () => {
    const e = estimateCompletion({ ...goal, deadline: "2026-11-30" }, [ev("contribution", 2000, 30), ev("contribution", 1000, 15)], NOW);
    expect(e).toMatchObject({ kind: "estimate", afterTargetDate: true });
  });

  it("says when savings aren't growing rather than inventing a date", () => {
    const e = estimateCompletion(goal, [ev("contribution", 500, 30), ev("contribution", 500, 20), ev("reduction", -2000, 5)], NOW);
    expect(e).toMatchObject({ kind: "not_growing" });
  });
});
