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
 * Separation of duties, enforced by the rules engine (GS-075, GS-076).
 *
 * The service layer checks all of this too, but a client-side check is not a
 * control — anyone can call Firestore directly with the same credentials. These
 * tests run the real rules file, so what they prove is what the server will
 * actually refuse.
 *
 * Run with `npm run test:rules`.
 */

const PROJECT_ID = "ganesh-reconciliation-rules";
const PANDAL = "pandal-1";
const FESTIVAL = "festival-1";

const ADMIN = "u-admin";
const TREASURER = "u-treasurer";
const COLLECTOR = "u-collector";
/** The second authorized person: approves, never counts. */
const APPROVER = "u-approver";

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

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "pandals", PANDAL), {
      name: "Test Pandal",
      code: "GNSH-TEST",
      ownerId: ADMIN,
      memberIds: [ADMIN, TREASURER, COLLECTOR, APPROVER],
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
    // Denormalized permissions, matching the shipped role defaults.
    await setDoc(doc(db, "pandals", PANDAL, "members", TREASURER), {
      userId: TREASURER,
      displayName: "Treasurer",
      role: "treasurer",
      status: "active",
      permissions: [
        "collections.read",
        "collections.create",
        "sessions.read",
        "sessions.write",
        "reconciliation.read",
        "reconciliation.count",
        "reconciliation.approve",
        "reconciliation.resolve",
      ],
    });
    await setDoc(doc(db, "pandals", PANDAL, "members", COLLECTOR), {
      userId: COLLECTOR,
      displayName: "Collector",
      role: "collector",
      status: "active",
      permissions: [
        "collections.read",
        "collections.create",
        "sessions.read",
        "sessions.write",
        "reconciliation.read",
      ],
    });
    await setDoc(doc(db, "pandals", PANDAL, "members", APPROVER), {
      userId: APPROVER,
      displayName: "Second Treasurer",
      role: "treasurer",
      status: "active",
      permissions: [
        "collections.read",
        "sessions.read",
        "reconciliation.read",
        "reconciliation.count",
        "reconciliation.approve",
        "reconciliation.resolve",
      ],
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

function sessionDoc(uid: string, id: string) {
  return doc(as(uid), "pandals", PANDAL, "festivals", FESTIVAL, "collectionSessions", id);
}

function reconDoc(uid: string, id: string) {
  return doc(as(uid), "pandals", PANDAL, "festivals", FESTIVAL, "reconciliations", id);
}

function adjustmentDoc(uid: string, id: string) {
  return doc(as(uid), "pandals", PANDAL, "festivals", FESTIVAL, "cashAdjustments", id);
}

const SESSION = {
  collectorId: COLLECTOR,
  collectorName: "Collector",
  status: "open",
  date: "2026-09-05",
  expectedCash: 0,
  expectedNonCash: 0,
  totalCollected: 0,
  collectionCount: 0,
  createdBy: COLLECTOR,
  updatedBy: COLLECTOR,
};

function reconciliation(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "s-1",
    collectorId: COLLECTOR,
    expectedCash: 5000,
    declaredCash: 5000,
    countedCash: 5000,
    difference: 0,
    countedBy: TREASURER,
    countedByName: "Treasurer",
    status: "counted",
    locked: false,
    createdBy: TREASURER,
    updatedBy: TREASURER,
    ...overrides,
  };
}

describe("GS-076 collection sessions", () => {
  it("lets a collector open their own session", async () => {
    await assertSucceeds(setDoc(sessionDoc(COLLECTOR, "s-1"), SESSION));
  });

  it("refuses a member with no sessions.write", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "pandals", PANDAL, "members", "u-viewer"), {
        userId: "u-viewer",
        displayName: "Viewer",
        role: "viewer",
        status: "active",
        permissions: ["collections.read"],
      });
    });
    await assertFails(setDoc(sessionDoc("u-viewer", "s-x"), SESSION));
  });
});

