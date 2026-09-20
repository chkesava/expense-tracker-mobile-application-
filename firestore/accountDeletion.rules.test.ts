import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * SPENDLY-7 (AUTH-06) — the invariants account deletion is built on.
 *
 * The deletion itself runs through the Admin SDK in
 * `netlify/functions/delete-account.ts`, which bypasses these rules entirely
 * and cannot be reached from vitest. What *can* be proven here is the other
 * half of the argument: that a client could not do this work itself, which is
 * why the function exists and why it makes the choices it does.
 */

const PROJECT_ID = "spendly-account-deletion";
const OWNER = "u-owner";
const OTHER = "u-other";
const PANDAL = "p1";

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
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "users", OWNER), { username: "owner" });
    await setDoc(doc(db, "users", OWNER, "expenses", "e1"), { amount: 100 });
    await setDoc(doc(db, "pandals", PANDAL), {
      name: "Mandal",
      ownerId: OWNER,
      adminCount: 1,
      memberIds: [OWNER],
    });
    await setDoc(doc(db, "pandals", PANDAL, "members", OWNER), {
      userId: OWNER,
      role: "admin",
      status: "active",
    });
  });
});

describe("what the account owner can clean up themselves", () => {
  it("deletes their own user document", () => {
    // The function's last act in the user-tree phase. Nothing asserted this
    // before, and the whole phase depends on it not having quietly tightened.
    const db = env.authenticatedContext(OWNER).firestore();
    return assertSucceeds(deleteDoc(doc(db, "users", OWNER)));
  });

  it("deletes their own subcollection documents", () => {
    const db = env.authenticatedContext(OWNER).firestore();
    return assertSucceeds(deleteDoc(doc(db, "users", OWNER, "expenses", "e1")));
  });

  it("cannot delete somebody else's user document", () => {
    const db = env.authenticatedContext(OTHER).firestore();
    return assertFails(deleteDoc(doc(db, "users", OWNER)));
  });
});

describe("why Ganesh membership is marked, not deleted", () => {
  it("nobody can delete a member document — not even the member", () => {
    // `allow delete: if false`. This is the rule that forces the function to
    // mark `status: "removed"` instead, and it is the right rule: the Pandal's
    // collections and audit rows reference the member by id.
    const db = env.authenticatedContext(OWNER).firestore();
    return assertFails(
      deleteDoc(doc(db, "pandals", PANDAL, "members", OWNER)),
    );
  });

  it("an admin cannot drop the Pandal below one admin from the client", () => {
    // `keepsAdminCount()` enforces the floor. Account deletion deliberately
    // *does* orphan a Pandal when the last admin leaves, which proves that
    // step has to be Admin-SDK-only and cannot be forged from the app.
    const db = env.authenticatedContext(OWNER).firestore();
    return assertFails(
      updateDoc(doc(db, "pandals", PANDAL), {
        adminCount: 0,
        needsAdmin: true,
      }),
    );
  });
});

describe("why shared documents are deleted rather than orphaned", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "splits", "s1"), {
        createdBy: OWNER,
        participantIds: [OWNER, OTHER],
        totalAmount: 100,
      });
    });
  });

  it("a participant cannot delete a split they did not create", () => {
    // So a split outliving its creator can never be removed by anyone left in
    // it. That is why the function deletes them rather than leaving them.
    const db = env.authenticatedContext(OTHER).firestore();
    return assertFails(deleteDoc(doc(db, "splits", "s1")));
  });

  it("a participant cannot take over a split by rewriting createdBy", () => {
    const db = env.authenticatedContext(OTHER).firestore();
    return assertFails(updateDoc(doc(db, "splits", "s1"), { createdBy: OTHER }));
  });

  it("the creator can delete their own split", () => {
    const db = env.authenticatedContext(OWNER).firestore();
    return assertSucceeds(deleteDoc(doc(db, "splits", "s1")));
  });
});
