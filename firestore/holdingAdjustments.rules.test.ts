import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * SPENDLY-421 / SPENDLY-521 — the batch a holding adjustment commits:
 * holdings update, portfolioTransactions row, holdingAdjustments audit.
 */

const PROJECT_ID = "spendly-holding-adjustments";
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
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), "users", OWNER, "holdings", "h1"), {
      symbol: "KPITTECH",
      quantity: 20,
      averageBuyPrice: 1300,
    });
  });
});

const db = (uid = OWNER) => env.authenticatedContext(uid).firestore();

const adjustmentTx = (price: number, type = "ADJUSTMENT") => ({
  holdingId: "h1",
  symbol: "KPITTECH",
  type,
  quantity: 0,
  price,
  fees: 0,
  date: "2026-10-12",
  orderStatus: "executed",
  notes: "Cost Basis Correction: test",
});

const audit = (over: Record<string, unknown> = {}) => ({
  holdingId: "h1",
  userId: OWNER,
  type: "correct_cost_basis",
  previousQuantity: 20,
  previousAveragePrice: 1300,
  previousInvestedValue: 26000,
  newQuantity: 20,
  newAveragePrice: 1223.5,
  newInvestedValue: 24470,
  transactionIds: ["t1"],
  cashEntryIds: [],
  reason: "test",
  sourceNote: "",
  createdBy: "user",
  ...over,
});

describe("portfolioTransactions price", () => {
  it("allows a negative price on an ADJUSTMENT row", async () => {
    await assertSucceeds(
      setDoc(doc(db(), "users", OWNER, "portfolioTransactions", "t1"), adjustmentTx(-1530))
    );
  });

  it("allows a positive price on an ADJUSTMENT row", async () => {
    await assertSucceeds(
      setDoc(doc(db(), "users", OWNER, "portfolioTransactions", "t1"), adjustmentTx(1530))
    );
  });

  it("still rejects a negative price on BUY/SELL rows", async () => {
    await assertFails(
      setDoc(doc(db(), "users", OWNER, "portfolioTransactions", "t1"), adjustmentTx(-1, "BUY"))
    );
    await assertFails(
      setDoc(doc(db(), "users", OWNER, "portfolioTransactions", "t1"), adjustmentTx(-1, "SELL"))
    );
  });

  it("bounds the signed ADJUSTMENT price", async () => {
    await assertFails(
      setDoc(doc(db(), "users", OWNER, "portfolioTransactions", "t1"), adjustmentTx(-1e12))
    );
  });
});

describe("cost-basis adjustment batch", () => {
  it("commits a lowered cost basis as one batch", async () => {
    const owner = db();
    const batch = writeBatch(owner);
    batch.update(doc(owner, "users", OWNER, "holdings", "h1"), { averageBuyPrice: 1223.5 });
    batch.set(doc(owner, "users", OWNER, "portfolioTransactions", "t1"), adjustmentTx(-1530));
    batch.set(doc(owner, "users", OWNER, "holdingAdjustments", "a1"), audit());
    await assertSucceeds(batch.commit());
  });

  it("rejects an unknown adjustment type", async () => {
    await assertFails(
      setDoc(doc(db(), "users", OWNER, "holdingAdjustments", "a1"), audit({ type: "other" }))
    );
  });

  it("denies other users", async () => {
    await assertFails(
      updateDoc(doc(db(OTHER), "users", OWNER, "holdings", "h1"), { averageBuyPrice: 1 })
    );
    await assertFails(
      setDoc(doc(db(OTHER), "users", OWNER, "holdingAdjustments", "a1"), audit())
    );
  });
});
