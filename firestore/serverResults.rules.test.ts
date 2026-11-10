import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/** SPENDLY-747: users/{uid}/serverResults/{id}: server-written, owner-read. */

const PROJECT_ID = "spendly-server-results";
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
  // The server's write (rules bypassed, as the Admin SDK is).
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "users", OWNER, "serverResults", "ledgerHealth"), { kind: "ledgerHealth", runId: "r1" });
  });
});

type TestDb = ReturnType<ReturnType<RulesTestEnvironment["authenticatedContext"]>["firestore"]>;
const db = (uid = OWNER): TestDb => env.authenticatedContext(uid).firestore();
const ref = (fs: TestDb, uid = OWNER) => doc(fs, "users", uid, "serverResults", "ledgerHealth");

describe("serverResults rules (SPENDLY-747)", () => {
  it("the owner can read", async () => {
    await assertSucceeds(getDoc(ref(db())));
  });

  it("another user and anonymous users can't read", async () => {
    await assertFails(getDoc(ref(db(OTHER), OWNER)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "users", OWNER, "serverResults", "ledgerHealth")));
  });

  it("no client write at all, not even the owner's: the server owns the collection", async () => {
    await assertFails(setDoc(doc(db(), "users", OWNER, "serverResults", "feeRows-0"), { kind: "feeRows" }));
    await assertFails(updateDoc(ref(db()), { runId: "r2" }));
    await assertFails(deleteDoc(ref(db())));
  });
});
