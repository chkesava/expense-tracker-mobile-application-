import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * SPENDLY-313 — users/{uid}/feeReviews.
 *
 * A review is a classification of an existing ledger row, never money, and
 * there may be at most one per source transaction.
 */

const PROJECT_ID = "spendly-fee-reviews";
const OWNER = "u-owner";
const OTHER = "u-other";
const DOC_ID = "expense__e1";

let env: RulesTestEnvironment;

function validReview(overrides: Record<string, unknown> = {}) {
  return {
    sourceKind: "expense",
    sourceId: "e1",
    decision: "correct",
    role: "fee",
    feeType: "atm_cash",
    subtype: "other_bank_atm",
    components: { principal: 0, fee: 20, tax: 3.6, interest: 0 },
    sourceAmount: 23.6,
    inferredRole: "fee",
    inferredFeeType: "atm_cash",
    inferredConfidence: 0.6,
    engineVersion: 1,
    note: "Other bank ATM",
    revision: 1,
    createdAtMs: 100,
    updatedAtMs: 100,
    ...overrides,
  };
}

function ownerDb(uid = OWNER) {
  return env.authenticatedContext(uid).firestore();
}

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

describe("feeReviews ownership", () => {
  it("lets the owner create, read, list, update and delete", async () => {
    const db = ownerDb();
    const ref = doc(db, "users", OWNER, "feeReviews", DOC_ID);
    await assertSucceeds(setDoc(ref, validReview()));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(getDocs(collection(db, "users", OWNER, "feeReviews")));
    await assertSucceeds(updateDoc(ref, { decision: "confirm", revision: 2, updatedAtMs: 200 }));
    await assertSucceeds(deleteDoc(ref));
  });

  it("lets the duress twin of the owner write", async () => {
    const db = ownerDb();
    await assertSucceeds(
      setDoc(doc(db, "users", `${OWNER}_duress`, "feeReviews", DOC_ID), validReview())
    );
  });

  it("denies every other user and anonymous access", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", OWNER, "feeReviews", DOC_ID), validReview());
    });
    const other = ownerDb(OTHER);
    const ref = doc(other, "users", OWNER, "feeReviews", DOC_ID);
    await assertFails(getDoc(ref));
    await assertFails(getDocs(collection(other, "users", OWNER, "feeReviews")));
    await assertFails(setDoc(doc(other, "users", OWNER, "feeReviews", "expense__e2"), validReview({ sourceId: "e2" })));
    await assertFails(updateDoc(ref, { revision: 2, updatedAtMs: 2 }));
    await assertFails(deleteDoc(ref));

    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, "users", OWNER, "feeReviews", DOC_ID)));
  });
});

describe("feeReviews shape", () => {
  async function denied(overrides: Record<string, unknown>, docId = DOC_ID) {
    await assertFails(setDoc(doc(ownerDb(), "users", OWNER, "feeReviews", docId), validReview(overrides)));
  }

  it("accepts a minimal not-a-fee review", async () => {
    await assertSucceeds(
      setDoc(doc(ownerDb(), "users", OWNER, "feeReviews", DOC_ID), {
        sourceKind: "expense",
        sourceId: "e1",
        decision: "not_fee",
        role: "not_fee",
        components: { principal: 23.6, fee: 0, tax: 0, interest: 0 },
        sourceAmount: 23.6,
        revision: 1,
        createdAtMs: 1,
        updatedAtMs: 1,
      })
    );
  });

  it("refuses a doc id that does not name its own source (no second review)", async () => {
    await denied({}, "expense__e2");
    await denied({}, "income__e1");
    await denied({}, "random-id");
  });

  it("refuses money fields — a review is never a ledger row", async () => {
    await denied({ amount: 23.6 });
    await denied({ date: "2026-09-10" });
  });

  it("refuses unknown enums", async () => {
    await denied({ sourceKind: "trade" }, "trade__e1");
    await denied({ decision: "maybe" });
    await denied({ role: "gst" });
    await denied({ feeType: "gst" });
    await denied({ inferredRole: "gst" });
    await denied({ inferredFeeType: "gst" });
    await denied({ linkedKind: "trade", linkedId: "x" });
  });

  it("refuses malformed components", async () => {
    await denied({ components: { principal: 0, fee: -1, tax: 0, interest: 0 } });
    await denied({ components: { fee: 23.6 } });
    await denied({ components: { principal: 0, fee: 20, tax: 3.6, interest: 0, extra: 1 } });
    await denied({ components: 23.6 });
  });

  it("accepts bounded correction history and refuses an unbounded one", async () => {
    const entry = { revision: 1, decision: "confirm", role: "fee", components: { principal: 0, fee: 23.6, tax: 0, interest: 0 }, atMs: 1 };
    await assertSucceeds(
      setDoc(doc(ownerDb(), "users", OWNER, "feeReviews", DOC_ID), validReview({ revision: 2, history: [entry] }))
    );
    await assertSucceeds(
      setDoc(
        doc(ownerDb(), "users", OWNER, "feeReviews", "expense__e8"),
        validReview({ sourceId: "e8", history: Array.from({ length: 20 }, () => entry) })
      )
    );
    await denied({ sourceId: "e9", history: Array.from({ length: 21 }, () => entry) }, "expense__e9");
    await denied({ sourceId: "e7", history: "not a list" }, "expense__e7");
  });

  it("refuses out-of-range values", async () => {
    await denied({ sourceAmount: -1 });
    await denied({ inferredConfidence: 1.5 });
    await denied({ revision: 0 });
    await denied({ revision: 1.5 });
    await denied({ note: "x".repeat(501) });
    await denied({ subtype: "x".repeat(41) });
  });
});

describe("feeReviews updates", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", OWNER, "feeReviews", DOC_ID), validReview({ revision: 2 }));
    });
  });

  const ref = () => doc(ownerDb(), "users", OWNER, "feeReviews", DOC_ID);

  it("requires the revision to advance", async () => {
    await assertFails(updateDoc(ref(), { decision: "confirm", updatedAtMs: 300 }));
    await assertFails(updateDoc(ref(), { decision: "confirm", revision: 1, updatedAtMs: 300 }));
    await assertSucceeds(updateDoc(ref(), { decision: "confirm", revision: 3, updatedAtMs: 300 }));
  });

  it("pins source identity and creation time", async () => {
    await assertFails(updateDoc(ref(), { sourceId: "e9", revision: 3 }));
    await assertFails(updateDoc(ref(), { createdAtMs: 1, revision: 3 }));
  });
});
