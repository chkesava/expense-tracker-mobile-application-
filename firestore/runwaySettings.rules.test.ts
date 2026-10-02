import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/** SPENDLY-210 — users/{uid}/runwaySettings/default. */

const PROJECT_ID = "spendly-runway-settings";
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
  mode: "commitment_projection",
  thresholdKind: "amount",
  thresholdAmount: 10000,
  thresholdMonths: 1,
  windowMonths: 6,
  method: "average",
  includeUnusual: false,
  projectionMonths: 12,
  updatedAtMs: 1,
  ...over,
});
const ref = (uid: string, id = "default") =>
  doc(env.authenticatedContext(uid.endsWith("_duress") ? OWNER : uid).firestore(), "users", uid, "runwaySettings", id);

describe("runway settings", () => {
  it("lets the owner and duress twin write, read and delete", async () => {
    await assertSucceeds(setDoc(ref(OWNER), valid()));
    await assertSucceeds(getDoc(ref(OWNER)));
    await assertSucceeds(updateDoc(ref(OWNER), { method: "median", updatedAtMs: 2 }));
    await assertSucceeds(deleteDoc(ref(OWNER)));
    await assertSucceeds(setDoc(ref(`${OWNER}_duress`), valid()));
  });

  it("denies other users", async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), "users", OWNER, "runwaySettings", "default"), valid());
    });
    const other = doc(env.authenticatedContext(OTHER).firestore(), "users", OWNER, "runwaySettings", "default");
    await assertFails(getDoc(other));
    await assertFails(setDoc(other, valid()));
  });

  it("only accepts the default document", async () => {
    await assertFails(setDoc(ref(OWNER, "other"), valid()));
  });

  it("rejects bad values and unknown fields", async () => {
    for (const bad of [
      { mode: "yolo" },
      { thresholdKind: "percent" },
      { thresholdAmount: -1 },
      { thresholdAmount: "10" },
      { thresholdMonths: 25 },
      { windowMonths: 5 },
      { method: "mode" },
      { includeUnusual: "no" },
      { projectionMonths: 0 },
      { projectionMonths: 25 },
      { projectionMonths: 2.5 },
      { extra: true },
    ]) {
      await assertFails(setDoc(ref(OWNER), valid(bad)));
    }
    const { updatedAtMs: _drop, ...missing } = valid();
    void _drop;
    await assertFails(setDoc(ref(OWNER), missing));
  });
});
