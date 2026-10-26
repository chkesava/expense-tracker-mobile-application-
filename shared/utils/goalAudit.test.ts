import { describe, expect, it } from "vitest";

import type { FinancialGoal } from "../types/expense";
import type { GoalEvent } from "../types/goal";
import { auditGoals, summarizeAudits } from "./goalAudit";

const g = (id: string, over: Partial<FinancialGoal> = {}): FinancialGoal => ({ id, name: id, targetAmount: 1000, currentAmount: 100, ...over });
const ev = (goalId: string, amountDelta: number): GoalEvent => ({ id: `${goalId}-${amountDelta}`, goalId, type: "contribution", amountDelta, actorUid: "u", createdAtMs: 1 });

describe("auditGoals (SPENDLY-615, read-only)", () => {
  it("counts legacy vs upgraded goals and finds duplicate names that would block an upgrade", () => {
    const r = auditGoals([g("a", { name: "Car" }), g("b", { name: " car " }), g("c", { name: "Trip", schemaVersion: 2, openingAmount: 100 })], new Map([["c", []]]));
    expect(r).toMatchObject({ goals: 3, legacy: 2, upgraded: 1, duplicateNameGroups: [["a", "b"]], invalidAmounts: [], reconcileMismatches: [] });
  });

  it("flags amounts the v2 rules wouldn't accept", () => {
    const r = auditGoals([g("neg", { currentAmount: -5 }), g("nan", { currentAmount: Number.NaN }), g("zero", { targetAmount: 0 }), g("big", { targetAmount: 1e10 }), g("ok")]);
    expect(r.invalidAmounts).toEqual(["big", "nan", "neg", "zero"]);
  });

  it("reconciles upgraded goals against their history, and says when it couldn't", () => {
    const goals = [g("a", { schemaVersion: 2, openingAmount: 50, currentAmount: 150 }), g("b", { schemaVersion: 2, openingAmount: 0, currentAmount: 999 }), g("c", { schemaVersion: 2 })];
    const r = auditGoals(goals, new Map([["a", [ev("a", 100)]], ["b", [ev("b", 100)]]]));
    expect(r.reconcileMismatches).toEqual([{ goalId: "b", difference: 899 }]);
    expect(r.notReconciled).toBe(1);
  });

  it("never reports names or amounts beyond the difference", () => {
    const r = auditGoals([g("a", { name: "Secret plan" })]);
    expect(JSON.stringify(r)).not.toContain("Secret");
  });

  it("summarises across users", () => {
    const one = auditGoals([g("a"), g("b", { name: "a" })]);
    expect(summarizeAudits([one, one])).toMatchObject({ users: 2, goals: 4, legacy: 4, duplicateNameGroups: 2 });
  });
});
