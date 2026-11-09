import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/** SPENDLY-744: users/{uid}/recurringSuggestions/{id}: server-written, owner-read. */

const PROJECT_ID = "spendly-recurring-suggestions";
const OWNER = "u-owner";
const OTHER = "u-other";
const ID = "netflix|649.00";

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
    await setDoc(doc(ctx.firestore(), "users", OWNER, "recurringSuggestions", ID), { key: ID, merchant: "Netflix", amount: 649 });
  });
});

type TestDb = ReturnType<ReturnType<RulesTestEnvironment["authenticatedContext"]>["firestore"]>;
const db = (uid = OWNER): TestDb => env.authenticatedContext(uid).firestore();
const ref = (fs: TestDb, uid = OWNER) => doc(fs, "users", uid, "recurringSuggestions", ID);

describe("recurringSuggestions rules (SPENDLY-744)", () => {
  it("the owner can read", async () => {
    await assertSucceeds(getDoc(ref(db())));
  });

  it("another user and anonymous users can't read", async () => {
    await assertFails(getDoc(ref(db(OTHER), OWNER)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "users", OWNER, "recurringSuggestions", ID)));
  });

  it("no client write at all, not even the owner's: the server owns the collection", async () => {
    await assertFails(setDoc(doc(db(), "users", OWNER, "recurringSuggestions", "x"), { key: "x" }));
    await assertFails(updateDoc(ref(db()), { amount: 1 }));
    await assertFails(deleteDoc(ref(db())));
  });
});
