import { describe, expect, it } from "vitest";

import { defaultMilestones, goalMilestones, milestoneCrossings, validateMilestones } from "./goalMilestones";

describe("milestone configuration", () => {
  it("defaults to 25/50/75/100% of the target", () => {
    expect(defaultMilestones(1000).map((m) => [m.id, m.amount])).toEqual([
      ["p25", 250],
      ["p50", 500],
      ["p75", 750],
      ["p100", 1000],
    ]);
    expect(defaultMilestones(0)).toEqual([]);
    expect(defaultMilestones(Number.NaN)).toEqual([]);
  });

  it("uses custom milestones when set, sorted by amount; defaults follow the target", () => {
    expect(goalMilestones({ targetAmount: 1000, milestones: [{ id: "b", amount: 900 }, { id: "a", amount: 100 }] }).map((m) => m.id)).toEqual(["a", "b"]);
    expect(goalMilestones({ targetAmount: 2000, milestones: [] })[0].amount).toBe(500);
  });

  it("validates ids, amounts, labels and count", () => {
    expect(validateMilestones([{ id: "a", amount: 10 }])).toEqual([]);
    expect(validateMilestones([{ id: "a", amount: 0 }])).toEqual(["milestones_invalid"]);
    expect(validateMilestones([{ id: "a", amount: 10 }, { id: "a", amount: 20 }])).toEqual(["milestones_invalid"]);
    expect(validateMilestones([{ id: "bad id", amount: 10 }])).toEqual(["milestones_invalid"]);
    expect(validateMilestones([{ id: "a", amount: 10, label: "x".repeat(41) }])).toEqual(["milestones_invalid"]);
    expect(validateMilestones(Array.from({ length: 11 }, (_, i) => ({ id: `m${i}`, amount: i + 1 })))).toEqual(["milestones_invalid"]);
  });
});

describe("crossings", () => {
  const ms = defaultMilestones(1000);

  it("records each newly reached milestone with a deterministic id", () => {
    const out = milestoneCrossings({ milestones: ms, saved: 200 }, { milestones: ms, saved: 600 }, "ev1");
    expect(out).toEqual([
      { eventId: "ev1__ms_p25", type: "milestone_reached", milestoneId: "p25", milestoneAmount: 250 },
      { eventId: "ev1__ms_p50", type: "milestone_reached", milestoneId: "p50", milestoneAmount: 500 },
    ]);
    // Same inputs, same ids: a retry cannot add a second achievement.
    expect(milestoneCrossings({ milestones: ms, saved: 200 }, { milestones: ms, saved: 600 }, "ev1")).toEqual(out);
  });

  it("records a drop below a reached milestone as lost, and re-reaching as a new event", () => {
    expect(milestoneCrossings({ milestones: ms, saved: 600 }, { milestones: ms, saved: 400 }, "ev2")).toEqual([
      { eventId: "ev2__ms_p50", type: "milestone_lost", milestoneId: "p50", milestoneAmount: 500 },
    ]);
    expect(milestoneCrossings({ milestones: ms, saved: 400 }, { milestones: ms, saved: 500 }, "ev3")).toEqual([
      { eventId: "ev3__ms_p50", type: "milestone_reached", milestoneId: "p50", milestoneAmount: 500 },
    ]);
  });

  it("handles target changes that move default milestones", () => {
    const raised = defaultMilestones(2000);
    expect(milestoneCrossings({ milestones: ms, saved: 600 }, { milestones: raised, saved: 600 }, "t1").map((c) => [c.milestoneId, c.type])).toEqual([
      ["p50", "milestone_lost"],
    ]);
    const lowered = defaultMilestones(500);
    expect(milestoneCrossings({ milestones: ms, saved: 600 }, { milestones: lowered, saved: 600 }, "t2").map((c) => [c.milestoneId, c.type])).toEqual([
      ["p75", "milestone_reached"],
      ["p100", "milestone_reached"],
    ]);
  });

  it("does not record removing a milestone as lost progress", () => {
    expect(milestoneCrossings({ milestones: ms, saved: 600 }, { milestones: ms.slice(2), saved: 600 }, "e")).toEqual([]);
  });

  it("records nothing when nothing crosses", () => {
    expect(milestoneCrossings({ milestones: ms, saved: 260 }, { milestones: ms, saved: 490 }, "e")).toEqual([]);
  });
});
