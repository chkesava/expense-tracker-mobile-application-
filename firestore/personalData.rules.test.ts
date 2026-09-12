import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * Spendly personal tree — users/{uid}/... must stay readable by its owner.
 *
 * The Ganesh membership work added a `document[0] != 'pandalMemberships'`
 * guard to the recursive owner grant; nothing covered the personal
 * collections it sits on top of.
 */

const PROJECT_ID = "spendly-personal-data";
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
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "users", OWNER), { email: "owner@example.com" });
    await setDoc(doc(db, "users", OWNER, "expenses", "e1"), {
      amount: 10,
      createdAt: 1,
    });
    await setDoc(doc(db, "users", OWNER, "accounts", "a1"), { name: "Cash" });
    await setDoc(doc(db, "users", OWNER, "accounts", "a1", "statements", "s1"), {
      month: "2026-09",
    });
  });
});

describe("personal tree", () => {
  const collections = [
    "expenses",
    "incomes",
    "accounts",
    "accountTypes",
    "accountEntries",
    "accountPayments",
    "accountTransfers",
    "categories",
    "subscriptions",
    // KAN-65 — EPF lives on the recursive owner grant like everything else here.
    "epfProfile",
    "epfEstablishments",
    // KAN-66 — monthly contribution records.
    "epfContributions",
    // KAN-67 — per-user scheduler bookkeeping.
    "epfMeta",
    // KAN-68 — append-only contribution status audit trail.
    "epfContributionEvents",
    // KAN-69 — balance movements between establishments and their audit trail.
    "epfTransfers",
    "epfTransferEvents",
    // KAN-70 — interest per financial year and reconciliation observations.
    "epfInterestEntries",
    "epfReconciliations",
  ];

  it("owner reads their own user doc", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(getDoc(doc(db, "users", OWNER)));
  });

  for (const name of collections) {
    it(`owner lists ${name}`, async () => {
      const db = env.authenticatedContext(OWNER).firestore();
      await assertSucceeds(getDocs(collection(db, "users", OWNER, name)));
    });

    it(`owner writes ${name}`, async () => {
      const db = env.authenticatedContext(OWNER).firestore();
      await assertSucceeds(
        addDoc(collection(db, "users", OWNER, name), { v: 1 })
      );
    });
  }

  it("owner reads an ordered expenses query", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      getDocs(
        query(
          collection(db, "users", OWNER, "expenses"),
          orderBy("createdAt", "desc")
        )
      )
    );
  });

  it("owner reads a nested sub-subcollection", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      getDocs(collection(db, "users", OWNER, "accounts", "a1", "statements"))
    );
  });

  it("owner reads their duress tree", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      getDocs(collection(db, "users", `${OWNER}_duress`, "expenses"))
    );
  });

  it("a stranger cannot read the owner's expenses", async () => {
    const db = env.authenticatedContext(OTHER).firestore();
    await assertFails(getDocs(collection(db, "users", OWNER, "expenses")));
  });

  // KAN-65 — a UAN and PF member IDs are strong identity artifacts, so the
  // ownership boundary is asserted explicitly rather than only by the loop.
  it("a stranger cannot list the owner's EPF establishments", async () => {
    const db = env.authenticatedContext(OTHER).firestore();
    await assertFails(
      getDocs(collection(db, "users", OWNER, "epfEstablishments"))
    );
  });

  it("a stranger cannot list the owner's EPF contributions", async () => {
    const db = env.authenticatedContext(OTHER).firestore();
    await assertFails(getDocs(collection(db, "users", OWNER, "epfContributions")));
  });

  it("a stranger cannot write an EPF contribution into the owner's tree", async () => {
    const db = env.authenticatedContext(OTHER).firestore();
    await assertFails(
      setDoc(doc(db, "users", OWNER, "epfContributions", "est-1_2021-06"), {
        establishmentId: "est-1",
        month: "2021-06",
      })
    );
  });

  it("a stranger cannot read the owner's EPF profile", async () => {
    const db = env.authenticatedContext(OTHER).firestore();
    await assertFails(getDoc(doc(db, "users", OWNER, "epfProfile", "main")));
  });

  it("a stranger cannot write the owner's EPF profile", async () => {
    const db = env.authenticatedContext(OTHER).firestore();
    await assertFails(
      setDoc(doc(db, "users", OWNER, "epfProfile", "main"), {
        uan: "100123456789",
      })
    );
  });

  it("owner reads their duress EPF tree", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      getDocs(collection(db, "users", `${OWNER}_duress`, "epfEstablishments"))
    );
  });

  it("owner lists their own membership index", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(
      getDocs(collection(db, "users", OWNER, "pandalMemberships"))
    );
  });

  // The recursive owner grant must still not become a write primitive on the
  // membership index -- that exclusion is the whole reason the guard exists.
  it("owner cannot forge a membership index entry", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(
      setDoc(doc(db, "users", OWNER, "pandalMemberships", "pandal-x"), {
        pandalId: "pandal-x",
        role: "admin",
        status: "active",
      })
    );
  });
});
