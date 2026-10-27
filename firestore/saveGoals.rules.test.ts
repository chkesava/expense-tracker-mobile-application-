import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  where,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { FinancialGoal } from "../shared/types/expense";
import type { GoalEvent } from "../shared/types/goal";
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
} from "../shared/utils/goalWrites";

/**
 * SPENDLY-608 — Save Goals rules (firestore.rules, "SPENDLY-606 Save Goals").
 * Every write here is built by the real shared/utils/goalWrites builders, so
 * these tests prove the app's writes pass and the forged ones fail.
 */

const PROJECT_ID = "spendly-save-goals";
const OWNER = "u-owner";
const OTHER = "u-other";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080),
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

const sentinels = { serverTimestamp, increment };
let clock = 1_700_000_000_000;
const ctx = (eventId: string) => ({ uid: OWNER, nowMs: (clock += 10), eventId });

function plan(result: GoalWriteResult): GoalWritePlan {
  if (!result.ok) throw new Error(`builder refused: ${result.issues.join(",")}`);
  return result.plan;
}

function ownerDb(): Firestore {
  return env.authenticatedContext(OWNER).firestore() as unknown as Firestore;
}

async function commit(db: Firestore, p: GoalWritePlan, uid = OWNER) {
  const batch = writeBatch(db);
  for (const op of goalWritePlanToOps(uid, p, sentinels)) {
    const ref = doc(db, op.ref.path);
    if (op.op === "set") batch.set(ref, op.data);
    else if (op.op === "update") batch.update(ref, op.data as Record<string, unknown>);
    else batch.delete(ref);
  }
  await batch.commit();
}

async function readGoal(id = "g1"): Promise<FinancialGoal> {
  let out: FinancialGoal | undefined;
  await env.withSecurityRulesDisabled(async (c) => {
    const snap = await getDoc(doc(c.firestore() as unknown as Firestore, "users", OWNER, "financialGoals", id));
    out = { id, ...(snap.data() as object) } as FinancialGoal;
  });
  return out!;
}

async function readEvent(id: string): Promise<GoalEvent> {
  let out: GoalEvent | undefined;
  await env.withSecurityRulesDisabled(async (c) => {
    const snap = await getDoc(doc(c.firestore() as unknown as Firestore, "users", OWNER, "goalEvents", id));
    out = { id, ...(snap.data() as object) } as GoalEvent;
  });
  return out!;
}

async function createGoal(id = "g1", name = "Car", target = 1000, initial = 0) {
  await commit(ownerDb(), plan(buildCreateGoal({ name, targetAmount: target, initialAmount: initial }, { ...ctx(`${id}-c`), goalId: id }, [])));
}

describe("creating goals", () => {
  it("accepts a goal built by buildCreateGoal", async () => {
    await assertSucceeds(createGoal("g1", "Car", 1000, 250));
    const g = await readGoal();
    expect(g).toMatchObject({ schemaVersion: 2, version: 1, currentAmount: 250, openingAmount: 0, nameKey: "n_car" });
  });

  it("rejects a create without its name lock", async () => {
    const p = plan(buildCreateGoal({ name: "Car", targetAmount: 1000 }, { ...ctx("e1"), goalId: "g1" }, []));
    await assertFails(commit(ownerDb(), { ...p, claimNameKey: undefined }));
  });

  it("rejects a create whose opening event does not match the saved amount", async () => {
    const p = plan(buildCreateGoal({ name: "Car", targetAmount: 1000, initialAmount: 100 }, { ...ctx("e1"), goalId: "g1" }, []));
    await assertFails(commit(ownerDb(), { ...p, fields: { ...p.fields, currentAmount: 900 } }));
  });

  it("rejects a create without its created event", async () => {
    const p = plan(buildCreateGoal({ name: "Car", targetAmount: 1000 }, { ...ctx("e1"), goalId: "g1" }, []));
    await assertFails(commit(ownerDb(), { ...p, events: [] }));
  });

  it("rejects a duplicate name even when the client skips its own check", async () => {
    await createGoal("g1", "Car");
    // Different spelling, same normalized key.
    const p = plan(buildCreateGoal({ name: "  CAR ", targetAmount: 500 }, { ...ctx("e2"), goalId: "g2" }, []));
    await assertFails(commit(ownerDb(), p));
  });

  it("rejects unknown fields, a zero target and a bad status", async () => {
    const p = plan(buildCreateGoal({ name: "Car", targetAmount: 1000 }, { ...ctx("e1"), goalId: "g1" }, []));
    await assertFails(commit(ownerDb(), { ...p, fields: { ...p.fields, balance: 5 } }));
    await assertFails(commit(ownerDb(), { ...p, fields: { ...p.fields, targetAmount: 0 } }));
    await assertFails(commit(ownerDb(), { ...p, fields: { ...p.fields, status: "deleted" } }));
  });
});

