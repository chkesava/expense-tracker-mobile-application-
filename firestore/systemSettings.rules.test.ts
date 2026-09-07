import { readFileSync } from "node:fs";
import {
  assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * system_settings release pointers must be readable signed-out.
 *
 * The update prompt attaches before sign-in finishes, so `latest_release*`
 * is deliberately public. `isReleasePointer()` was declared at the top level
 * where `docId` is unbound, which made the guard error and deny -- these
 * cases pin it inside the match block.
 */

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "sysset-scope",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080),
    },
  });
});
afterAll(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    for (const id of [
      "latest_release",
      "latest_release_expense",
      "latest_release_nutrition",
      "latest_release_ganesh",
      "global",
    ]) {
      await setDoc(doc(db, "system_settings", id), { v: 1 });
    }
  });
});

describe("system_settings release pointer", () => {
  for (const id of [
    "latest_release",
    "latest_release_expense",
    "latest_release_nutrition",
    "latest_release_ganesh",
  ]) {
    it(`SIGNED-OUT can read ${id} (update prompt before sign-in)`, async () => {
      const db = env.unauthenticatedContext().firestore();
      await assertSucceeds(getDoc(doc(db, "system_settings", id)));
    });
  }

  it("signed-in can read global", async () => {
    const db = env.authenticatedContext("u1").firestore();
    await assertSucceeds(getDoc(doc(db, "system_settings", "global")));
  });

  it("signed-out CANNOT read global", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "system_settings", "global")));
  });

  it("signed-in can write global", async () => {
    const db = env.authenticatedContext("u1").firestore();
    await assertSucceeds(setDoc(doc(db, "system_settings", "global"), { currency: "INR" }));
  });

  // Public read must not become a public write, and only `global` is
  // app-writable -- release pointers are the Admin SDK's in CI.
  it("signed-out cannot write a release pointer", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, "system_settings", "latest_release"), { url: "evil" }));
  });

  it("signed-in cannot write a release pointer", async () => {
    const db = env.authenticatedContext("u1").firestore();
    await assertFails(setDoc(doc(db, "system_settings", "latest_release"), { url: "evil" }));
  });
});