describe("GS-075 separation of duties", () => {
  it("refuses a collector counting their own cash", async () => {
    // The collector holds sessions.write but not reconciliation.count.
    await assertFails(setDoc(reconDoc(COLLECTOR, "s-1"), reconciliation()));
  });

  it("refuses even an approver signing off cash they collected themselves", async () => {
    // The treasurer has every reconciliation permission — but this
    // reconciliation names them as the collector, so the rule refuses it. This
    // is the guard that makes point 9 real rather than advisory.
    await assertFails(
      setDoc(reconDoc(TREASURER, "s-2"), reconciliation({ collectorId: TREASURER }))
    );
  });

  it("lets a treasurer count someone else's cash", async () => {
    await assertSucceeds(setDoc(reconDoc(TREASURER, "s-1"), reconciliation()));
  });

  it("leaves that count unapproved, awaiting a second person", async () => {
    await assertSucceeds(setDoc(reconDoc(TREASURER, "s-4"), reconciliation({ sessionId: "s-4" })));
  });

  it("refuses an admin approving their own collection too", async () => {
    // Admin holds every permission, and still cannot self-approve.
    await assertFails(
      setDoc(reconDoc(ADMIN, "s-3"), reconciliation({ collectorId: ADMIN, countedBy: ADMIN }))
    );
  });
});

describe("GS-075 two-person flow", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "pandals", PANDAL, "festivals", FESTIVAL, "reconciliations", "s-1"),
        reconciliation({ countedCash: 4500, difference: -500, reason: "short" })
      );
    });
  });

  const APPROVAL = {
    status: "mismatch",
    approvedBy: APPROVER,
    approvedByName: "Second Treasurer",
    locked: true,
    updatedBy: APPROVER,
  };

  it("refuses the counter approving their own count", () => 
    assertFails(updateDoc(reconDoc(TREASURER, "s-1"), { ...APPROVAL, approvedBy: TREASURER })));

  it("refuses the collector approving it", () =>
    assertFails(updateDoc(reconDoc(COLLECTOR, "s-1"), { ...APPROVAL, approvedBy: COLLECTOR })));

  it("lets a genuine second person approve", () =>
    assertSucceeds(updateDoc(reconDoc(APPROVER, "s-1"), APPROVAL)));

  it("refuses an approver silently changing the counted figure", async () => {
    // Signing off must not become re-counting.
    await assertFails(
      updateDoc(reconDoc(APPROVER, "s-1"), { ...APPROVAL, countedCash: 5000 })
    );
  });

  it("refuses an approval that does not lock", async () => {
    await assertFails(updateDoc(reconDoc(APPROVER, "s-1"), { ...APPROVAL, locked: false }));
  });

  it("refuses creating a count that is already approved", async () => {
    // Otherwise one person could write a locked, signed-off reconciliation and
    // skip the second person entirely.
    await assertFails(
      setDoc(
        reconDoc(TREASURER, "s-9"),
        reconciliation({ sessionId: "s-9", status: "matched", locked: true, approvedBy: TREASURER })
      )
    );
  });

  it("lets a different counter re-count before anyone has approved", async () => {
    await assertSucceeds(
      updateDoc(reconDoc(APPROVER, "s-1"), {
        countedCash: 5000,
        difference: 0,
        countedBy: APPROVER,
        updatedBy: APPROVER,
      })
    );
  });
});

describe("GS-075 point 10 - approved reconciliations are immutable", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "pandals", PANDAL, "festivals", FESTIVAL, "reconciliations", "s-1"),
        reconciliation({
          status: "mismatch",
          countedCash: 4500,
          difference: -500,
          reason: "short",
          approvedBy: APPROVER,
          locked: true,
        })
      );
    });
  });

  it("refuses changing the counted amount after approval", () =>
    assertFails(updateDoc(reconDoc(TREASURER, "s-1"), { countedCash: 5000 })));

  it("refuses changing the expected amount after approval", () =>
    assertFails(updateDoc(reconDoc(ADMIN, "s-1"), { expectedCash: 4500 })));

  it("refuses quietly flipping a mismatch to matched", () =>
    // The discrepancy must stay visible. Only mismatch -> resolved is allowed.
    assertFails(updateDoc(reconDoc(TREASURER, "s-1"), { status: "matched" })));

  it("allows exactly the mismatch -> resolved transition", () =>
    assertSucceeds(
      updateDoc(reconDoc(TREASURER, "s-1"), { status: "resolved", updatedBy: TREASURER })
    ));

  it("refuses that transition from someone without resolve authority", () =>
    assertFails(
      updateDoc(reconDoc(COLLECTOR, "s-1"), { status: "resolved", updatedBy: COLLECTOR })
    ));
});

