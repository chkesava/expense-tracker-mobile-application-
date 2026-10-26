import { describe, expect, it } from "vitest";

import type { FinancialGoal } from "../types/expense";
import type { GoalEvent } from "../types/goal";
import type { MutationOp } from "../types/mutations";
import { reconcileGoal } from "./goalReconcile";
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
  type GoalWritePlan,
  type GoalWriteResult,
} from "./goalWrites";

const UID = "u1";
const ctx = (eventId = "ev1", nowMs = 1_000_000) => ({ uid: UID, nowMs, eventId });

const TS = { __ts: true };
const sentinels = {
  serverTimestamp: () => TS,
  increment: (n: number) => ({ __inc: n }),
};

const v2 = (over: Partial<FinancialGoal> = {}): FinancialGoal => ({
  id: "g1",
  name: "Car",
  normalizedName: "car",
  targetAmount: 1000,
  currentAmount: 400,
  deadline: "",
  schemaVersion: 2,
  version: 3,
  openingAmount: 0,
  status: "active",
  ...over,
});

const legacy = (over: Partial<FinancialGoal> = {}): FinancialGoal => ({
  id: "g1",
  name: "Car",
  targetAmount: 1000,
  currentAmount: 400,
  deadline: "2027-01-01",
  ...over,
});

function plan(result: GoalWriteResult): GoalWritePlan {
  if (!result.ok) throw new Error(`expected ok, got ${result.issues.join(",")}`);
  return result.plan;
}

// ---------------------------------------------------------------------------
// A tiny in-memory Firestore that applies outbox ops, to prove that the summary
// and the event log stay reconciled across a sequence of writes.
// ---------------------------------------------------------------------------
type Store = Map<string, Record<string, unknown>>;

function apply(store: Store, ops: MutationOp[]) {
  for (const op of ops) {
    if (op.op === "delete") {
      store.delete(op.ref.path);
      continue;
    }
    if (op.op === "set" && store.has(op.ref.path) && op.ref.path.includes("/goalEvents/")) {
      throw new Error(`event ${op.ref.path} already exists (create-only)`);
    }
    const prev = op.op === "update" ? (store.get(op.ref.path) ?? {}) : {};
    const next: Record<string, unknown> = { ...prev };
    for (const [k, v] of Object.entries(op.data)) {
      if (v && typeof v === "object" && "__inc" in v) next[k] = (Number(prev[k]) || 0) + (v as { __inc: number }).__inc;
      else next[k] = v;
    }
    store.set(op.ref.path, next);
  }
}

function readGoal(store: Store, id = "g1"): FinancialGoal {
  return { id, ...(store.get(`users/${UID}/financialGoals/${id}`) as object) } as FinancialGoal;
}

function readEvents(store: Store): GoalEvent[] {
  return [...store.entries()]
    .filter(([p]) => p.includes("/goalEvents/"))
    .map(([p, d]) => ({ id: p.split("/").pop()!, ...(d as object) }) as GoalEvent);
}

describe("buildCreateGoal", () => {
  it("creates a v2 summary, a created event and a name claim", () => {
    const p = plan(buildCreateGoal({ name: "  Car  Fund ", targetAmount: 1000, initialAmount: 300, currency: "INR", targetDate: "2027-06-01", iconKey: "car" }, { ...ctx(), goalId: "g1" }, []));
    expect(p.fields).toMatchObject({
      name: "Car Fund",
      normalizedName: "car fund",
      targetAmount: 1000,
      currentAmount: 300,
      deadline: "2027-06-01",
      schemaVersion: 2,
      version: 1,
      lastEventId: "ev1",
      status: "active",
      openingAmount: 0,
      createdAtMs: 1_000_000,
      lastContributionAtMs: 1_000_000,
    });
    expect(p.events.map((e) => [e.id, e.type, e.amountDelta])).toEqual([
      ["ev1", "created", 300],
      ["ev1__ms_p25", "milestone_reached", 0],
    ]);
    expect(p.claimNameKey).toBe("n_car%20fund");
  });

  it("keeps the legacy deadline contract: no target date is an empty string", () => {
    expect(plan(buildCreateGoal({ name: "Car", targetAmount: 1000 }, { ...ctx(), goalId: "g1" }, [])).fields.deadline).toBe("");
  });

  it("rejects bad input", () => {
    const bad = buildCreateGoal(
      { name: " ", targetAmount: 0, initialAmount: -1, startDate: "2027-02-01", targetDate: "2027-01-01", minimumContribution: 5000 },
      { ...ctx(), goalId: "g1" },
      []
    );
    expect(bad).toEqual({ ok: false, issues: ["name_required", "target_invalid", "amount_invalid", "dates_out_of_order", "minimum_invalid"] });
  });

  it("rejects a duplicate name (UI hint; rules enforce the lock)", () => {
    expect(buildCreateGoal({ name: "CAR", targetAmount: 10 }, { ...ctx(), goalId: "g2" }, [{ id: "g1", name: "car" }])).toEqual({ ok: false, issues: ["name_taken"] });
  });
});

