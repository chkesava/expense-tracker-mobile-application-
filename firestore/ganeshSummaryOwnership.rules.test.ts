import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, describe, it } from "vitest";

/**
 * The festival summary belongs to the server now (GS-004).
 *
 * GS-004's remaining acceptance criterion — a per-subcollection field allowlist
 * in the rules — was measured to be unbuildable: the festival-subcollection
 * wildcard is already at Firestore's 1000-expression ceiling, and an allowlist
 * covering only four of the thirteen subcollections pushed a legitimate expense
 * create over it. So the derived totals moved to a trusted Firestore trigger
 * (`functions/src/summary.ts`) instead, and these rules now only have to refuse
 * the client rather than validate a payload it can no longer send.
 *
 * The client keeps exactly two summary fields: `nextReceiptNumber` and
 * `nextContributionNumber`, the monotonic allocators that are handed out in a
 * client transaction and cannot be recomputed from the ledger (GS-077).
 *
 * These tests cover the five properties the change has to hold:
 *   1. authorized users can still perform legitimate writes
 *   2. clients cannot forge derived summary values
 *   3. unauthorized pandal/festival writes fail
 *   4. malformed values fail
 *   5. trusted server-side summary updates succeed
 */

const PROJECT_ID = "ganesh-summary-ownership";
const PANDAL = "pandal-1";
const OTHER_PANDAL = "pandal-2";
const FESTIVAL = "festival-1";
const PORT = Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080);

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: PORT,
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

/** Everything the derived half of a summary holds, as the trigger writes it. */
const DERIVED_SUMMARY = {
  openingFunds: 0,
  chanda: 5000,
  committeeContributions: 0,
  otherCashContributions: 0,
  godFundExpenses: 0,
  reimbursements: 0,
  personalMoneyUsed: 0,
  pendingReimbursements: 0,
  inKindValue: 0,
  sponsoredValue: 0,
  promisedCashContributions: 0,
  promisedInKindValue: 0,
  collectionCount: 1,
  expenseCount: 0,
  assetPurchaseAmount: 0,
  sponsoredExpenseAmount: 0,
  transferredToPermanentFund: 0,
  receivedFromPermanentFund: 0,
  cash: 5000,
  upi: 0,
  bank: 0,
  other: 0,
};

/**
 * @param permissions omit for the legacy member shape (no `permissions` field),
 *   which sends the permission helpers down their expensive fallback path — the
 *   writers with the least budget headroom.
 */
async function seed(uid: string, role: string, permissions?: string[]) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const pandalId of [PANDAL, OTHER_PANDAL]) {
      await setDoc(doc(db, "pandals", pandalId), {
        name: "Test Pandal",
        code: `GNSH-${pandalId}`,
        ownerId: "u-owner",
        memberIds: pandalId === PANDAL ? [uid] : [],
        adminCount: 1,
        createdBy: "u-owner",
        updatedBy: "u-owner",
      });
      await setDoc(doc(db, "pandals", pandalId, "festivals", FESTIVAL), {
        name: "Ganesh Utsav Test",
        year: 2026,
        status: "open",
        createdBy: "u-owner",
        updatedBy: "u-owner",
      });
    }
    // The member belongs to PANDAL only. OTHER_PANDAL is the tenant next door.
    await setDoc(doc(db, "pandals", PANDAL, "members", uid), {
      userId: uid,
      displayName: "Member",
      role,
      status: "active",
      ...(permissions ? { permissions } : {}),
    });
    // The summary as the trigger leaves it: derived fields present, allocators
    // at their current values.
    await setDoc(doc(db, "pandals", PANDAL, "festivals", FESTIVAL, "summary", "totals"), {
      ...DERIVED_SUMMARY,
      nextReceiptNumber: 12,
      nextContributionNumber: 4,
      summaryDerivedAt: new Date(),
    });
  });
}

function summaryRef(uid: string, pandalId = PANDAL) {
  return doc(
    env.authenticatedContext(uid).firestore(),
    "pandals",
    pandalId,
    "festivals",
    FESTIVAL,
    "summary",
    "totals"
  );
}

function ledgerRef(uid: string, id: string, pandalId = PANDAL) {
  return doc(
    env.authenticatedContext(uid).firestore(),
    "pandals",
    pandalId,
    "festivals",
    FESTIVAL,
    "collections",
    id
  );
}

