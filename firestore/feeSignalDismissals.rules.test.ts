import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/** SPENDLY-319 — users/{uid}/feeSignalDismissals. */

const PROJECT_ID = "spendly-fee-signal-dismissals";
const OWNER = "u-owner";
const OTHER = "u-other";
const ID = "possible_duplicate--expense__a--expense__b";

let env: RulesTestEnvironment;

function valid(overrides: Record<string, unknown> = {}) {
  return {
    kind: "possible_duplicate",
    resolution: "dismissed",
    recordKeys: ["expense__a", "expense__b"],
    note: "Two ATM visits",
    atMs: 100,
    ...overrides,
  };
}

const db = (uid = OWNER) => env.authenticatedContext(uid).firestore();

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

describe("feeSignalDismissals", () => {
  it("lets the owner (and duress twin) write, read, list and delete", async () => {
    const ref = doc(db(), "users", OWNER, "feeSignalDismissals", ID);
    await assertSucceeds(setDoc(ref, valid()));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(getDocs(collection(db(), "users", OWNER, "feeSignalDismissals")));
    await assertSucceeds(setDoc(ref, valid({ resolution: "resolved", atMs: 200 })));
    await assertSucceeds(deleteDoc(ref));
    await assertSucceeds(setDoc(doc(db(), "users", `${OWNER}_duress`, "feeSignalDismissals", ID), valid()));
  });

  it("denies other users and anonymous access", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", OWNER, "feeSignalDismissals", ID), valid());
    });
    await assertFails(getDoc(doc(db(OTHER), "users", OWNER, "feeSignalDismissals", ID)));
    await assertFails(setDoc(doc(db(OTHER), "users", OWNER, "feeSignalDismissals", ID), valid()));
    await assertFails(deleteDoc(doc(db(OTHER), "users", OWNER, "feeSignalDismissals", ID)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "users", OWNER, "feeSignalDismissals", ID)));
  });

  it("binds the doc id to the kind and refuses bad shapes", async () => {
    const put = (id: string, data: Record<string, unknown>) =>
      assertFails(setDoc(doc(db(), "users", OWNER, "feeSignalDismissals", id), data));
    await put("unusual_amount--expense__a", valid());
    await put("possible_duplicate-expense__a", valid());
    await put(ID, valid({ kind: "made_up" }));
    await put(ID, valid({ resolution: "ignored" }));
    await put(ID, valid({ recordKeys: [] }));
    await put(ID, valid({ recordKeys: Array.from({ length: 13 }, (_, i) => `k${i}`) }));
    await put(ID, valid({ amount: 20 }));
    await put(ID, valid({ note: "x".repeat(501) }));
    await put(ID, valid({ atMs: "now" }));
  });
});
