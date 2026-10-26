import { describe, expect, it } from "vitest";

import type { GoalEvent } from "../types/goal";
import { effectiveEventAmount, reconcileGoal, reversedEventIds } from "./goalReconcile";

const ev = (over: Partial<GoalEvent>): GoalEvent => ({
  id: "e",
  goalId: "g1",
  type: "contribution",
  amountDelta: 0,
  actorUid: "u",
  createdAtMs: 1,
  ...over,
});

describe("reconcileGoal", () => {
  it("a legacy goal with no events reconciles to its own amount", () => {
    expect(reconcileGoal({ id: "g1", currentAmount: 5000 }, []).ok).toBe(true);
  });

  it("opening amount plus deltas equals the saved amount", () => {
    const r = reconcileGoal({ id: "g1", currentAmount: 1600, schemaVersion: 2, openingAmount: 1000 }, [
      ev({ type: "migrated" }),
      ev({ amountDelta: 500 }),
      ev({ type: "reduction", amountDelta: -100 }),
      ev({ type: "correction", amountDelta: 200 }),
      ev({ type: "milestone_reached" }),
    ]);
    expect(r).toMatchObject({ opening: 1000, eventTotal: 600, expected: 1600, actual: 1600, difference: 0, ok: true });
  });

  it("reports a forged or drifted summary", () => {
    const r = reconcileGoal({ id: "g1", currentAmount: 9999, schemaVersion: 2, openingAmount: 0 }, [ev({ amountDelta: 500 })]);
    expect(r.ok).toBe(false);
    expect(r.difference).toBe(9499);
  });

  it("tolerates float dust from two-decimal increments", () => {
    const r = reconcileGoal({ id: "g1", currentAmount: 0.1 + 0.2, schemaVersion: 2, openingAmount: 0 }, [ev({ amountDelta: 0.1 }), ev({ amountDelta: 0.2 })]);
    expect(r.ok).toBe(true);
  });

  it("ignores events from another goal and counts them", () => {
    const r = reconcileGoal({ id: "g1", currentAmount: 100, schemaVersion: 2, openingAmount: 0 }, [ev({ amountDelta: 100 }), ev({ goalId: "g2", amountDelta: 50 })]);
    expect(r.ok).toBe(true);
    expect(r.foreignEvents).toBe(1);
  });
});

describe("corrections", () => {
  it("finds reversed events and effective amounts", () => {
    const original = ev({ id: "c1", amountDelta: 500 });
    const related = [ev({ id: "x", type: "correction", correctionOf: "c1", amountDelta: -200 }), ev({ id: "c1__rev", type: "reversal", correctionOf: "c1", amountDelta: -300 })];
    expect(reversedEventIds(related)).toEqual(new Set(["c1"]));
    expect(effectiveEventAmount(original, related)).toBe(0);
    expect(effectiveEventAmount(original, related.slice(0, 1))).toBe(300);
  });
});