const HONEST_COLLECTION = {
  donorName: "Ramesh",
  amount: 500,
  paymentMethod: "cash",
  collectorId: "u-1",
  date: "2026-09-05",
  ledgerType: "COLLECTION",
  createdBy: "u-1",
  updatedBy: "u-1",
};

describe("1. authorized users can perform legitimate writes", () => {
  it("a collector records a collection", async () => {
    await seed("u-1", "collector", ["collections.create"]);
    await assertSucceeds(setDoc(ledgerRef("u-1", "c-1"), HONEST_COLLECTION));
  });

  it("a legacy collector — the tightest budget path — records a collection", async () => {
    await seed("u-1", "collector");
    await assertSucceeds(setDoc(ledgerRef("u-1", "c-2"), HONEST_COLLECTION));
  });

  it("a receipt number is still allocated by the client", async () => {
    // The allocators cannot be derived from the ledger, so they stay with the
    // transaction that hands them out. This is the one summary write a client
    // still makes.
    await seed("u-1", "collector", ["collections.create"]);
    await assertSucceeds(setDoc(summaryRef("u-1"), { nextReceiptNumber: 13 }, { merge: true }));
  });

  it("and so is a contribution number", async () => {
    await seed("u-1", "treasurer", ["contributions.create"]);
    await assertSucceeds(
      setDoc(summaryRef("u-1"), { nextContributionNumber: 5 }, { merge: true })
    );
  });

  it("a legacy treasurer can allocate too", async () => {
    await seed("u-1", "treasurer");
    await assertSucceeds(setDoc(summaryRef("u-1"), { nextReceiptNumber: 13 }, { merge: true }));
  });
});

describe("2. clients cannot forge derived summary values", () => {
  it("refuses a plausible wrong total — the gap GS-004 was left with", async () => {
    // This is the whole point. Under the old rules this write succeeded: the
    // value was well-shaped, and no rule could tell it from an honest one.
    await seed("u-1", "treasurer", ["collections.create"]);
    await assertFails(setDoc(summaryRef("u-1"), { chanda: 9999999 }, { merge: true }));
  });

  it("refuses an inflated God Fund balance, which would unblock spending", async () => {
    await seed("u-1", "treasurer", ["collections.create"]);
    await assertFails(setDoc(summaryRef("u-1"), { godFundExpenses: 0, cash: 500000 }, { merge: true }));
  });

  it("refuses a derived field even when smuggled beside a legitimate allocator bump", async () => {
    await seed("u-1", "collector", ["collections.create"]);
    await assertFails(
      setDoc(summaryRef("u-1"), { nextReceiptNumber: 13, chanda: 9999999 }, { merge: true })
    );
  });

  it("refuses to rewrite the trigger's own freshness stamp", async () => {
    // Moving this forward would make the trigger skip real rebuilds.
    await seed("u-1", "treasurer", ["collections.create"]);
    await assertFails(
      setDoc(summaryRef("u-1"), { summaryDerivedAt: new Date(9999, 0, 1) }, { merge: true })
    );
  });

  it("refuses an allocator that moves backwards", async () => {
    // Rewinding hands the same receipt number to a second donor.
    await seed("u-1", "collector", ["collections.create"]);
    await assertFails(setDoc(summaryRef("u-1"), { nextReceiptNumber: 3 }, { merge: true }));
  });

  it("refuses a stray field that is neither derived nor an allocator", async () => {
    await seed("u-1", "treasurer", ["collections.create"]);
    await assertFails(setDoc(summaryRef("u-1"), { notASummaryField: true }, { merge: true }));
  });

  it("still refuses a member with no money permission at all", async () => {
    await seed("u-1", "viewer", []);
    await assertFails(setDoc(summaryRef("u-1"), { nextReceiptNumber: 13 }, { merge: true }));
  });
});