describe("GS-075 point 8 - adjustments are append-only evidence", () => {
  const ADJUSTMENT = {
    reconciliationId: "s-1",
    sessionId: "s-1",
    // Magnitude, with `direction` carrying the sense — the rules refuse a
    // negative money field (GS-004).
    amount: 500,
    reason: "Short by 500, written off with committee approval",
    approvedBy: TREASURER,
    date: "2026-09-05",
    paymentMethod: "cash",
    direction: "out",
    purposeType: "adjustment",
    purposeCategory: "reconciliation_discrepancy",
    createdBy: TREASURER,
    updatedBy: TREASURER,
  };

  it("lets an authorized member record one", async () => {
    await assertSucceeds(setDoc(adjustmentDoc(TREASURER, "adj-1"), ADJUSTMENT));
  });

  it("refuses a collector recording one", async () => {
    await assertFails(setDoc(adjustmentDoc(COLLECTOR, "adj-2"), ADJUSTMENT));
  });

  it("refuses editing one afterwards, by anybody", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "pandals", PANDAL, "festivals", FESTIVAL, "cashAdjustments", "adj-3"),
        ADJUSTMENT
      );
    });
    await assertFails(updateDoc(adjustmentDoc(TREASURER, "adj-3"), { amount: 0 }));
    await assertFails(updateDoc(adjustmentDoc(ADMIN, "adj-3"), { reason: "changed my mind" }));
  });
});

describe("GS-078 money purpose is a controlled enum", () => {
  const SESSION_WITH_PURPOSE = {
    ...SESSION,
    purposeType: "cash_handover",
    purposeCategory: "collector_to_treasurer",
    direction: "transfer",
  };

  it("accepts the purpose the app stamps on a handover", () =>
    assertSucceeds(setDoc(sessionDoc(COLLECTOR, "s-p1"), SESSION_WITH_PURPOSE)));

  it("refuses a purposeType outside the enum", () =>
    assertFails(
      setDoc(sessionDoc(COLLECTOR, "s-p2"), {
        ...SESSION_WITH_PURPOSE,
        purposeType: "shopping",
      })
    ));

  it("refuses a purposeCategory outside the enum", () =>
    // Otherwise a client could invent a category and land its spending outside
    // every report grouping.
    assertFails(
      setDoc(sessionDoc(COLLECTOR, "s-p3"), {
        ...SESSION_WITH_PURPOSE,
        purposeCategory: "chai_and_samosa",
      })
    ));

  it("still accepts a record with no purpose at all", () =>
    // Rows written before GS-078 have none, and refusing them would make
    // existing data uneditable.
    assertSucceeds(setDoc(sessionDoc(COLLECTOR, "s-p4"), SESSION)));

  it("refuses a bad purpose on a collection too", async () => {
    await assertFails(
      setDoc(
        doc(as(COLLECTOR), "pandals", PANDAL, "festivals", FESTIVAL, "collections", "c-bad"),
        {
          donorName: "Ramesh",
          amount: 500,
          paymentMethod: "cash",
          collectorId: COLLECTOR,
          date: "2026-09-05",
          ledgerType: "COLLECTION",
          purposeType: "collection",
          purposeCategory: "not_a_real_category",
          createdBy: COLLECTOR,
          updatedBy: COLLECTOR,
        }
      )
    );
  });
});