describe("legacy upgrade on first write", () => {
  it("opens the audit log without changing the amount", () => {
    const p = plan(buildAmountChange(legacy(), { kind: "contribution", amount: 100 }, ctx()));
    expect(p.fields).toMatchObject({ schemaVersion: 2, openingAmount: 400, status: "active", normalizedName: "car", lastEventId: "ev1" });
    expect(p.version).toEqual({ kind: "increment" });
    expect(p.events[0]).toMatchObject({ id: "ev1__mig", type: "migrated", amountDelta: 0, createdAtMs: 999_999 });
    expect(p.events[1]).toMatchObject({ id: "ev1", type: "contribution", amountDelta: 100 });
    expect(p.claimNameKey).toBe("n_car");
  });

  it("upgrades on settings-only writes too, with a literal version 1", () => {
    const p = plan(buildSettingsChange(legacy(), { pinned: true }, ctx()));
    expect(p.version).toEqual({ kind: "expect", next: 1 });
    expect(p.fields).toMatchObject({ pinned: true, lastEventId: "ev1__mig", openingAmount: 400 });
    expect(p.events.map((e) => e.type)).toEqual(["migrated"]);
  });

  it("a legacy rename claims the new name and releases nothing", () => {
    const p = plan(buildEditGoal(legacy(), { name: "Bike" }, ctx(), [legacy()]));
    expect(p.claimNameKey).toBe("n_bike");
    expect(p.releaseNameKey).toBeUndefined();
  });

  it("reconciles before and after the upgrade", () => {
    const store: Store = new Map([[`users/${UID}/financialGoals/g1`, { ...legacy() }]]);
    expect(reconcileGoal(readGoal(store), readEvents(store)).ok).toBe(true);
    apply(store, goalWritePlanToOps(UID, plan(buildAmountChange(readGoal(store), { kind: "contribution", amount: 100 }, ctx())), sentinels));
    const g = readGoal(store);
    expect(g.currentAmount).toBe(500);
    expect(g.version).toBe(1);
    expect(reconcileGoal(g, readEvents(store)).ok).toBe(true);
  });
});

