import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

import { WHAT_IF_ENGINE_VERSION, type WhatIfScenarioDefinition } from "../shared/types/whatIf";
import {
  archiveWhatIfScenarioDoc,
  duplicateWhatIfScenarioDoc,
  editWhatIfScenarioDoc,
  markWhatIfScenarioCalculated,
  rebaseWhatIfScenarioDoc,
  whatIfScenarioDoc,
  type WhatIfScenario,
} from "../shared/utils/whatIfScenarios";

const PROJECT_ID = "spendly-what-if-scenarios";
const OWNER = "u-owner";
const OTHER = "u-other";
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080) } });
});
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const definition: WhatIfScenarioDefinition = {
  id: "draft",
  name: "Raise plan",
  version: 1,
  engineVersion: WHAT_IF_ENGINE_VERSION,
  reference: { asOfDate: "2026-10-04", currency: "INR", timezone: "Asia/Calcutta", sourceVersions: [] },
  durationMonths: 12,
  adjustments: [],
  assumptions: [],
};
const created = () => whatIfScenarioDoc({ scenario: definition, nowMs: 1 });
const valid = (over: Record<string, unknown> = {}) => ({ ...created(), ...over });
const ref = (uid: string, id = "s1") => doc(env.authenticatedContext(uid.endsWith("_duress") ? OWNER : uid).firestore(), "users", uid, "whatIfScenarios", id);

describe("what-if scenarios", () => {
  it("accepts every body the real lifecycle builders produce", async () => {
    const first = created();
    await assertSucceeds(setDoc(ref(OWNER), first));
    const s1: WhatIfScenario = { ...first, id: "s1" };
    const edited = editWhatIfScenarioDoc(s1, { ...definition, durationMonths: 18 }, 2)!;
    await assertSucceeds(setDoc(ref(OWNER), edited));
    const calculated = markWhatIfScenarioCalculated({ ...edited, id: "s1" }, { mode: "saved", asOfDate: "2026-10-04" }, 3);
    await assertSucceeds(setDoc(ref(OWNER), calculated));
    const rebased = rebaseWhatIfScenarioDoc({ ...calculated, id: "s1" }, { ...definition.reference, asOfDate: "2026-11-01" }, 4)!;
    await assertSucceeds(setDoc(ref(OWNER), rebased));
    const archived = archiveWhatIfScenarioDoc({ ...rebased, id: "s1" }, true, 5)!;
    await assertSucceeds(setDoc(ref(OWNER), archived));
    await assertSucceeds(setDoc(ref(OWNER, "s2"), duplicateWhatIfScenarioDoc({ ...archived, id: "s1" }, "Copy", 6)));
    await assertSucceeds(deleteDoc(ref(OWNER, "s2")));
    await assertSucceeds(getDoc(ref(OWNER)));
  });

  it("lets the duress twin manage its own scenarios", async () => {
    await assertSucceeds(setDoc(ref(`${OWNER}_duress`), created()));
    await assertSucceeds(deleteDoc(ref(`${OWNER}_duress`)));
  });

  it("denies cross-user and unauthenticated access", async () => {
    await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), "users", OWNER, "whatIfScenarios", "s1"), created()); });
    await assertFails(getDoc(doc(env.authenticatedContext(OTHER).firestore(), "users", OWNER, "whatIfScenarios", "s1")));
    await assertFails(setDoc(doc(env.authenticatedContext(OTHER).firestore(), "users", OWNER, "whatIfScenarios", "s1"), created()));
    await assertFails(deleteDoc(doc(env.authenticatedContext(OTHER).firestore(), "users", OWNER, "whatIfScenarios", "s1")));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "users", OWNER, "whatIfScenarios", "s1")));
  });

  it("rejects an id field, calculated output and malformed values", async () => {
    for (const bad of [
      { id: "s1" },
      { amount: 1 },
      { baseline: {} },
      { periods: [] },
      { name: "" },
      { durationMonths: 25 },
      { adjustments: "no" },
      { archived: 1 },
      { reference: {} },
      { history: [] },
      { history: Array.from({ length: 21 }, (_, i) => ({ version: i + 1, atMs: 1, action: "edited", fields: [] })) },
      { lastCalculated: { atMs: 1, engineVersion: 1, mode: "later", asOfDate: "2026-10-04" } },
      { lastCalculated: { atMs: 1, engineVersion: 1, mode: "saved", asOfDate: "2026-10-04", result: 5 } },
    ]) await assertFails(setDoc(ref(OWNER), valid(bad)));
  });

  it("pins creation time and never lets the version go backwards", async () => {
    await assertSucceeds(setDoc(ref(OWNER), valid({ version: 3 })));
    await assertFails(updateDoc(ref(OWNER), { createdAtMs: 2 }));
    await assertFails(updateDoc(ref(OWNER), { version: 2 }));
    await assertSucceeds(updateDoc(ref(OWNER), { version: 4, updatedAtMs: 2 }));
  });
});
