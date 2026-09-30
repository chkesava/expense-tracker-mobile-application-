import { describe, expect, it } from "vitest";

import type { DecisionAlternative, DecisionInput, MoneyDecision } from "../types/decision";
import {
  FIRST_YEAR_BASIS,
  alternativeTotals,
  assumptionChangesSinceDecision,
  compareAlternatives,
  draftsToInputs,
  hasAssumptionChanges,
  inputToDraft,
} from "./decisionComparison";
import { buildDecisionWrite, newDecisionDraft, transitionDecision } from "./decisionModel";

const inp = (id: string, amount: number, direction: DecisionInput["direction"], frequency: DecisionInput["frequency"]): DecisionInput => ({
  id, label: id, amount, direction, frequency, kind: "user_input",
});
const alt = (id: string, inputs: DecisionInput[] = [], pros: string[] = [], cons: string[] = []): DecisionAlternative => ({ id, title: id, pros, cons, inputs });

describe("alternativeTotals", () => {
  it("adds up each kind of user input separately", () => {
    const t = alternativeTotals(alt("a", [inp("price", 60000, "cost", "one_time"), inp("emi", 2500, "cost", "monthly"), inp("amc", 1200, "cost", "yearly"), inp("resale", 10000, "benefit", "one_time"), inp("saves", 500, "benefit", "monthly")]));
    expect(t).toEqual({ oneTimeCost: 60000, monthlyCost: 2500, yearlyCost: 1200, oneTimeBenefit: 10000, monthlyBenefit: 500, yearlyBenefit: null, firstYearNet: 10000 + 6000 - 60000 - 30000 - 1200 });
  });

  it("keeps missing as null — never pretends an option is free", () => {
    expect(alternativeTotals(alt("empty"))).toEqual({ oneTimeCost: null, monthlyCost: null, yearlyCost: null, oneTimeBenefit: null, monthlyBenefit: null, yearlyBenefit: null, firstYearNet: null });
    const onlyCost = alternativeTotals(alt("c", [inp("x", 100, "cost", "one_time")]));
    expect(onlyCost.oneTimeBenefit).toBeNull();
    expect(onlyCost.firstYearNet).toBe(-100);
  });

  it("is deterministic and rounds to the paisa", () => {
    const a = alt("r", [inp("a", 0.1, "benefit", "one_time"), inp("b", 0.2, "benefit", "one_time")]);
    expect(alternativeTotals(a)).toEqual(alternativeTotals(a));
    expect(alternativeTotals(a).oneTimeBenefit).toBe(0.3);
  });

  it("says how the calculated figure is worked out", () => {
    expect(FIRST_YEAR_BASIS).toMatch(/^Calculated from your inputs/);
  });
});

describe("compareAlternatives", () => {
  const decision = { alternatives: [alt("keep"), alt("prepay", [inp("p", 100000, "cost", "one_time"), inp("i", 14000, "benefit", "yearly")], ["less interest"], ["less cash"]), alt("refi", [inp("f", 5000, "cost", "one_time")])], selectedAlternativeId: "refi" };

  it("keeps the user's order and never ranks", () => {
    const rows = compareAlternatives(decision);
    expect(rows.map((r) => r.alternative.id)).toEqual(["keep", "prepay", "refi"]);
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(["alternative", "chosenByYou", "consCount", "hasNumbers", "prosCount", "totals"]);
  });

  it("marks only the user's own choice", () => {
    expect(compareAlternatives(decision).map((r) => r.chosenByYou)).toEqual([false, false, true]);
    expect(compareAlternatives({ ...decision, selectedAlternativeId: undefined }).every((r) => !r.chosenByYou)).toBe(true);
  });

  it("works with incomplete information", () => {
    const rows = compareAlternatives(decision);
    expect(rows[0]).toMatchObject({ hasNumbers: false, prosCount: 0 });
    expect(rows[0].totals.firstYearNet).toBeNull();
    expect(rows[1]).toMatchObject({ hasNumbers: true, prosCount: 1, consCount: 1 });
  });
});

describe("draftsToInputs", () => {
  it("parses, trims and labels every number as a user input", () => {
    const out = draftsToInputs([{ id: "a", label: " Price ", amount: "1,20,000", direction: "cost", frequency: "one_time" }, { id: "b", label: "", amount: "", direction: "cost", frequency: "monthly" }]);
    expect(out).toEqual({ ok: true, inputs: [{ id: "a", label: "Price", amount: 120000, direction: "cost", frequency: "one_time", kind: "user_input" }] });
  });

  it("reports what is wrong with each row", () => {
    const out = draftsToInputs([
      { id: "a", label: "", amount: "5", direction: "cost", frequency: "one_time" },
      { id: "b", label: "Fee", amount: "5k", direction: "cost", frequency: "one_time" },
      { id: "c", label: "Fee", amount: "-5", direction: "cost", frequency: "one_time" },
    ]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.issues.map((i) => `${i.id}:${i.issue}`)).toEqual(["a:label_required", "b:amount_invalid", "c:amount_invalid"]);
  });

  it("round-trips through drafts", () => {
    const i = inp("x", 2500.5, "benefit", "monthly");
    const back = draftsToInputs([inputToDraft(i)]);
    expect(back.ok && back.inputs[0]).toEqual(i);
  });
});

describe("assumption changes since deciding", () => {
  function decided(): MoneyDecision {
    const d: MoneyDecision = {
      ...newDecisionDraft({ id: "d", title: "t", category: "loan_debt", nowMs: 1 }),
      assumptions: [
        { id: "r", text: "Rate stays", value: 9, unit: "percent", source: "user" },
        { id: "j", text: "Job is stable", source: "user" },
      ],
    };
    const r = transitionDecision(d, "decided", 2);
    if (!r.ok) throw new Error();
    return r.decision;
  }

  it("is null before deciding and empty right after", () => {
    expect(assumptionChangesSinceDecision(newDecisionDraft({ id: "x", title: "t", category: "other", nowMs: 1 }))).toBeNull();
    expect(hasAssumptionChanges(assumptionChangesSinceDecision(decided()))).toBe(false);
  });

  it("shows revised, added and dropped assumptions against the frozen snapshot", () => {
    const d = decided();
    const edited: MoneyDecision = {
      ...d,
      assumptions: [
        { id: "r", text: "Rate stays", value: 10.5, unit: "percent", source: "user" },
        { id: "n", text: "Bonus in March", source: "user" },
      ],
    };
    const c = assumptionChangesSinceDecision(edited)!;
    expect(c.changed.map((x) => [x.before.value, x.after.value])).toEqual([[9, 10.5]]);
    expect(c.added.map((a) => a.id)).toEqual(["n"]);
    expect(c.removed.map((a) => a.id)).toEqual(["j"]);
    // …and the edit is versioned: the write bumps the revision and names the field.
    const w = buildDecisionWrite(d, edited, 3);
    expect(w.ok && w.event.changedFields).toEqual(["assumptions"]);
    expect(w.ok && w.data.decisionSnapshot?.assumptions.map((a) => a.value)).toEqual([9, undefined]);
  });
});