describe("amount changes", () => {
  it("contributions increment amount and version", () => {
    const p = plan(buildAmountChange(v2(), { kind: "contribution", amount: 500, reason: "bonus", note: " Diwali " }, ctx()));
    expect(p.amountDelta).toBe(500);
    expect(p.version).toEqual({ kind: "increment" });
    expect(p.fields).toEqual({ lastEventId: "ev1", lastContributionAtMs: 1_000_000 });
    expect(p.events[0]).toMatchObject({ type: "contribution", amountDelta: 500, reason: "bonus", note: "Diwali", actorUid: UID });
    expect(p.events.slice(1).map((e) => e.id)).toEqual(["ev1__ms_p50", "ev1__ms_p75"]);
  });

  it("paused goals accept contributions", () => {
    expect(buildAmountChange(v2({ status: "paused" }), { kind: "contribution", amount: 1 }, ctx()).ok).toBe(true);
  });

  it("completed, archived and cancelled goals reject amount changes", () => {
    for (const status of ["completed", "archived", "cancelled"] as const) {
      expect(buildAmountChange(v2({ status }), { kind: "contribution", amount: 1 }, ctx())).toEqual({ ok: false, issues: ["status_blocks_amount_change"] });
    }
  });

  it("rejects invalid amounts and enforces the minimum on contributions only", () => {
    expect(buildAmountChange(v2(), { kind: "contribution", amount: 0 }, ctx()).ok).toBe(false);
    expect(buildAmountChange(v2(), { kind: "contribution", amount: Number.NaN }, ctx()).ok).toBe(false);
    expect(buildAmountChange(v2({ minimumContribution: 500 }), { kind: "contribution", amount: 100 }, ctx())).toEqual({ ok: false, issues: ["below_minimum_contribution"] });
    expect(buildAmountChange(v2({ minimumContribution: 500 }), { kind: "reduction", amount: 100 }, ctx()).ok).toBe(true);
    expect(buildAmountChange(v2(), { kind: "contribution", amount: 1, reason: "lottery" as never }, ctx())).toEqual({ ok: false, issues: ["reason_invalid"] });
    expect(buildAmountChange(v2(), { kind: "contribution", amount: 1, note: "x".repeat(501) }, ctx())).toEqual({ ok: false, issues: ["note_too_long"] });
  });

  it("a reduction can never make the saved amount negative", () => {
    expect(buildAmountChange(v2(), { kind: "reduction", amount: 401 }, ctx())).toEqual({ ok: false, issues: ["reduction_exceeds_saved"] });
    const p = plan(buildAmountChange(v2(), { kind: "reduction", amount: 400 }, ctx()));
    expect(p.amountDelta).toBe(-400);
    expect(p.fields).not.toHaveProperty("lastContributionAtMs");
    expect(p.events.slice(1).map((e) => [e.milestoneId, e.type])).toEqual([["p25", "milestone_lost"]]);
  });
});

describe("corrections and reversals", () => {
  const original: GoalEvent = { id: "c1", goalId: "g1", type: "contribution", amountDelta: 500, actorUid: UID, createdAtMs: 1 };

  it("a correction appends the difference and links to the original", () => {
    const p = plan(buildCorrection(v2({ currentAmount: 900 }), original, [], { mode: "correct", amount: 50, reason: "other", note: "typo" }, ctx("fix1")));
    expect(p.amountDelta).toBe(-450);
    expect(p.events[0]).toMatchObject({ id: "fix1", type: "correction", correctionOf: "c1", amountDelta: -450, note: "typo" });
  });

  it("a reversal undoes the effective amount, with a derived id", () => {
    const related: GoalEvent[] = [{ id: "fix1", goalId: "g1", type: "correction", correctionOf: "c1", amountDelta: -450, actorUid: UID, createdAtMs: 2 }];
    const p = plan(buildCorrection(v2({ currentAmount: 450 }), original, related, { mode: "reverse" }, ctx("whatever")));
    expect(p.amountDelta).toBe(-50);
    expect(p.events[0]).toMatchObject({ id: "c1__rev", type: "reversal", correctionOf: "c1" });
    expect(p.fields.lastEventId).toBe("c1__rev");
  });

  it("an event can be reversed only once", () => {
    const related: GoalEvent[] = [{ id: "c1__rev", goalId: "g1", type: "reversal", correctionOf: "c1", amountDelta: -500, actorUid: UID, createdAtMs: 2 }];
    expect(buildCorrection(v2(), original, related, { mode: "reverse" }, ctx())).toEqual({ ok: false, issues: ["correction_target_invalid"] });
  });

  it("refuses to correct non-amount events, other goals, or into a negative balance", () => {
    expect(buildCorrection(v2(), { ...original, type: "milestone_reached", amountDelta: 0 }, [], { mode: "reverse" }, ctx()).ok).toBe(false);
    expect(buildCorrection(v2(), { ...original, goalId: "g2" }, [], { mode: "reverse" }, ctx()).ok).toBe(false);
    expect(buildCorrection(v2({ currentAmount: 100 }), original, [], { mode: "reverse" }, ctx())).toEqual({ ok: false, issues: ["result_negative"] });
    expect(buildCorrection(v2(), original, [], { mode: "correct", amount: 500 }, ctx())).toEqual({ ok: false, issues: ["correction_no_change"] });
  });

  it("corrects a reduction in the reduction's direction", () => {
    const reduction: GoalEvent = { ...original, id: "r1", type: "reduction", amountDelta: -300 };
    expect(plan(buildCorrection(v2(), reduction, [], { mode: "correct", amount: 100 }, ctx())).amountDelta).toBe(200);
  });
});

