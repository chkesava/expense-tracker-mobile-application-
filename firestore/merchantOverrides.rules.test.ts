import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { addDoc, collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const OWNER = "merchant-owner";
const OTHER = "merchant-other";
let env: RulesTestEnvironment;

const valid = {
  kind: "transaction",
  refKey: "expense:e1",
  merchantId: "swiggy",
  category: "Food & Groceries",
  subcategory: "Food Delivery",
  createdAtMs: 1000,
  updatedAtMs: 1000,
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "spendly-merchant-overrides",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080) },
  });
});

afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users", OWNER, "merchantOverrides", "transaction__expense_e1"), valid);
  });
});

describe("merchantOverrides rules", () => {
  it("owner can list and create a valid correction", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(getDocs(collection(db, "users", OWNER, "merchantOverrides")));
    await assertSucceeds(addDoc(collection(db, "users", OWNER, "merchantOverrides"), {
      kind: "alias", refKey: "swiggy", customName: "My Swiggy", createdAtMs: 2, updatedAtMs: 2,
    }));
  });

  it("allows a rejection but not an unnamed non-rejection", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(addDoc(collection(db, "users", OWNER, "merchantOverrides"), {
      kind: "transaction", refKey: "expense:e2", rejected: true, createdAtMs: 2, updatedAtMs: 2,
    }));
    await assertFails(addDoc(collection(db, "users", OWNER, "merchantOverrides"), {
      kind: "transaction", refKey: "expense:e3", createdAtMs: 2, updatedAtMs: 2,
    }));
  });

  it("rejects schema pollution, invalid lengths, mixed names, and mutable identity", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(addDoc(collection(db, "users", OWNER, "merchantOverrides"), { ...valid, extra: true }));
    await assertFails(addDoc(collection(db, "users", OWNER, "merchantOverrides"), { ...valid, customName: "x", updatedAtMs: 2 }));
    await assertFails(addDoc(collection(db, "users", OWNER, "merchantOverrides"), { ...valid, refKey: "x".repeat(201) }));
    await assertFails(updateDoc(doc(db, "users", OWNER, "merchantOverrides", "transaction__expense_e1"), { kind: "alias" }));
    await assertFails(updateDoc(doc(db, "users", OWNER, "merchantOverrides", "transaction__expense_e1"), { createdAtMs: 2 }));
  });

  it("isolates users and denies unknown personal collections", async () => {
    const owner = env.authenticatedContext(OWNER).firestore();
    const other = env.authenticatedContext(OTHER).firestore();
    await assertFails(getDocs(collection(other, "users", OWNER, "merchantOverrides")));
    await assertFails(deleteDoc(doc(other, "users", OWNER, "merchantOverrides", "transaction__expense_e1")));
    await assertFails(setDoc(doc(owner, "users", OWNER, "notMerchantOverrides", "x"), valid));
  });
});