describe("amount changes", () => {
  beforeEach(async () => {
    await createGoal("g1", "Car", 1000, 400);
  });

  it("accepts contributions and reductions that come with their event", async () => {
    await assertSucceeds(commit(ownerDb(), plan(buildAmountChange(await readGoal(), { kind: "contribution", amount: 500, reason: "bonus" }, ctx("a1")))));
    await assertSucceeds(commit(ownerDb(), plan(buildAmountChange(await readGoal(), { kind: "reduction", amount: 100 }, ctx("a2")))));
    expect((await readGoal()).currentAmount).toBe(800);
    expect((await readGoal()).version).toBe(3);
  });

  it("rejects a forged summary amount with no event", async () => {
    await assertFails(updateDoc(doc(ownerDb(), "users", OWNER, "financialGoals", "g1"), { currentAmount: increment(1_000_000), version: increment(1) }));
    await assertFails(updateDoc(doc(ownerDb(), "users", OWNER, "financialGoals", "g1"), { currentAmount: 999 }));
  });

  it("rejects an event whose delta differs from the summary change", async () => {
    const p = plan(buildAmountChange(await readGoal(), { kind: "contribution", amount: 100 }, ctx("a1")));
    await assertFails(commit(ownerDb(), { ...p, amountDelta: 5000 }));
  });

  it("rejects a balance that would go negative, even from a forged plan", async () => {
    const p = plan(buildAmountChange(await readGoal(), { kind: "reduction", amount: 400 }, ctx("a1")));
    const forged = { ...p, amountDelta: -500, events: [{ ...p.events[0], amountDelta: -500 }] };
    await assertFails(commit(ownerDb(), forged));
  });

  it("rejects replaying the same batch (idempotent by event id)", async () => {
    const p = plan(buildAmountChange(await readGoal(), { kind: "contribution", amount: 100 }, ctx("same")));
    await assertSucceeds(commit(ownerDb(), p));
    await assertFails(commit(ownerDb(), p));
    expect((await readGoal()).currentAmount).toBe(500);
  });

  it("applies two devices' contributions built from the same stale view", async () => {
    const seen = await readGoal();
    await assertSucceeds(commit(ownerDb(), plan(buildAmountChange(seen, { kind: "contribution", amount: 100 }, ctx("dev-a")))));
    await assertSucceeds(commit(ownerDb(), plan(buildAmountChange(seen, { kind: "contribution", amount: 50 }, ctx("dev-b")))));
    expect((await readGoal()).currentAmount).toBe(550);
  });

  it("rejects a stand-alone event carrying money", async () => {
    await assertFails(
      setDoc(doc(ownerDb(), "users", OWNER, "goalEvents", "stray"), {
        goalId: "g1", type: "contribution", amountDelta: 100, actorUid: OWNER, createdAtMs: 1,
      })
    );
  });

  it("never lets an event be edited or deleted", async () => {
    const id = "g1-c";
    await assertFails(updateDoc(doc(ownerDb(), "users", OWNER, "goalEvents", id), { amountDelta: 0 }));
    await assertFails(deleteDoc(doc(ownerDb(), "users", OWNER, "goalEvents", id)));
  });

  it("rejects an event claiming another user's identity", async () => {
    const p = plan(buildAmountChange(await readGoal(), { kind: "contribution", amount: 10 }, ctx("a1")));
    await assertFails(commit(ownerDb(), { ...p, events: [{ ...p.events[0], actorUid: OTHER }] }));
  });
});

