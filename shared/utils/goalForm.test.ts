import { describe, expect, it } from "vitest";

import { EMPTY_GOAL_FORM, goalFormFromGoal, parseGoalForm } from "./goalForm";

const form = (over: Partial<typeof EMPTY_GOAL_FORM> = {}) => ({ ...EMPTY_GOAL_FORM, name: "Trip", target: "50,000", ...over });
const create = { mode: "create" as const, goals: [{ id: "g1", name: "Car" }] };

describe("parseGoalForm", () => {
  it("parses a valid create form", () => {
    expect(parseGoalForm(form({ initial: "1000", minimum: "500", targetDate: "2027-01-01", description: " Goa " }), create)).toEqual({
      ok: true,
      value: {
        name: "Trip",
        targetAmount: 50000,
        initialAmount: 1000,
        description: "Goa",
        iconKey: "piggy-bank",
        startDate: undefined,
        targetDate: "2027-01-01",
        minimumContribution: 500,
      },
    });
  });

  it("reports each field's problem", () => {
    const r = parseGoalForm(
      form({ name: " car ", target: "0", initial: "-5", minimum: "abc", startDate: "2027-02-01", targetDate: "2027-01-01", description: "x".repeat(281) }),
      create
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(["description", "initial", "minimum", "name", "target", "targetDate"]);
    expect(r.errors.name).toBe("You already have a goal with this name.");
  });

  it("allows keeping the goal's own name on edit and ignores the initial amount", () => {
    const r = parseGoalForm(form({ name: "Car", initial: "garbage" }), { mode: "edit", goals: [{ id: "g1", name: "Car" }], selfId: "g1" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.initialAmount).toBe(0);
  });

  it("rejects a minimum above the target", () => {
    const r = parseGoalForm(form({ target: "100", minimum: "500" }), create);
    expect(r.ok ? null : r.errors.minimum).toBeTruthy();
  });

  it("round-trips an existing goal", () => {
    const values = goalFormFromGoal({ id: "g", name: "Car", targetAmount: 900, currentAmount: 0, deadline: "", minimumContribution: 50, iconKey: "car" });
    expect(values).toMatchObject({ name: "Car", target: "900", minimum: "50", iconKey: "car", targetDate: "" });
  });
});
