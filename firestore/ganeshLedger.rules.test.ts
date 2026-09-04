import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Rules tested against the real rules engine (GS-074, GS-004).
 *
 * Every other rules test in this repo is a hand-written TypeScript mirror of
 * `firestore.rules`. A mirror proves the mirror, not the rules — and it has
 * already let a real defect through: the GS-084 membership-index allowlist
 * compiled, passed its mirror, and would have denied every admin role change
 * because it omitted a field the app actually sends. This suite runs the
 * deployed rules file against payloads the app really writes, in the emulator.
 *
 * It exists mainly so GS-004's field allowlist can be added with proof rather
 * than hope: that project's Firebase instance also serves production, and
 * `firestore.rules` is deployed by hand, so a denied write is a live outage.
 *
 * Run with `npm run test:rules` (starts the emulator around the suite).
 */

const PROJECT_ID = "ganesh-rules-test";
const PANDAL = "pandal-1";
const FESTIVAL = "festival-1";

const ADMIN = "u-admin";
const COLLECTOR = "u-collector";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

/**
 * Seed the documents the rules read for authorization — the pandal, an open
 * festival, and the member documents whose role and status every predicate
 * consults. Written with rules disabled: this is fixture setup, not a case.
 */
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "pandals", PANDAL), {
      name: "Test Pandal",
      code: "GNSH-TEST",
      ownerId: ADMIN,
      memberIds: [ADMIN, COLLECTOR],
      adminCount: 1,
      createdBy: ADMIN,
      updatedBy: ADMIN,
    });
    await setDoc(doc(db, "pandals", PANDAL, "members", ADMIN), {
      userId: ADMIN,
      displayName: "Admin",
      role: "admin",
      status: "active",
    });
    await setDoc(doc(db, "pandals", PANDAL, "members", COLLECTOR), {
      userId: COLLECTOR,
      displayName: "Collector",
      role: "collector",
      status: "active",
    });
    await setDoc(doc(db, "pandals", PANDAL, "festivals", FESTIVAL), {
      name: "Ganesh Utsav Test",
      year: 2026,
      status: "open",
      createdBy: ADMIN,
      updatedBy: ADMIN,
    });
  });
});

function as(uid: string) {
  return env.authenticatedContext(uid).firestore();
}

function collectionsPath(id: string) {
  return ["pandals", PANDAL, "festivals", FESTIVAL, "collections", id] as const;
}

/** The payload `addCollection` actually writes, minus the server sentinels. */
function honestCollection(overrides: Record<string, unknown> = {}) {
  return {
    donorName: "Ramesh",
    amount: 500,
    paymentMethod: "cash",
    collectorId: COLLECTOR,
    date: "2026-09-04",
    ledgerType: "COLLECTION",
    createdBy: COLLECTOR,
    updatedBy: COLLECTOR,
    ...overrides,
  };
}

describe("harness", () => {
  it("runs the real rules file, not a mirror", async () => {
    // A signed-out client must be refused. If this passes while everything
    // else also passes, the suite is not actually evaluating rules.
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(anon, ...collectionsPath("c-anon")), honestCollection()));
  });

  it("refuses a stranger who is not a member of the pandal", async () => {
    const stranger = as("u-nobody");
    await assertFails(setDoc(doc(stranger, ...collectionsPath("c-str")), honestCollection()));
  });
});

describe("collections - the payload the app really writes", () => {
  it("lets a collector record a collection", async () => {
    const db = as(COLLECTOR);
    await assertSucceeds(setDoc(doc(db, ...collectionsPath("c-1")), honestCollection()));
  });

  it("accepts the optional fields addCollection can include", async () => {
    // These are the ones a hand-written allowlist is most likely to miss.
    const db = as(COLLECTOR);
    await assertSucceeds(
      setDoc(
        doc(db, ...collectionsPath("c-2")),
        honestCollection({
          householdId: "h-1",
          mobile: "9999999999",
          houseNumber: "12/A",
          address: "Main Road",
          receiptNumber: "GNS26-000182",
          clientOpId: "op-123",
          notes: "Paid in two notes",
        })
      )
    );
  });
});