describe("corrections and reversals", () => {
  beforeEach(async () => {
    await createGoal("g1", "Car", 1000, 0);
    await commit(ownerDb(), plan(buildAmountChange(await readGoal(), { kind: "contribution", amount: 500 }, ctx("c1"))));
  });

  it("accepts a correction and one reversal, and refuses a second reversal", async () => {
    const original = await readEvent("c1");
    await assertSucceeds(commit(ownerDb(), plan(buildCorrection(await readGoal(), original, [], { mode: "correct", amount: 300 }, ctx("fix")))));
    const related = [await readEvent("fix")];
    const reversal = plan(buildCorrection(await readGoal(), original, related, { mode: "reverse" }, ctx("rev")));
    await assertSucceeds(commit(ownerDb(), reversal));
    expect((await readGoal()).currentAmount).toBe(0);
    // A second attempt from a stale device (which hasn't seen the reversal)
    // reuses the derived id: the builder can't tell, but create-only refuses it.
    const stale = { ...(await readGoal()), currentAmount: 1000 };
    const again = plan(buildCorrection(stale, original, related, { mode: "reverse" }, ctx("rev2")));
    await assertFails(commit(ownerDb(), again));
    expect((await readGoal()).currentAmount).toBe(0);
  });

  it("rejects a reversal under a non-derived id and a correction of a non-amount event", async () => {
    const original = await readEvent("c1");
    const p = plan(buildCorrection(await readGoal(), original, [], { mode: "reverse" }, ctx("x")));
    const renamed = { ...p, fields: { ...p.fields, lastEventId: "other" }, events: [{ ...p.events[0], id: "other" }] };
    await assertFails(commit(ownerDb(), renamed));
  });
});

describe("lifecycle", () => {
  beforeEach(async () => {
    await createGoal("g1", "Car", 1000, 1000);
  });

  it("follows the lifecycle and rejects contributions to a completed goal", async () => {
    await assertSucceeds(commit(ownerDb(), plan(buildStatusChange(await readGoal(), "completed", ctx("s1")))));
    const done = await readGoal();
    expect(done.status).toBe("completed");
    // The builder refuses; a hand-built forged write is refused by rules too.
    const forged = plan(buildAmountChange({ ...done, status: "active" }, { kind: "contribution", amount: 1 }, ctx("s2")));
    await assertFails(commit(ownerDb(), forged));
    await assertSucceeds(commit(ownerDb(), plan(buildStatusChange(done, "archived", ctx("s3")))));
    const archived = await readGoal();
    expect(archived).toMatchObject({ status: "archived", statusBeforeArchive: "completed" });
    // Archived restores only to where it came from.
    const wrong = plan(buildStatusChange({ ...archived, statusBeforeArchive: "active" }, "active", ctx("s4")));
    await assertFails(commit(ownerDb(), wrong));
    await assertSucceeds(commit(ownerDb(), plan(buildStatusChange(archived, "completed", ctx("s5")))));
  });

  it("rejects completing a goal that has not reached its target", async () => {
    await commit(ownerDb(), plan(buildTargetChange(await readGoal(), 5000, ctx("t1"))));
    const g = await readGoal();
    const p = plan(buildStatusChange({ ...g, currentAmount: 5000 }, "completed", ctx("t2")));
    await assertFails(commit(ownerDb(), p));
  });

  it("rejects a stale edit from another device (literal version)", async () => {
    const seen = await readGoal();
    await assertSucceeds(commit(ownerDb(), plan(buildTargetChange(seen, 2000, ctx("v1")))));
    await assertFails(commit(ownerDb(), plan(buildTargetChange(seen, 3000, ctx("v2")))));
    expect((await readGoal()).targetAmount).toBe(2000);
  });

  it("allows settings without a version move but not a target hidden inside them", async () => {
    await assertSucceeds(commit(ownerDb(), plan(buildSettingsChange(await readGoal(), { pinned: true, sortOrder: 5 }, ctx("p1")))));
    const sneaky = plan(buildSettingsChange(await readGoal(), { pinned: false }, ctx("p2")));
    await assertFails(commit(ownerDb(), { ...sneaky, fields: { ...sneaky.fields, targetAmount: 1 } }));
  });

  it("never deletes an audited goal", async () => {
    await assertFails(deleteDoc(doc(ownerDb(), "users", OWNER, "financialGoals", "g1")));
  });
});

