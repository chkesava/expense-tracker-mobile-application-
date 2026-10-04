import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const PROJECT_ID = "spendly-what-if-scenarios";
const OWNER = "u-owner";
const OTHER = "u-other";
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080) } });
});
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const valid = (over: Record<string, unknown> = {}) => ({
  name: "Raise plan",
  version: 1,
  engineVersion: 1,
  reference: { asOfDate: "2026-10-04", currency: "INR", timezone: "Asia/Calcutta", sourceVersions: [] },
  durationMonths: 12,
  adjustments: [],
  assumptions: [],
  archived: false,
  createdAtMs: 1,
  updatedAtMs: 1,
  ...over,
});
const ref = (uid: string, id = "s1") => doc(env.authenticatedContext(uid.endsWith("_duress") ? OWNER : uid).firestore(), "users", uid, "whatIfScenarios", id);

describe("what-if scenarios", () => {
  it("lets the owner and duress twin create, read, update, archive and delete", async () => {
    await assertSucceeds(setDoc(ref(OWNER), valid()));
    await assertSucceeds(getDoc(ref(OWNER)));
    await assertSucceeds(updateDoc(ref(OWNER), { name: "Renamed", version: 2, archived: true, updatedAtMs: 2 }));
    await assertSucceeds(deleteDoc(ref(OWNER)));
    await assertSucceeds(setDoc(ref(`${OWNER}_duress`), valid()));
  });

  it("denies cross-user and unauthenticated access", async () => {
    await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), "users", OWNER, "whatIfScenarios", "s1"), valid()); });
    await assertFails(getDoc(doc(env.authenticatedContext(OTHER).firestore(), "users", OWNER, "whatIfScenarios", "s1")));
    await assertFails(setDoc(doc(env.authenticatedContext(OTHER).firestore(), "users", OWNER, "whatIfScenarios", "s1"), valid()));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "users", OWNER, "whatIfScenarios", "s1")));
  });

  it("rejects unknown, calculated and malformed fields", async () => {
    for (const bad of [
      { amount: 1 },
      { baseline: {} },
      { periods: [] },
      { name: "" },
      { durationMonths: 25 },
      { adjustments: "no" },
      { archived: 1 },
      { reference: {} },
    ]) await assertFails(setDoc(ref(OWNER), valid(bad)));
  });

  it("pins creation time on update", async () => {
    await assertSucceeds(setDoc(ref(OWNER), valid()));
    await assertFails(updateDoc(ref(OWNER), { createdAtMs: 2 }));
  });
});
