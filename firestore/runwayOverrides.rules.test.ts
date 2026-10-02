import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * SPENDLY-207 — users/{uid}/runwayOverrides. Owner and duress twin only;
 * strict field allowlist; only overridable kinds; id pinned to kind__refId.
 */

const PROJECT_ID = "spendly-runway-overrides";
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
});

const valid = (over: Record<string, unknown> = {}) => ({ kind: "fixed_deposit", refId: "fd1", included: true, updatedAtMs: 1, ...over });
const ref = (uid: string, id = "fixed_deposit__fd1") => doc(env.authenticatedContext(uid === `${OWNER}_duress` ? OWNER : uid).firestore(), "users", uid, "runwayOverrides", id);

describe("runway overrides", () => {
  it("lets the owner create, read, update and delete", async () => {
    await assertSucceeds(setDoc(ref(OWNER), valid()));
    await assertSucceeds(getDoc(ref(OWNER)));
    await assertSucceeds(updateDoc(ref(OWNER), { included: false, updatedAtMs: 2 }));
    await assertSucceeds(deleteDoc(ref(OWNER)));
  });

  it("works in the duress tree", async () => {
    await assertSucceeds(setDoc(ref(`${OWNER}_duress`), valid()));
  });

  it("denies other users", async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), "users", OWNER, "runwayOverrides", "fixed_deposit__fd1"), valid());
    });
    const other = doc(env.authenticatedContext(OTHER).firestore(), "users", OWNER, "runwayOverrides", "fixed_deposit__fd1");
    await assertFails(getDoc(other));
    await assertFails(setDoc(other, valid()));
    await assertFails(deleteDoc(other));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "users", OWNER, "runwayOverrides", "fixed_deposit__fd1")));
  });

  it("accepts every overridable kind", async () => {
    for (const kind of ["bank", "cash", "wallet", "other_account", "fixed_deposit", "interest_savings", "mutual_fund", "demat_cash"]) {
      await assertSucceeds(setDoc(ref(OWNER, `${kind}__r`), valid({ kind, refId: "r" })));
    }
  });

  it("rejects locked kinds so they can never be counted", async () => {
    for (const kind of ["epf", "stocks", "receivable", "credit_card", "borrowing", "nonsense"]) {
      await assertFails(setDoc(ref(OWNER, `${kind}__r`), valid({ kind, refId: "r" })));
    }
  });

  it("pins the id to kind__refId", async () => {
    await assertFails(setDoc(ref(OWNER, "something_else"), valid()));
    await assertSucceeds(setDoc(ref(OWNER), valid()));
    await assertFails(updateDoc(ref(OWNER), { refId: "fd2" }));
    await assertFails(updateDoc(ref(OWNER), { kind: "mutual_fund" }));
  });

  it("enforces types and the field allowlist", async () => {
    await assertFails(setDoc(ref(OWNER), valid({ included: "yes" })));
    await assertFails(setDoc(ref(OWNER), valid({ updatedAtMs: "now" })));
    await assertFails(setDoc(ref(OWNER), valid({ amount: 100 })));
    await assertFails(setDoc(ref(OWNER), { kind: "fixed_deposit", refId: "fd1", updatedAtMs: 1 }));
    await assertFails(setDoc(ref(OWNER, "fixed_deposit__"), valid({ refId: "" })));
  });
});
