import { describe, expect, it } from "vitest";

import type { FinancialGoal } from "../types/expense";
import type { GoalEvent } from "../types/goal";
import {
  CelebrationGuard,
  celebrationFor,
  completionSummary,
  milestoneStatus,
  nextMilestoneId,
  parseMilestoneRows,
  targetJustReached,
} from "./goalAchievements";
import { buildAmountChange, buildStatusChange } from "./goalWrites";

const goal = (over: Partial<FinancialGoal> = {}): FinancialGoal => ({
  id: "g1",
  name: "Trip",
  targetAmount: 1000,
  currentAmount: 400,
  schemaVersion: 2,
  version: 1,
  openingAmount: 0,
  status: "active",
  ...over,
});
const ctx = { uid: "u", nowMs: 1_000, eventId: "e1" };
const events = (r: ReturnType<typeof buildAmountChange>): GoalEvent[] => (r.ok ? r.plan.events : []);

describe("celebrationFor", () => {
  it("celebrates the highest milestone a contribution crosses, once", () => {
    const c = celebrationFor("Trip", events(buildAmountChange(goal({ currentAmount: 100 }), { kind: "contribution", amount: 700 }, ctx)));
    expect(c).toMatchObject({ eventId: "e1__ms_p75", kind: "milestone", amounts: [750] });
  });

  it("celebrates completion over milestones", () => {
    const r = buildStatusChange(goal({ currentAmount: 1000 }), "completed", ctx);
    expect(celebrationFor("Trip", r.ok ? r.plan.events : [])).toMatchObject({ kind: "completed", eventId: "e1" });
  });

  it("never celebrates a loss or a plain contribution", () => {
    expect(celebrationFor("Trip", events(buildAmountChange(goal({ currentAmount: 600 }), { kind: "reduction", amount: 200 }, ctx)))).toBeNull();
    expect(celebrationFor("Trip", events(buildAmountChange(goal({ currentAmount: 260 }), { kind: "contribution", amount: 10 }, ctx)))).toBeNull();
  });

  it("a retried write carries the same ids, and the guard celebrates once", () => {
    const g = goal({ currentAmount: 100 });
    const first = celebrationFor("Trip", events(buildAmountChange(g, { kind: "contribution", amount: 200 }, ctx)))!;
    const retry = celebrationFor("Trip", events(buildAmountChange(g, { kind: "contribution", amount: 200 }, ctx)))!;
    expect(retry.eventId).toBe(first.eventId);
    const guard = new CelebrationGuard(2);
    expect(guard.claim(first.eventId)).toBe(true);
    expect(guard.claim(retry.eventId)).toBe(false);
    guard.claim("a");
    guard.claim("b");
    // Bounded: the oldest id is forgotten once capacity is exceeded.
    expect(guard.claim(first.eventId)).toBe(true);
  });

  it("re-reaching a milestone after a drop is a new achievement (new cause id)", () => {
    const up = celebrationFor("Trip", events(buildAmountChange(goal({ currentAmount: 400 }), { kind: "contribution", amount: 100 }, { ...ctx, eventId: "again" })));
    expect(up?.eventId).toBe("again__ms_p50");
  });
});

describe("targetJustReached", () => {
  it("is true only for the write that crosses the target on an open goal", () => {
    expect(targetJustReached(goal({ currentAmount: 900 }), 100)).toBe(true);
    expect(targetJustReached(goal({ currentAmount: 900 }), 50)).toBe(false);
    expect(targetJustReached(goal({ currentAmount: 1000 }), 50)).toBe(false);
    expect(targetJustReached(goal({ currentAmount: 900, status: "completed" }), 100)).toBe(false);
    expect(targetJustReached(goal({ currentAmount: 900 }), -100)).toBe(false);
  });
});

describe("milestoneStatus and completionSummary", () => {
  it("derives reached milestones and the next one", () => {
    const s = milestoneStatus(goal({ currentAmount: 600 }));
    expect(s.rows.map((r) => [r.id, r.reached])).toEqual([["p25", true], ["p50", true], ["p75", false], ["p100", false]]);
    expect(s).toMatchObject({ reachedCount: 2, toNext: 150, custom: false });
    expect(s.next?.id).toBe("p75");
  });

  it("follows a dropped amount: current status changes, nothing stored", () => {
    expect(milestoneStatus(goal({ currentAmount: 300 })).reachedCount).toBe(1);
  });

  it("summarises a completed goal without reading history", () => {
    const s = completionSummary(goal({ status: "completed", currentAmount: 1200, createdAtMs: 0, completedAtMs: 10 * 86_400_000 }));
    expect(s).toEqual({ target: 1000, finalAmount: 1200, surplus: 200, days: 10, completedAtMs: 864_000_000, milestonesReached: 4, milestonesTotal: 4 });
    expect(completionSummary(goal()).days).toBeNull();
  });
});

describe("milestone editor", () => {
  it("parses rows, keeps ids, sorts by amount, allows stretch milestones above target", () => {
    expect(parseMilestoneRows([{ id: "p50", amount: "500", label: "Half way" }, { id: "m1", amount: "1,500", label: "" }])).toEqual({
      ok: true,
      milestones: [{ id: "p50", amount: 500, label: "Half way" }, { id: "m1", amount: 1500 }],
    });
  });

  it("rejects zero, duplicates and long labels per row", () => {
    const r = parseMilestoneRows([
      { id: "a", amount: "0", label: "" },
      { id: "b", amount: "100", label: "" },
      { id: "c", amount: "100", label: "" },
      { id: "d", amount: "200", label: "x".repeat(41) },
    ]);
    expect(r.ok ? null : Object.keys(r.errors).sort()).toEqual(["a", "c", "d"]);
  });

  it("mints ids that never collide", () => {
    expect(nextMilestoneId([{ id: "m1" }, { id: "p25" }])).toBe("m2");
  });
});