describe("milestones (SPENDLY-610)", () => {
  it("custom milestones save with their crossing events; a contribution records achievements once", async () => {
    await createGoal("g1", "Car", 1000, 0);
    await assertSucceeds(commit(ownerDb(), plan(buildMilestonesChange(await readGoal(), [{ id: "m1", amount: 300, label: "First step" }], ctx("ms1")))));
    await assertSucceeds(commit(ownerDb(), plan(buildAmountChange(await readGoal(), { kind: "contribution", amount: 400 }, ctx("c1")))));
    expect(await readEvent("c1__ms_m1")).toMatchObject({ type: "milestone_reached", milestoneId: "m1", amountDelta: 0 });
    // Dropping below records the loss; the earlier achievement stays.
    await assertSucceeds(commit(ownerDb(), plan(buildAmountChange(await readGoal(), { kind: "reduction", amount: 200 }, ctx("r1")))));
    expect(await readEvent("r1__ms_m1")).toMatchObject({ type: "milestone_lost" });
    expect(await readEvent("c1__ms_m1")).toMatchObject({ type: "milestone_reached" });
  });

  it("refuses a milestone event that carries money", async () => {
    await createGoal("g1", "Car", 1000, 0);
    const p = plan(buildAmountChange(await readGoal(), { kind: "contribution", amount: 300 }, ctx("c1")));
    const forged = { ...p, events: p.events.map((e) => (e.type === "milestone_reached" ? { ...e, amountDelta: 50 } : e)) };
    await assertFails(commit(ownerDb(), forged));
  });
});

