import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteField, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * investmentWellFormed() validates principal, startDate and (new)
 * annualInterestRate -- the field an "edit interest rate" UI writes.
 * `lastInterestCreditedDate` is unvalidated (the app clears it to `null` to
 * signal fd-interest-daily to recompute the FD's whole history at the
 * corrected rate), so nothing here should reject that.
 */

const OWNER = "investment-owner";
const OTHER = "investment-other";
let env: RulesTestEnvironment;

const valid = {
  name: "Test FD",
  kind: "fixed_deposit",
  principal: 100000,
  startDate: "2026-01-01",
  annualInterestRate: 7.25,
  interestMethod: "compound",
  status: "active",
};

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "spendly-investments",
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
    await setDoc(doc(context.firestore(), "users", OWNER, "investments", "fd-1"), valid);
  });
});

describe("investments rules", () => {
  it("owner can create with a valid annualInterestRate", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      setDoc(doc(db, "users", OWNER, "investments", "fd-2"), { ...valid, annualInterestRate: 6.5 })
    );
  });

  it("rejects a negative or non-numeric rate", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(
      setDoc(doc(db, "users", OWNER, "investments", "fd-3"), { ...valid, annualInterestRate: -1 })
    );
    await assertFails(
      setDoc(doc(db, "users", OWNER, "investments", "fd-4"), { ...valid, annualInterestRate: "7.25" })
    );
  });

  it("owner can edit the rate and clear lastInterestCreditedDate to null to trigger a recompute", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      updateDoc(doc(db, "users", OWNER, "investments", "fd-1"), {
        annualInterestRate: 8.1,
        lastInterestCreditedDate: null,
      })
    );
    const after = await getDoc(doc(db, "users", OWNER, "investments", "fd-1"));
    expect(after.data()?.annualInterestRate).toBe(8.1);
    expect(after.data()?.lastInterestCreditedDate).toBeNull();
  });

  it("owner can also just omit or delete lastInterestCreditedDate", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      updateDoc(doc(db, "users", OWNER, "investments", "fd-1"), {
        lastInterestCreditedDate: deleteField(),
      })
    );
  });

  it("another user cannot read or edit it", async () => {
    const other = env.authenticatedContext(OTHER).firestore();
    await assertFails(getDoc(doc(other, "users", OWNER, "investments", "fd-1")));
    await assertFails(
      updateDoc(doc(other, "users", OWNER, "investments", "fd-1"), { annualInterestRate: 1 })
    );
  });
});
