import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * SPENDLY-794 (epic SPENDLY-793): low-balance alert fields.
 * - subscriptions.lowBalanceLeadDays: null, or a whole number 0-15.
 * - accounts.autopay*: the paying account (never the card itself), the
 *   amount mode (total | minimum) and lead days; null clears each one.
 */

const PROJECT_ID = "spendly-low-balance-alerts";
const OWNER = "u-owner";

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

const db = () => env.authenticatedContext(OWNER).firestore();
const subRef = (id = "s1") => doc(db(), "users", OWNER, "subscriptions", id);
const accountRef = (id = "card1") => doc(db(), "users", OWNER, "accounts", id);

const sub = (over: Record<string, unknown> = {}) => ({
  name: "Home loan EMI",
  amount: 25000,
  category: "EMI",
  dayOfMonth: 5,
  isActive: true,
  lastProcessed: "",
  type: "emi",
  accountId: "bank1",
  ...over,
});

const card = (over: Record<string, unknown> = {}) => ({
  name: "HDFC Card",
  typeId: "type-cc",
  ...over,
});

describe("subscriptions.lowBalanceLeadDays", () => {
  it("accepts missing, null and whole days 0-15", async () => {
    await assertSucceeds(setDoc(subRef("a"), sub()));
    await assertSucceeds(setDoc(subRef("b"), sub({ lowBalanceLeadDays: null })));
    await assertSucceeds(setDoc(subRef("c"), sub({ lowBalanceLeadDays: 0 })));
    await assertSucceeds(setDoc(subRef("d"), sub({ lowBalanceLeadDays: 15 })));
    await assertSucceeds(updateDoc(subRef("a"), { lowBalanceLeadDays: 7 }));
  });

  it("rejects out-of-range, fractional and non-number values", async () => {
    await assertFails(setDoc(subRef("a"), sub({ lowBalanceLeadDays: -1 })));
    await assertFails(setDoc(subRef("b"), sub({ lowBalanceLeadDays: 16 })));
    await assertFails(setDoc(subRef("c"), sub({ lowBalanceLeadDays: 2.5 })));
    await assertFails(setDoc(subRef("d"), sub({ lowBalanceLeadDays: "3" })));
  });
});

describe("accounts autopay", () => {
  it("accepts a link to another account, and null clears it", async () => {
    await assertSucceeds(setDoc(accountRef(), card()));
    await assertSucceeds(
      updateDoc(accountRef(), { autopayFromAccountId: "bank1", autopayAmountMode: "minimum", autopayLeadDays: 5 })
    );
    await assertSucceeds(updateDoc(accountRef(), { autopayAmountMode: "total" }));
    await assertSucceeds(
      updateDoc(accountRef(), { autopayFromAccountId: null, autopayAmountMode: null, autopayLeadDays: null })
    );
  });

  it("rejects the card paying itself", async () => {
    await assertFails(setDoc(accountRef("card1"), card({ autopayFromAccountId: "card1" })));
    await assertSucceeds(setDoc(accountRef("card1"), card()));
    await assertFails(updateDoc(accountRef("card1"), { autopayFromAccountId: "card1" }));
  });

  it("rejects bad modes, ids and lead days", async () => {
    await assertSucceeds(setDoc(accountRef(), card()));
    await assertFails(updateDoc(accountRef(), { autopayAmountMode: "half" }));
    await assertFails(updateDoc(accountRef(), { autopayFromAccountId: "" }));
    await assertFails(updateDoc(accountRef(), { autopayFromAccountId: 42 }));
    await assertFails(updateDoc(accountRef(), { autopayLeadDays: 20 }));
  });
});
