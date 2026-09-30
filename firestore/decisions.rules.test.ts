import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/** SPENDLY-362 — users/{uid}/decisions and users/{uid}/decisionEvents. */

const PROJECT_ID = "spendly-decisions";
const OWNER = "u-owner";
const OTHER = "u-other";

let env: RulesTestEnvironment;
const db = (uid = OWNER) => env.authenticatedContext(uid).firestore();

function decision(over: Record<string, unknown> = {}) {
  return {
    title: "Buy a laptop?",
    category: "purchase",
    status: "draft",
    context: { constraints: [] },
    alternatives: [],
    assumptions: [],
    links: [],
    commitments: [],
    revision: 1,
    createdAtMs: 100,
    updatedAtMs: 100,
    ...over,
  };
}

const snapshot = { frozenAtMs: 200, revision: 2, alternatives: [], assumptions: [], links: [], rationale: "then" };

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

describe("decisions ownership", () => {
  it("owner and duress twin can create, read, list, update and delete", async () => {
    const ref = doc(db(), "users", OWNER, "decisions", "d1");
    await assertSucceeds(setDoc(ref, decision()));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(getDocs(collection(db(), "users", OWNER, "decisions")));
    await assertSucceeds(updateDoc(ref, { rationale: "why", revision: 2, updatedAtMs: 200 }));
    await assertSucceeds(deleteDoc(ref));
    await assertSucceeds(setDoc(doc(db(), "users", `${OWNER}_duress`, "decisions", "d1"), decision()));
  });

  it("denies other users and anonymous access to private decision notes", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", OWNER, "decisions", "d1"), decision({ rationale: "private" }));
    });
    await assertFails(getDoc(doc(db(OTHER), "users", OWNER, "decisions", "d1")));
    await assertFails(getDocs(collection(db(OTHER), "users", OWNER, "decisions")));
    await assertFails(setDoc(doc(db(OTHER), "users", OWNER, "decisions", "d2"), decision()));
    await assertFails(deleteDoc(doc(db(OTHER), "users", OWNER, "decisions", "d1")));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "users", OWNER, "decisions", "d1")));
  });
});

describe("decisions shape", () => {
  const denied = (over: Record<string, unknown>) =>
    assertFails(setDoc(doc(db(), "users", OWNER, "decisions", "bad"), decision(over)));

  it("accepts a fully populated decision", async () => {
    await assertSucceeds(
      setDoc(
        doc(db(), "users", OWNER, "decisions", "full"),
        decision({
          status: "archived",
          archivedFromStatus: "closed",
          templateId: "purchase",
          templateVersion: 1,
          context: { situation: "s", goal: "g", constraints: ["c"] },
          alternatives: [{ id: "a", title: "A", pros: [], cons: [], inputs: [] }],
          selectedAlternativeId: "a",
          rationale: "r",
          confidence: 3,
          expected: { summary: "e", amount: 10, unit: "inr" },
          outcome: { recordedAtMs: 3, summary: "o" },
          links: [{ id: "L", kind: "account", refId: "x", capturedLabel: "HDFC", capturedAtMs: 1 }],
          commitments: [{ id: "c", text: "t", status: "open" }],
          reviewDate: "2027-01-01",
          decisionSnapshot: snapshot,
          decidedAtMs: 2,
          closedAtMs: 3,
        })
      )
    );
  });

  it("refuses ledger-shaped money fields", async () => {
    await denied({ amount: 75000 });
    await denied({ date: "2026-09-30" });
    await denied({ balance: 1 });
  });

  it("refuses unknown enums and bad values", async () => {
    await denied({ category: "crypto" });
    await denied({ status: "done" });
    await denied({ archivedFromStatus: "gone" });
    await denied({ title: "" });
    await denied({ title: "x".repeat(141) });
    await denied({ confidence: 0 });
    await denied({ confidence: 2.5 });
    await denied({ reviewDate: "tomorrow" });
    await denied({ revision: 0 });
    await denied({ rationale: "x".repeat(2001) });
    await denied({ context: { constraints: [], extra: 1 } });
  });

  it("caps list sizes", async () => {
    await denied({ alternatives: Array.from({ length: 21 }, (_, i) => ({ id: `a${i}` })) });
    await denied({ links: Array.from({ length: 31 }, (_, i) => ({ id: `l${i}` })) });
  });
});

describe("decisions history", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", OWNER, "decisions", "d1"), decision({ status: "decided", decisionSnapshot: snapshot, revision: 2, decidedAtMs: 200 }));
    });
  });
  const ref = () => doc(db(), "users", OWNER, "decisions", "d1");

  it("pins the frozen snapshot once present", async () => {
    await assertFails(updateDoc(ref(), { decisionSnapshot: { ...snapshot, rationale: "rewritten" }, revision: 3 }));
    await assertSucceeds(updateDoc(ref(), { rationale: "a later thought", revision: 3 }));
  });

  it("requires the revision to advance and pins creation time", async () => {
    await assertFails(updateDoc(ref(), { rationale: "x" }));
    await assertFails(updateDoc(ref(), { rationale: "x", revision: 2 }));
    await assertFails(updateDoc(ref(), { createdAtMs: 1, revision: 3 }));
  });
});

describe("decisionEvents", () => {
  const event = { decisionId: "d1", action: "status", fromStatus: "draft", toStatus: "decided", changedFields: ["status"], revision: 2, atMs: 5 };

  it("is append-only for the owner", async () => {
    const ref = doc(db(), "users", OWNER, "decisionEvents", "e1");
    await assertSucceeds(setDoc(ref, event));
    await assertSucceeds(getDoc(ref));
    await assertFails(updateDoc(ref, { revision: 3 }));
    await assertFails(deleteDoc(ref));
    await assertFails(getDoc(doc(db(OTHER), "users", OWNER, "decisionEvents", "e1")));
  });

  it("refuses content and unknown actions", async () => {
    await assertFails(setDoc(doc(db(), "users", OWNER, "decisionEvents", "e2"), { ...event, rationale: "secret" }));
    await assertFails(setDoc(doc(db(), "users", OWNER, "decisionEvents", "e3"), { ...event, action: "rewrite" }));
    await assertFails(setDoc(doc(db(), "users", OWNER, "decisionEvents", "e4"), { ...event, changedFields: Array.from({ length: 41 }, (_, i) => `f${i}`) }));
  });
});
