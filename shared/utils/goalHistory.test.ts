import { describe, expect, it } from "vitest";

import { GOAL_EVENT_TYPES, type GoalEvent } from "../types/goal";
import { canOfferCorrection, describeGoalEvent, fillAmounts, linkedCorrections, sortGoalEvents } from "./goalHistory";

const ev = (over: Partial<GoalEvent>): GoalEvent => ({
  id: "e1",
  goalId: "g1",
  type: "contribution",
  amountDelta: 500,
  actorUid: "u",
  createdAtMs: 10,
  ...over,
});

describe("describeGoalEvent", () => {
  it("has a title for every event type", () => {
    for (const type of GOAL_EVENT_TYPES) {
      expect(describeGoalEvent(ev({ type, amountDelta: 0 })).title.length).toBeGreaterThan(0);
    }
  });

  it("shows money only for amount entries, signed, with reason and note", () => {
    expect(describeGoalEvent(ev({ reason: "bonus", note: "Diwali" }))).toEqual({ title: "Added", detail: "Bonus · Diwali", amount: 500, tone: "positive" });
    expect(describeGoalEvent(ev({ type: "reduction", amountDelta: -200 }))).toMatchObject({ title: "Taken out", amount: -200, tone: "negative" });
    expect(describeGoalEvent(ev({ type: "target_changed", amountDelta: 0, targetBefore: 1000, targetAfter: 2000 }))).toMatchObject({ amount: null, amounts: [1000, 2000] });
  });

  it("names lifecycle moves the way the user made them", () => {
    const t = (statusBefore: GoalEvent["statusBefore"], statusAfter: GoalEvent["statusAfter"]) =>
      describeGoalEvent(ev({ type: "status_changed", amountDelta: 0, statusBefore, statusAfter })).title;
    expect(t("active", "paused")).toBe("Paused");
    expect(t("paused", "active")).toBe("Resumed");
    expect(t("completed", "active")).toBe("Reopened");
    expect(t("cancelled", "active")).toBe("Restored");
    expect(t("archived", "completed")).toBe("Unarchived (completed)");
  });

  it("lists changed fields by name, never values", () => {
    expect(describeGoalEvent(ev({ type: "edited", amountDelta: 0, changedFields: ["name", "targetDate"] })).detail).toBe("Changed name, target date");
  });

  it("fills amount placeholders", () => {
    expect(fillAmounts("{0} → {1}", [1000, 2000], (n) => `₹${n}`)).toBe("₹1000 → ₹2000");
  });
});

describe("corrections", () => {
  it("offers correction only on unreversed amount entries", () => {
    const original = ev({ id: "c1" });
    expect(canOfferCorrection(original, [original])).toBe(true);
    expect(canOfferCorrection(original, [original, ev({ id: "c1__rev", type: "reversal", correctionOf: "c1", amountDelta: -500 })])).toBe(false);
    expect(canOfferCorrection(ev({ type: "correction" }), [])).toBe(false);
    expect(canOfferCorrection(ev({ type: "created", amountDelta: 0 }), [])).toBe(false);
    expect(canOfferCorrection(ev({ type: "created", amountDelta: 100 }), [])).toBe(true);
  });

  it("finds linked corrections", () => {
    const list = [ev({ id: "x", type: "correction", correctionOf: "c1" }), ev({ id: "y", type: "contribution" })];
    expect(linkedCorrections("c1", list).map((e) => e.id)).toEqual(["x"]);
  });

  it("sorts newest first with a stable tie-break", () => {
    expect(sortGoalEvents([ev({ id: "a", createdAtMs: 1 }), ev({ id: "b", createdAtMs: 2 }), ev({ id: "c", createdAtMs: 2 })]).map((e) => e.id)).toEqual(["c", "b", "a"]);
  });
});