describe("target, status, milestones, edits", () => {
  it("target changes use a literal expected version and keep history", () => {
    const p = plan(buildTargetChange(v2(), 2000, ctx()));
    expect(p.version).toEqual({ kind: "expect", next: 4 });
    expect(p.events[0]).toMatchObject({ type: "target_changed", targetBefore: 1000, targetAfter: 2000 });
    expect(buildTargetChange(v2(), 1000, ctx())).toEqual({ ok: false, issues: ["no_change"] });
    expect(buildTargetChange(v2({ status: "completed" }), 5000, ctx()).ok).toBe(false);
  });

  it("allows lowering the target below the saved amount (surplus)", () => {
    const p = plan(buildTargetChange(v2({ currentAmount: 900 }), 500, ctx()));
    expect(p.fields.targetAmount).toBe(500);
  });

  it("status changes follow the lifecycle", () => {
    expect(buildStatusChange(v2(), "completed", ctx())).toEqual({ ok: false, issues: ["target_not_reached"] });
    const done = plan(buildStatusChange(v2({ currentAmount: 1000 }), "completed", ctx()));
    expect(done.fields).toMatchObject({ status: "completed", completedAtMs: 1_000_000 });
    expect(done.events[0]).toMatchObject({ type: "completed", statusBefore: "active", statusAfter: "completed" });
    const archived = plan(buildStatusChange(v2({ status: "paused" }), "archived", ctx()));
    expect(archived.fields).toMatchObject({ status: "archived", statusBeforeArchive: "paused" });
  });

  it("edits record which fields changed, never their values", () => {
    const p = plan(buildEditGoal(v2(), { name: "Bike", description: "new", targetDate: "2027-01-01" }, ctx(), [v2()]));
    expect(p.events[0]).toMatchObject({ type: "edited", changedFields: ["name", "description", "targetDate"] });
    expect(p.fields).toMatchObject({ name: "Bike", normalizedName: "bike", deadline: "2027-01-01" });
    expect(p.claimNameKey).toBe("n_bike");
    expect(p.releaseNameKey).toBe("n_car");
    expect(buildEditGoal(v2(), { name: "Car" }, ctx(), [v2()])).toEqual({ ok: false, issues: ["no_change"] });
  });

  it("a case-only rename keeps the same name lock", () => {
    const p = plan(buildEditGoal(v2(), { name: "CAR" }, ctx(), [v2()]));
    expect(p.claimNameKey).toBeUndefined();
    expect(p.releaseNameKey).toBeUndefined();
  });

  it("milestone edits record crossings", () => {
    const p = plan(buildMilestonesChange(v2({ currentAmount: 400 }), [{ id: "m1", amount: 300 }], ctx()));
    expect(p.events.map((e) => [e.type, e.milestoneId])).toEqual([
      ["edited", undefined],
      ["milestone_reached", "m1"],
    ]);
  });

  it("settings validate reminders and do not move the version", () => {
    const ok = plan(buildSettingsChange(v2(), { reminders: { frequency: "weekly", time: "09:00", milestoneEnabled: true, inactivityEnabled: false, inactivityDays: 14 } }, ctx()));
    expect(ok.version).toEqual({ kind: "none" });
    expect(ok.events).toEqual([]);
    expect(buildSettingsChange(v2(), { reminders: { frequency: "hourly" as never, time: "9:00", milestoneEnabled: true, inactivityEnabled: false, inactivityDays: 0 } }, ctx()).ok).toBe(false);
  });
});

