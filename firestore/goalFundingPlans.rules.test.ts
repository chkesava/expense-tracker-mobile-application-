import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/** SPENDLY-220 — users/{uid}/goalFundingPlans. */

const PROJECT_ID = "spendly-goal-funding-plans";
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

const valid = (over: Record<string, unknown> = {}) => ({
  name: "Main plan",
  mode: "balanced",
  allowOverAllocation: false,
  inputs: [{ goalId: "trip", priority: 1 }],
  goalSnapshot: [{ goalId: "trip", name: "Trip", targetAmount: 120000, currentAmount: 0 }],
  engineVersion: 1,
  archived: false,
  createdAtMs: 1,
  updatedAtMs: 1,
  ...over,
});
const ref = (uid: string, id = "p1") =>
  doc(env.authenticatedContext(uid.endsWith("_duress") ? OWNER : uid).firestore(), "users", uid, "goalFundingPlans", id);

describe("goal funding plans", () => {
  it("lets the owner and duress twin create, read, update and delete", async () => {
    await assertSucceeds(setDoc(ref(OWNER), valid({ plannedMonthly: 21000 })));
    await assertSucceeds(getDoc(ref(OWNER)));
    await assertSucceeds(updateDoc(ref(OWNER), { name: "Renamed", archived: true, updatedAtMs: 2 }));
    await assertSucceeds(deleteDoc(ref(OWNER)));
    await assertSucceeds(setDoc(ref(`${OWNER}_duress`), valid()));
  });

  it("denies other users", async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), "users", OWNER, "goalFundingPlans", "p1"), valid());
    });
    const other = doc(env.authenticatedContext(OTHER).firestore(), "users", OWNER, "goalFundingPlans", "p1");
    await assertFails(getDoc(other));
    await assertFails(setDoc(other, valid()));
    await assertFails(deleteDoc(other));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "users", OWNER, "goalFundingPlans", "p1")));
  });

  it("rejects ledger-shaped and unknown fields", async () => {
    for (const extra of [{ amount: 1 }, { date: "2026-10-01" }, { accountId: "a" }, { goalId: "trip" }]) {
      await assertFails(setDoc(ref(OWNER), valid(extra)));
    }
  });

  it("rejects bad values", async () => {
    for (const bad of [
      { name: "" },
      { name: "x".repeat(81) },
      { mode: "magic" },
      { plannedMonthly: "lots" },
      { allowOverAllocation: "no" },
      { inputs: "x" },
      { inputs: Array.from({ length: 51 }, (_, i) => ({ goalId: `g${i}` })) },
      { goalSnapshot: {} },
      { engineVersion: 0 },
      { engineVersion: 1.5 },
      { archived: 1 },
    ]) {
      await assertFails(setDoc(ref(OWNER), valid(bad)));
    }
  });

  it("pins createdAtMs on update", async () => {
    await assertSucceeds(setDoc(ref(OWNER), valid()));
    await assertFails(updateDoc(ref(OWNER), { createdAtMs: 9 }));
  });
});