describe("offline sync and two devices (SPENDLY-613)", () => {
  // Two independent clients of the same user, each building from what it last saw.
  const device = () => env.authenticatedContext(OWNER).firestore() as unknown as Firestore;

  it("a partial failure changes nothing: summary, events and name lock land together or not at all", async () => {
    await createGoal("g1", "Car", 1000, 100);
    const before = await readGoal();
    const p = plan(buildAmountChange(before, { kind: "contribution", amount: 50, note: "x" }, ctx("bad")));
    // One invalid event (note too long) poisons the whole batch.
    const poisoned = { ...p, events: [{ ...p.events[0], note: "n".repeat(501) }] };
    await assertFails(commit(device(), poisoned));
    expect((await readGoal()).currentAmount).toBe(100);
    expect((await readGoal()).version).toBe(before.version);
    await env.withSecurityRulesDisabled(async (c) => {
      expect((await getDoc(doc(c.firestore() as unknown as Firestore, "users", OWNER, "goalEvents", "bad"))).exists()).toBe(false);
    });
    // A create whose lock is invalid leaves no goal and no lock.
    const created = plan(buildCreateGoal({ name: "Trip", targetAmount: 10 }, { ...ctx("t1"), goalId: "g2" }, []));
    await assertFails(commit(device(), { ...created, fields: { ...created.fields, nameKey: "n_other" } }));
    await env.withSecurityRulesDisabled(async (c) => {
      const db = c.firestore() as unknown as Firestore;
      expect((await getDoc(doc(db, "users", OWNER, "financialGoals", "g2"))).exists()).toBe(false);
      expect((await getDoc(doc(db, "users", OWNER, "goalNames", "n_trip"))).exists()).toBe(false);
    });
  });

  it("simultaneous devices: deltas merge, stale edits are refused, settings are last-writer-wins", async () => {
    await createGoal("g1", "Car", 1000, 0);
    const seen = await readGoal();
    const [a, b] = [device(), device()];
    // Both devices save contributions from the same view: both land.
    await assertSucceeds(commit(a, plan(buildAmountChange(seen, { kind: "contribution", amount: 300 }, ctx("a1")))));
    await assertSucceeds(commit(b, plan(buildAmountChange(seen, { kind: "contribution", amount: 200 }, ctx("b1")))));
    expect((await readGoal()).currentAmount).toBe(500);
    // Device A edits the target from the stale view: refused (B's change isn't overwritten).
    await assertFails(commit(a, plan(buildTargetChange(seen, 5000, ctx("a2")))));
    // Rebuilt from the latest goal (what Retry does), it lands.
    await assertSucceeds(commit(a, plan(buildTargetChange(await readGoal(), 5000, ctx("a2")))));
    // A stale lifecycle change is refused the same way.
    await assertFails(commit(b, plan(buildStatusChange(seen, "paused", ctx("b2")))));
    // Ordering: both write sortOrder from stale views; the last one wins, no conflict.
    await assertSucceeds(commit(a, plan(buildSettingsChange(seen, { sortOrder: 1 }, ctx("a3")))));
    await assertSucceeds(commit(b, plan(buildSettingsChange(seen, { sortOrder: 2 }, ctx("b3")))));
    expect(await readGoal()).toMatchObject({ sortOrder: 2, targetAmount: 5000, currentAmount: 500 });
  });

  it("duplicate delivery of a queued write is refused as a whole and counted once", async () => {
    await createGoal("g1", "Car", 1000, 0);
    const p = plan(buildAmountChange(await readGoal(), { kind: "contribution", amount: 100 }, ctx("dup")));
    await assertSucceeds(commit(device(), p));
    await assertFails(commit(device(), p));
    expect((await readGoal()).currentAmount).toBe(100);
  });

  it("a reduction that became too large on another device is refused, not clamped", async () => {
    await createGoal("g1", "Car", 1000, 500);
    const seen = await readGoal();
    await assertSucceeds(commit(device(), plan(buildAmountChange(seen, { kind: "reduction", amount: 400 }, ctx("r1")))));
    // The other device still thinks 500 is saved: its reduction of 300 would go negative.
    await assertFails(commit(device(), plan(buildAmountChange(seen, { kind: "reduction", amount: 300 }, ctx("r2")))));
    expect((await readGoal()).currentAmount).toBe(100);
  });
});

