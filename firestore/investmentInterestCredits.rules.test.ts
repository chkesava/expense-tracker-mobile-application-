import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * SPENDLY: fd-interest-daily's per-day credit log
 * (users/{uid}/investments/{id}/interestCredits/{date}). Server-only
 * writes (the Admin SDK bypasses rules) -- the owner may only read it, and
 * no client, including the owner, may write it.
 */

const OWNER = "fd-interest-owner";
const OTHER = "fd-interest-other";
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "spendly-fd-interest-credits",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080),
    },
  });
});

afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users", OWNER, "investments", "fd-1"), {
      name: "Test FD",
      kind: "fixed_deposit",
      principal: 100000,
      startDate: "2026-01-01",
      status: "active",
    });
    await setDoc(
      doc(context.firestore(), "users", OWNER, "investments", "fd-1", "interestCredits", "2026-01-10"),
      { date: "2026-01-10", amount: 20, balanceAfter: 100020 }
    );
  });
});

describe("investments/{id}/interestCredits rules", () => {
  it("owner can read the credit log", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      getDoc(doc(db, "users", OWNER, "investments", "fd-1", "interestCredits", "2026-01-10"))
    );
    await assertSucceeds(
      getDocs(collection(db, "users", OWNER, "investments", "fd-1", "interestCredits"))
    );
  });

  it("no client, including the owner, may write the credit log", async () => {
    const owner = env.authenticatedContext(OWNER).firestore();
    await assertFails(
      setDoc(doc(owner, "users", OWNER, "investments", "fd-1", "interestCredits", "2026-01-11"), {
        date: "2026-01-11",
        amount: 999999,
        balanceAfter: 999999,
      })
    );
    await assertFails(
      deleteDoc(doc(owner, "users", OWNER, "investments", "fd-1", "interestCredits", "2026-01-10"))
    );
  });

  it("another user cannot read it", async () => {
    const other = env.authenticatedContext(OTHER).firestore();
    await assertFails(
      getDoc(doc(other, "users", OWNER, "investments", "fd-1", "interestCredits", "2026-01-10"))
    );
  });
});
