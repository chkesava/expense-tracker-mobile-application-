import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { GOAL_AMOUNT_EVENT_TYPES, GOAL_EVENT_TYPES, GOAL_LIMITS, GOAL_REASONS, GOAL_STATUSES } from "../types/goal";
import { GOAL_TRANSITIONS } from "./goalLifecycle";
import {
  buildAmountChange,
  buildCorrection,
  buildCreateGoal,
  buildEditGoal,
  buildMilestonesChange,
  buildSettingsChange,
  buildStatusChange,
  buildTargetChange,
  goalWritePlanToOps,
} from "./goalWrites";

/** SPENDLY-608 — the Save Goals builders and firestore.rules must agree. */
const rules = readFileSync("firestore.rules", "utf8");
const section = rules.slice(rules.indexOf("SPENDLY-606 Save Goals (SPENDLY-608)"), rules.indexOf("function investmentWellFormed("));
const fn = (name: string) => {
  const start = section.indexOf(`function ${name}(`);
  const next = section.indexOf("\n      function ", start + 1);
  return section.slice(start, next === -1 ? undefined : next);
};
const quoted = (text: string) => [...text.matchAll(/'([^']+)'/g)].map((m) => m[1]);
const firstList = (text: string, re: RegExp) => quoted(text.match(re)?.[1] ?? "");

const goalAllowed = firstList(fn("goalV2Shape"), /hasOnly\(\[([^\]]*)\]\)/);
const eventAllowed = firstList(fn("goalEventWellFormed"), /hasOnly\(\[([^\]]*)\]\)/);

const S = { serverTimestamp: () => "ts", increment: (n: number) => ({ inc: n }) };
const ctx = { uid: "u", nowMs: 10, eventId: "e" };
const full = {
  id: "g",
  name: "Car",
  targetAmount: 1000,
  currentAmount: 1000,
  deadline: "",
  schemaVersion: 2,
  version: 1,
  openingAmount: 0,
  status: "active" as const,
  nameKey: "n_car",
};

function allOps() {
  const results = [
    buildCreateGoal(
      { name: "Car", targetAmount: 1000, initialAmount: 300, description: "d", iconKey: "car", startDate: "2026-01-01", targetDate: "2027-01-01", minimumContribution: 10, currency: "INR" },
      { ...ctx, goalId: "g" },
      []
    ),
    buildEditGoal(full, { name: "Bike", description: "x", iconKey: "plane", startDate: "2026-02-01", targetDate: "2027-02-01", minimumContribution: 5 }, ctx, []),
    buildAmountChange(full, { kind: "contribution", amount: 10, reason: "gift", note: "n" }, ctx),
    buildCorrection(full, { id: "c", goalId: "g", type: "contribution", amountDelta: 100, actorUid: "u", createdAtMs: 1 }, [], { mode: "correct", amount: 50, reason: "other", note: "n" }, ctx),
    buildTargetChange(full, 2000, ctx),
    buildStatusChange(full, "completed", ctx),
    buildStatusChange(full, "archived", ctx),
    buildMilestonesChange(full, [{ id: "m", amount: 5, label: "five" }], ctx),
    buildSettingsChange(full, { pinned: true, sortOrder: 1, locked: true, reminders: { frequency: "weekly", time: "09:00", milestoneEnabled: true, inactivityEnabled: true, inactivityDays: 7 } }, ctx),
    // A legacy goal: the upgrade path adds its own fields.
    buildAmountChange({ id: "g", name: "Car", targetAmount: 1000, currentAmount: 5 }, { kind: "contribution", amount: 1 }, ctx),
  ];
  return results.flatMap((r) => {
    if (!r.ok) throw new Error(r.issues.join(","));
    return goalWritePlanToOps("u", r.plan, S);
  });
}

describe("Save Goals rules contract", () => {
  it("statuses, event types, amount event types and reasons match", () => {
    expect(quoted(fn("goalStatuses"))).toEqual([...GOAL_STATUSES]);
    expect(quoted(fn("goalEventTypes"))).toEqual([...GOAL_EVENT_TYPES]);
    expect(quoted(fn("goalAmountEventTypes"))).toEqual([...GOAL_AMOUNT_EVENT_TYPES]);
    expect(firstList(fn("goalEventWellFormed"), /d\.reason in \[([^\]]*)\]/)).toEqual([...GOAL_REASONS]);
  });

  it("the transition table matches goalLifecycle", () => {
    const body = fn("goalTransitions");
    for (const [from, tos] of Object.entries(GOAL_TRANSITIONS)) {
      expect(firstList(body, new RegExp(`'${from}': \\[([^\\]]*)\\]`))).toEqual([...tos]);
    }
    expect(quoted(fn("goalOpenStatuses"))).toEqual(["active", "paused"]);
  });

  it("allows every field a builder writes, on goals and on events", () => {
    for (const op of allOps()) {
      if (op.op === "delete") continue;
      const keys = Object.keys(op.data);
      if (op.ref.path.includes("/financialGoals/")) for (const k of keys) expect(goalAllowed, k).toContain(k);
      if (op.ref.path.includes("/goalEvents/")) for (const k of keys) expect(eventAllowed, k).toContain(k);
      if (op.ref.path.includes("/goalNames/")) expect(keys.sort()).toEqual(["createdAtMs", "goalId"]);
    }
  });

  it("limits match", () => {
    expect(fn("goalEventWellFormed")).toContain(`optionalText(d, 'note', ${GOAL_LIMITS.noteMax})`);
    expect(fn("goalV2Shape")).toContain(`optionalText(d, 'description', ${GOAL_LIMITS.descriptionMax})`);
    expect(fn("goalV2Shape")).toContain(`d.milestones.size() <= ${GOAL_LIMITS.maxMilestones}`);
  });

  it("never allows account or ledger fields on goal documents", () => {
    for (const f of ["accountId", "amount", "date", "transactionId", "ledgerEventId", "balance"]) {
      expect(goalAllowed).not.toContain(f);
      expect(eventAllowed).not.toContain(f);
    }
  });

  it("events are append-only and audited goals cannot be deleted", () => {
    expect(rules).toMatch(/match \/goalEvents\/\{eventId\} \{[\s\S]*?allow update, delete: if false;/);
    expect(rules).toMatch(/match \/goalNames\/\{key\} \{[\s\S]*?allow update: if false;/);
    expect(rules).toContain("allow delete: if isOwner(uid) && resource.data.get('schemaVersion', 0) != 2;");
  });

  it("keeps the new collections off the wildcard allowlist", () => {
    const wildcard = rules.slice(rules.indexOf("match /{collection}/{document=**}"));
    const list = wildcard.slice(0, wildcard.indexOf("];"));
    for (const c of ["financialGoals", "goalEvents", "goalNames"]) expect(list).not.toContain(`'${c}'`);
  });
});