describe("goalWritePlanToOps", () => {
  it("writes one batch: summary update, events, name lock; stamps timestamps", () => {
    const p = plan(buildEditGoal(v2(), { name: "Bike" }, ctx(), [v2()]));
    const ops = goalWritePlanToOps(UID, p, sentinels);
    expect(ops.map((o) => [o.op, o.ref.path])).toEqual([
      ["update", "users/u1/financialGoals/g1"],
      ["set", "users/u1/goalEvents/ev1"],
      ["set", "users/u1/goalNames/n_bike"],
      ["delete", "users/u1/goalNames/n_car"],
    ]);
    const [goalOp, eventOp] = ops as Extract<MutationOp, { data: object }>[];
    expect(goalOp.data).toMatchObject({ version: 4, updatedAt: TS });
    expect(eventOp.data).toMatchObject({ createdAt: TS, updatedAt: TS, goalId: "g1" });
    expect(eventOp.data).not.toHaveProperty("id");
  });

  it("uses increments for amount changes and never writes undefined", () => {
    const ops = goalWritePlanToOps(UID, plan(buildAmountChange(v2(), { kind: "contribution", amount: 50 }, ctx())), sentinels);
    expect((ops[0] as { data: object }).data).toMatchObject({ currentAmount: { __inc: 50 }, version: { __inc: 1 } });
    for (const op of ops) {
      if (op.op === "delete") continue;
      expect(Object.values(op.data).includes(undefined)).toBe(false);
    }
  });

  it("creates stamp createdAt and updatedAt on the summary", () => {
    const ops = goalWritePlanToOps(UID, plan(buildCreateGoal({ name: "Car", targetAmount: 10 }, { ...ctx(), goalId: "g1" }, [])), sentinels);
    expect(ops[0]).toMatchObject({ op: "set", data: { createdAt: TS, updatedAt: TS, currentAmount: 0 } });
  });

  it("only ever touches goal collections — never accounts, ledgers or transactions", () => {
    const g = v2({ currentAmount: 1000 });
    const all = [
      buildCreateGoal({ name: "X", targetAmount: 10, initialAmount: 5 }, { ...ctx(), goalId: "g9" }, []),
      buildAmountChange(g, { kind: "contribution", amount: 1 }, ctx()),
      buildAmountChange(g, { kind: "reduction", amount: 1 }, ctx()),
      buildTargetChange(g, 5000, ctx()),
      buildStatusChange(g, "completed", ctx()),
      buildEditGoal(legacy(), { name: "Y" }, ctx(), []),
      buildSettingsChange(g, { pinned: true }, ctx()),
    ].map(plan);
    for (const p of all) {
      for (const op of goalWritePlanToOps(UID, p, sentinels)) {
        expect(op.ref.path).toMatch(/^users\/u1\/(financialGoals|goalEvents|goalNames)\/[^/]+$/);
      }
    }
  });
});

describe("summary and history stay reconciled across a sequence of writes", () => {
  it("create → contribute → reduce → correct → reverse → retarget → complete", () => {
    const store: Store = new Map();
    const step = (r: GoalWriteResult) => apply(store, goalWritePlanToOps(UID, plan(r), sentinels));
    const check = () => expect(reconcileGoal(readGoal(store), readEvents(store)).ok).toBe(true);

    step(buildCreateGoal({ name: "Trip", targetAmount: 1000, initialAmount: 100 }, { ...ctx("e0"), goalId: "g1" }, []));
    check();
    step(buildAmountChange(readGoal(store), { kind: "contribution", amount: 500 }, ctx("e1")));
    check();
    step(buildAmountChange(readGoal(store), { kind: "reduction", amount: 50 }, ctx("e2")));
    check();
    const contribution = readEvents(store).find((e) => e.id === "e1")!;
    step(buildCorrection(readGoal(store), contribution, [], { mode: "correct", amount: 450 }, ctx("e3")));
    check();
    const related = readEvents(store).filter((e) => e.correctionOf === "e1");
    step(buildCorrection(readGoal(store), contribution, related, { mode: "reverse" }, ctx("e4")));
    check();
    expect(readGoal(store).currentAmount).toBe(50);
    step(buildTargetChange(readGoal(store), 50, ctx("e5")));
    check();
    step(buildStatusChange(readGoal(store), "completed", ctx("e6")));
    check();
    expect(readGoal(store)).toMatchObject({ status: "completed", version: 7, currentAmount: 50 });
    expect(buildAmountChange(readGoal(store), { kind: "contribution", amount: 1 }, ctx("e7")).ok).toBe(false);
  });

  it("replaying the same batch is rejected as a whole (create-only events)", () => {
    const store: Store = new Map([[`users/${UID}/financialGoals/g1`, { ...v2() }]]);
    const ops = goalWritePlanToOps(UID, plan(buildAmountChange(v2(), { kind: "contribution", amount: 100 }, ctx("same"))), sentinels);
    apply(store, ops);
    const before = JSON.stringify([...store.entries()]);
    expect(() => apply(new Map(store), ops)).toThrow(/create-only/);
    expect(JSON.stringify([...store.entries()])).toBe(before);
  });
});