describe("images and lock (SPENDLY-614)", () => {
  const image = (over: Record<string, unknown> = {}) => ({
    path: `users/${OWNER}/goals/g1/img-1/image.jpg`,
    mimeType: "image/jpeg",
    sizeBytes: 200_000,
    width: 1600,
    height: 1200,
    uploadedAtMs: 1,
    ...over,
  });
  const withImage = async (img: unknown) => {
    const p = plan(buildSettingsChange(await readGoal(), { pinned: true }, ctx(`i${Math.random()}`)));
    return commit(ownerDb(), { ...p, fields: { ...p.fields, image: img } });
  };

  beforeEach(async () => {
    await createGoal("g1", "Car", 1000, 0);
  });

  it("stores this user's image for this goal, and removes it", async () => {
    await assertSucceeds(withImage(image()));
    expect((await readGoal()).image).toMatchObject({ path: `users/${OWNER}/goals/g1/img-1/image.jpg` });
    await assertSucceeds(withImage(null));
  });

  it("refuses an image path that isn't this user's image for this goal", async () => {
    await assertFails(withImage(image({ path: `users/${OTHER}/goals/g1/img-1/image.jpg` })));
    await assertFails(withImage(image({ path: `users/${OWNER}/goals/g2/img-1/image.jpg` })));
    await assertFails(withImage(image({ path: `users/${OWNER}/accounts/a1/d1/statement.pdf` })));
    await assertFails(withImage(image({ path: `users/${OWNER}/goals/g1/../x/image.jpg` })));
  });

  it("refuses bad metadata", async () => {
    await assertFails(withImage(image({ mimeType: "application/pdf" })));
    await assertFails(withImage(image({ sizeBytes: 10 * 1024 * 1024 + 1 })));
    await assertFails(withImage(image({ width: 0 })));
    await assertFails(withImage(image({ url: "https://evil" })));
    await assertFails(withImage("users/u/goals/g1/x/y.jpg"));
  });

  it("the lock is a boolean setting that never moves money", async () => {
    await assertSucceeds(commit(ownerDb(), plan(buildSettingsChange(await readGoal(), { locked: true }, ctx("l1")))));
    expect((await readGoal()).locked).toBe(true);
    const p = plan(buildSettingsChange(await readGoal(), { locked: false }, ctx("l2")));
    await assertFails(commit(ownerDb(), { ...p, fields: { ...p.fields, locked: "yes" } }));
  });
});

describe("names", () => {
  it("renames by claiming the new lock and releasing the old one", async () => {
    await createGoal("g1", "Car");
    await assertSucceeds(commit(ownerDb(), plan(buildEditGoal(await readGoal(), { name: "Bike" }, ctx("r1"), []))));
    // The old name is free again.
    await assertSucceeds(createGoal("g2", "Car"));
  });

  it("refuses to release a lock the goal still holds", async () => {
    await createGoal("g1", "Car");
    await assertFails(deleteDoc(doc(ownerDb(), "users", OWNER, "goalNames", "n_car")));
  });

  it("refuses to hijack another goal's lock", async () => {
    await createGoal("g1", "Car");
    await assertFails(setDoc(doc(ownerDb(), "users", OWNER, "goalNames", "n_car"), { goalId: "g2", createdAtMs: 1 }));
  });
});

describe("legacy goals", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore() as unknown as Firestore, "users", OWNER, "financialGoals", "g1"), {
        name: "Car", targetAmount: 1000, currentAmount: 400, deadline: "", createdAt: 1,
      });
    });
  });

  it("still accepts the old write shape until the goal is upgraded", async () => {
    await assertSucceeds(updateDoc(doc(ownerDb(), "users", OWNER, "financialGoals", "g1"), { currentAmount: increment(10) }));
    await assertSucceeds(setDoc(doc(ownerDb(), "users", OWNER, "financialGoals", "g9"), { name: "Old app", targetAmount: 10, currentAmount: 0 }));
  });

  it("upgrades on first write, keeping the amount as the opening amount", async () => {
    await assertSucceeds(commit(ownerDb(), plan(buildAmountChange(await readGoal(), { kind: "contribution", amount: 100 }, ctx("u1")))));
    expect(await readGoal()).toMatchObject({ schemaVersion: 2, version: 1, openingAmount: 400, currentAmount: 500 });
    // After the upgrade, the old shape is refused and so is delete.
    await assertFails(updateDoc(doc(ownerDb(), "users", OWNER, "financialGoals", "g1"), { currentAmount: increment(10) }));
    await assertFails(deleteDoc(doc(ownerDb(), "users", OWNER, "financialGoals", "g1")));
  });

  it("rejects an upgrade that rewrites the opening amount", async () => {
    const p = plan(buildSettingsChange(await readGoal(), { pinned: true }, ctx("u1")));
    await assertFails(commit(ownerDb(), { ...p, fields: { ...p.fields, openingAmount: 0 } }));
  });

  it("legacy goals stay deletable by installed builds", async () => {
    await assertSucceeds(deleteDoc(doc(ownerDb(), "users", OWNER, "financialGoals", "g1")));
  });

  it("upgrades a legacy goal that never had a deadline", async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore() as unknown as Firestore, "users", OWNER, "financialGoals", "g2"), {
        name: "Bike", targetAmount: 500, currentAmount: 50, createdAt: 1,
      });
    });
    await assertSucceeds(commit(ownerDb(), plan(buildAmountChange(await readGoal("g2"), { kind: "contribution", amount: 10 }, ctx("nd1")))));
    expect(await readGoal("g2")).toMatchObject({ schemaVersion: 2, deadline: "", currentAmount: 60 });
  });
});