describe("GS-004 value validation is live", () => {
  it("rejects a negative amount", async () => {
    const db = as(COLLECTOR);
    await assertFails(
      setDoc(doc(db, ...collectionsPath("c-neg")), honestCollection({ amount: -50_000 }))
    );
  });

  it("rejects a non-numeric amount", async () => {
    const db = as(COLLECTOR);
    await assertFails(
      setDoc(doc(db, ...collectionsPath("c-str")), honestCollection({ amount: "500" }))
    );
  });

  it("rejects an overflow-shaped amount", async () => {
    const db = as(COLLECTOR);
    await assertFails(
      setDoc(doc(db, ...collectionsPath("c-big")), honestCollection({ amount: 1e300 }))
    );
  });

  it("rejects a household status outside the enum", async () => {
    const db = as(ADMIN);
    await assertFails(
      setDoc(doc(db, "pandals", PANDAL, "festivals", FESTIVAL, "households", "h-bad"), {
        name: "House 9",
        expectedAmount: 500,
        collectedAmount: 0,
        status: "definitely_paid",
        createdBy: ADMIN,
        updatedBy: ADMIN,
      })
    );
  });
});

describe("GS-004 summary forgery", () => {
  const summaryPath = ["pandals", PANDAL, "festivals", FESTIVAL, "summary", "totals"] as const;

  it("rejects a summary write carrying a field outside the allowlist", async () => {
    const db = as(COLLECTOR);
    await assertFails(
      setDoc(doc(db, ...summaryPath), { chanda: 1000, notASummaryField: true })
    );
  });

  it("still allows the shape bumpSummary writes", async () => {
    const db = as(COLLECTOR);
    await assertSucceeds(setDoc(doc(db, ...summaryPath), { chanda: 1000 }, { merge: true }));
  });

  it("records the residual gap: a plausible wrong number is still accepted", async () => {
    // Not a hole this suite can close — see GS-004's residual-gap note. The
    // allowlist and ranges stop malformed and stray-field writes; stopping a
    // *plausible* forgery needs server-side summary maintenance. Asserted so
    // the day that changes, this test fails and the ticket gets revisited.
    const db = as(COLLECTOR);
    await assertSucceeds(setDoc(doc(db, ...summaryPath), { chanda: 9_999_999 }, { merge: true }));
  });
});

describe("GS-017 / GS-083 hard delete stays refused", () => {
  it("refuses deleting a festival even as the owner-admin", async () => {
    const db = as(ADMIN);
    await assertFails(deleteDoc(doc(db, "pandals", PANDAL, "festivals", FESTIVAL)));
  });

  it("refuses deleting the pandal itself", async () => {
    const db = as(ADMIN);
    await assertFails(deleteDoc(doc(db, "pandals", PANDAL)));
  });
});

describe("GS-073 donor data is gated by permission", () => {
  it("lets a collector read collections", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), ...collectionsPath("c-read")),
        honestCollection()
      );
    });
    const db = as(COLLECTOR);
    await assertSucceeds(getDoc(doc(db, ...collectionsPath("c-read"))));
  });

  it("refuses a viewer with no collections.read permission", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "pandals", PANDAL, "members", "u-viewer"), {
        userId: "u-viewer",
        displayName: "Viewer",
        role: "viewer",
        status: "active",
        permissions: [],
      });
      await setDoc(doc(db, ...collectionsPath("c-read2")), honestCollection());
    });
    const db = as("u-viewer");
    await assertFails(getDoc(doc(db, ...collectionsPath("c-read2"))));
  });
});

describe("the summary write budget", () => {
  const summaryPath = ["pandals", PANDAL, "festivals", FESTIVAL, "summary", "totals"] as const;

  it("accepts the single-field increment shape bumpSummary uses", async () => {
    const db = as(COLLECTOR);
    await assertSucceeds(
      setDoc(doc(db, ...summaryPath), { chanda: 1000 }, { merge: true })
    );
  });

  it("accepts a full EMPTY_GANESH_SUMMARY-shaped seed", async () => {
    const db = as(ADMIN);
    await assertSucceeds(
      setDoc(doc(db, ...summaryPath), {
        chanda: 0,
        collectionCount: 0,
        committeeContributions: 0,
        otherCashContributions: 0,
        promisedCashContributions: 0,
        promisedInKindValue: 0,
        inKindValue: 0,
        sponsoredValue: 0,
        sponsoredExpenseAmount: 0,
        godFundExpenses: 0,
        assetPurchaseAmount: 0,
        personalMoneyUsed: 0,
        pendingReimbursements: 0,
        receivedFromPermanentFund: 0,
        transferredToPermanentFund: 0,
      })
    );
  });
});

describe("suite integrity", () => {
  it("is evaluating the rules file on disk", () => {
    // Guards against the suite silently passing because the rules string was
    // empty or unreadable.
    const rules = readFileSync("firestore.rules", "utf8");
    expect(rules).toContain("payloadWellFormed");
    expect(rules.length).toBeGreaterThan(1000);
  });
});