describe("3. unauthorized pandal/festival writes fail", () => {
  it("a member of one pandal cannot touch another pandal's summary", async () => {
    await seed("u-1", "treasurer", ["collections.create"]);
    await assertFails(
      setDoc(summaryRef("u-1", OTHER_PANDAL), { nextReceiptNumber: 13 }, { merge: true })
    );
  });

  it("nor write to another pandal's ledger", async () => {
    await seed("u-1", "collector", ["collections.create"]);
    await assertFails(setDoc(ledgerRef("u-1", "c-3", OTHER_PANDAL), HONEST_COLLECTION));
  });

  it("a signed-in non-member cannot write the summary", async () => {
    await seed("u-1", "treasurer", ["collections.create"]);
    await assertFails(setDoc(summaryRef("stranger"), { nextReceiptNumber: 13 }, { merge: true }));
  });

  it("a closed festival refuses the allocator too, so a settled year stays settled", async () => {
    await seed("u-1", "treasurer", ["collections.create"]);
    await env.withSecurityRulesDisabled(async (context) => {
      await updateDoc(
        doc(context.firestore(), "pandals", PANDAL, "festivals", FESTIVAL),
        { status: "closed" }
      );
    });
    await assertFails(setDoc(summaryRef("u-1"), { nextReceiptNumber: 13 }, { merge: true }));
  });
});

describe("4. malformed values fail", () => {
  it("a non-numeric allocator", async () => {
    await seed("u-1", "collector", ["collections.create"]);
    await assertFails(
      setDoc(summaryRef("u-1"), { nextReceiptNumber: "thirteen" }, { merge: true })
    );
  });

  it("an overflow-shaped allocator", async () => {
    await seed("u-1", "collector", ["collections.create"]);
    await assertFails(setDoc(summaryRef("u-1"), { nextReceiptNumber: 1e300 }, { merge: true }));
  });

  it("a negative collection amount", async () => {
    await seed("u-1", "collector", ["collections.create"]);
    await assertFails(
      setDoc(ledgerRef("u-1", "c-4"), { ...HONEST_COLLECTION, amount: -50000 })
    );
  });

  it("a non-numeric collection amount", async () => {
    await seed("u-1", "collector", ["collections.create"]);
    await assertFails(setDoc(ledgerRef("u-1", "c-5"), { ...HONEST_COLLECTION, amount: "x" }));
  });

  it("a malformed date", async () => {
    await seed("u-1", "collector", ["collections.create"]);
    await assertFails(
      setDoc(ledgerRef("u-1", "c-6"), { ...HONEST_COLLECTION, date: "9999-99-99" })
    );
  });
});

describe("5. trusted server-side summary updates succeed", () => {
  /**
   * The trigger runs on admin credentials and bypasses rules entirely, which is
   * what `withSecurityRulesDisabled` models here. These assert the shape of what
   * it writes is not blocked by anything else, and — the part worth pinning —
   * that its write does not disturb the allocators the client owns.
   */
  it("the backend writes every derived field", async () => {
    await seed("u-1", "collector", ["collections.create"]);
    await env.withSecurityRulesDisabled(async (context) => {
      await assertSucceeds(
        setDoc(
          doc(context.firestore(), "pandals", PANDAL, "festivals", FESTIVAL, "summary", "totals"),
          { ...DERIVED_SUMMARY, chanda: 5500, summaryDerivedAt: new Date() },
          { merge: true }
        )
      );
    });
  });

  it("the backend can write a summary on a closed festival", async () => {
    // A settlement recompute has to work after the books close; the client
    // restriction above is deliberately not the backend's restriction.
    await seed("u-1", "treasurer", ["collections.create"]);
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await updateDoc(doc(db, "pandals", PANDAL, "festivals", FESTIVAL), { status: "closed" });
      await assertSucceeds(
        setDoc(
          doc(db, "pandals", PANDAL, "festivals", FESTIVAL, "summary", "totals"),
          { ...DERIVED_SUMMARY, summaryDerivedAt: new Date() },
          { merge: true }
        )
      );
    });
  });

  it("a client allocator bump survives alongside the backend's derived write", async () => {
    await seed("u-1", "collector", ["collections.create"]);
    await assertSucceeds(setDoc(summaryRef("u-1"), { nextReceiptNumber: 13 }, { merge: true }));
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "pandals", PANDAL, "festivals", FESTIVAL, "summary", "totals"),
        { ...DERIVED_SUMMARY, chanda: 5500, summaryDerivedAt: new Date() },
        { merge: true }
      );
    });
    // And the client can still allocate the next one afterwards.
    await assertSucceeds(setDoc(summaryRef("u-1"), { nextReceiptNumber: 14 }, { merge: true }));
  });
});