describe("duress mode", () => {
  // The duress session writes to `<uid>_duress` while the token keeps the
  // real uid, so its events carry the duress uid as the actor.
  const DURESS = `${OWNER}_duress`;
  const duressCtx = (eventId: string) => ({ ...ctx(eventId), uid: DURESS });

  it("accepts goal writes in the duress tree, and still refuses someone else as the actor", async () => {
    const p = plan(buildCreateGoal({ name: "Car", targetAmount: 1000, initialAmount: 100 }, { ...duressCtx("d1"), goalId: "g1" }, []));
    expect(p.events[0].actorUid).toBe(DURESS);
    await assertFails(commit(ownerDb(), { ...p, events: [{ ...p.events[0], actorUid: `${OTHER}_duress` }] }, DURESS));
    await assertSucceeds(commit(ownerDb(), p, DURESS));
  });
});

describe("history queries (SPENDLY-609)", () => {
  it("the owner can page a goal's history and look up an entry's corrections; nobody else can", async () => {
    await createGoal("g1", "Car", 1000, 100);
    await commit(ownerDb(), plan(buildAmountChange(await readGoal(), { kind: "contribution", amount: 50 }, ctx("c1"))));
    const history = (db: Firestore) =>
      getDocs(query(collection(db, "users", OWNER, "goalEvents"), where("goalId", "==", "g1"), orderBy("createdAtMs", "desc"), limit(25)));
    const corrections = (db: Firestore) =>
      getDocs(query(collection(db, "users", OWNER, "goalEvents"), where("correctionOf", "==", "c1"), limit(50)));
    const page = await assertSucceeds(history(ownerDb()));
    expect(page.docs.map((d) => d.id)).toContain("c1");
    await assertSucceeds(corrections(ownerDb()));
    // SPENDLY-610: the achievements filter.
    const achievements = (db: Firestore) =>
      getDocs(
        query(
          collection(db, "users", OWNER, "goalEvents"),
          where("goalId", "==", "g1"),
          where("type", "in", ["milestone_reached", "completed"]),
          orderBy("createdAtMs", "desc"),
          limit(25)
        )
      );
    const reached = await assertSucceeds(achievements(ownerDb()));
    // 100 → 150 of 1000 crosses nothing; the created event at 100 crossed nothing either.
    expect(reached.docs.map((d) => d.data().type)).toEqual([]);
    const other = env.authenticatedContext(OTHER).firestore() as unknown as Firestore;
    await assertFails(history(other));
    await assertFails(corrections(other));
    await assertFails(achievements(other));
  });
});

describe("isolation", () => {
  it("another user can neither read nor write a goal, its events or its name lock", async () => {
    await createGoal("g1", "Car", 1000, 100);
    const other = env.authenticatedContext(OTHER).firestore() as unknown as Firestore;
    await assertFails(getDoc(doc(other, "users", OWNER, "financialGoals", "g1")));
    await assertFails(getDoc(doc(other, "users", OWNER, "goalEvents", "g1-c")));
    await assertFails(getDoc(doc(other, "users", OWNER, "goalNames", "n_car")));
    const p = plan(buildAmountChange(await readGoal(), { kind: "contribution", amount: 10 }, { uid: OTHER, nowMs: 1, eventId: "x" }));
    await assertFails(commit(other, p, OWNER));
  });
});
