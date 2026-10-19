import { readFileSync } from "node:fs";
import {
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  buildDashboardSummaryOps,
  computeDashboardExpenseCreateOps,
  computeDashboardExpenseUpdateOps,
} from "@/shared/utils/dashboardMutations";

/**
 * SPENDLY-495 — proves against the real Firestore emulator what the unit tests
 * can only assume: set({merge:true}) with a nested `categoryTotals` map
 * deep-merges and increments per key, while the old dotted-key shape wrote a
 * literal top-level field and never touched the map.
 */

const PROJECT_ID = "spendly-dashboard-summary";
const OWNER = "u-owner";
const SUMMARY = `users/${OWNER}/financialSummaries/dashboard_2026-10`;

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

type ContextDb = ReturnType<ReturnType<RulesTestEnvironment["authenticatedContext"]>["firestore"]>;

/** Applies ops the way lib/commitMutations does (set + merge). */
async function apply(db: ContextDb, ops: any[]) {
  for (const op of ops) {
    await assertSucceeds(setDoc(doc(db, op.ref.path), op.data, { merge: op.merge }));
  }
}

describe("dashboard summary writes (SPENDLY-495)", () => {
  it("the old dotted key in set({merge}) wrote a literal field, not the map", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await setDoc(doc(db, SUMMARY), { "categoryTotals.Food": 100 }, { merge: true });
    const data = (await getDoc(doc(db, SUMMARY))).data()!;
    expect(data["categoryTotals.Food"]).toBe(100);
    expect(data.categoryTotals).toBeUndefined();
  });

  it("nested categoryTotals deep-merge and increment per key, creating the doc if missing", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    const row = { amount: 100, category: "Food", subcategory: "Dining", month: "2026-10", date: "2026-10-05" };

    await apply(db, computeDashboardExpenseCreateOps(OWNER, row));
    await apply(db, computeDashboardExpenseCreateOps(OWNER, { ...row, amount: 40, category: "Travel", subcategory: "" }));
    await apply(db, computeDashboardExpenseUpdateOps(OWNER, row, { ...row, amount: 120, subcategory: "Snacks" }));

    const data = (await getDoc(doc(db, SUMMARY))).data()!;
    expect(Object.keys(data).filter((k) => k.includes("."))).toEqual([]);
    expect(data.totalExpenses).toBe(160);
    expect(data.transactionCount).toBe(2);
    expect(data.categoryTotals).toEqual({
      Food: 120,
      "Food::Dining": 0,
      "Food::Snacks": 120,
      Travel: 40,
    });
  });

  it("a later write leaves keys it does not mention untouched", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await apply(db, buildDashboardSummaryOps(OWNER, "2026-10", { categoryDeltas: { Food: 10, Bills: 5 } }));
    await apply(db, buildDashboardSummaryOps(OWNER, "2026-10", { categoryDeltas: { Food: 2 } }));
    const data = (await getDoc(doc(db, SUMMARY))).data()!;
    expect(data.categoryTotals).toEqual({ Food: 12, Bills: 5 });
  });
});
