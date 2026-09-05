import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, describe, it } from "vitest";

/**
 * The festival-subcollection rule's evaluation budget (GS-004).
 *
 * The summary writes below allocate a receipt number rather than bumping a
 * total. That is the only summary write a client still makes: GS-004 moved the
 * derived totals to a trusted trigger, because the measurement this file exists
 * to make came back saying the field allowlist could not fit. The budget
 * question is unchanged — a legacy member takes the expensive permission path,
 * and this pins that the path still evaluates inside the ceiling.
 *
 * Firestore caps a single rule evaluation at 1000 expressions. The emulator
 * reports overruns as `PERMISSION_DENIED: Unable to evaluate the expression as
 * the maximum of 1000 expressions to evaluate has been reached`, which is
 * indistinguishable to a client from a genuine authorization failure.
 *
 * This file exists to pin down *which* writers are near that ceiling, because
 * the answer decides whether GS-004's remaining work — a per-subcollection
 * field allowlist, which can only add expressions — is implementable as a
 * rules-only change at all.
 *
 * The variable under test is the member document: `hasPermOf` takes a cheap
 * path when the member carries a denormalized `permissions` array and an
 * expensive role-and-role-document fallback when it does not (the legacy
 * shape). Production has both kinds of member.
 */

const PROJECT_ID = "ganesh-summary-budget";
const PANDAL = "pandal-1";
const FESTIVAL = "festival-1";

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

/**
 * @param permissions omit for the legacy member shape (no `permissions` field),
 *   which sends `hasPermOf` down its fallback path.
 */
async function seed(uid: string, role: string, permissions?: string[]) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "pandals", PANDAL), {
      name: "Test Pandal",
      code: "GNSH-TEST",
      ownerId: "u-owner",
      memberIds: [uid],
      adminCount: 1,
      createdBy: "u-owner",
      updatedBy: "u-owner",
    });
    await setDoc(doc(db, "pandals", PANDAL, "members", uid), {
      userId: uid,
      displayName: "Member",
      role,
      status: "active",
      ...(permissions ? { permissions } : {}),
    });
    await setDoc(doc(db, "pandals", PANDAL, "festivals", FESTIVAL), {
      name: "Ganesh Utsav Test",
      year: 2026,
      status: "open",
      createdBy: "u-owner",
      updatedBy: "u-owner",
    });
  });
}

function summaryRef(uid: string) {
  return doc(
    env.authenticatedContext(uid).firestore(),
    "pandals",
    PANDAL,
    "festivals",
    FESTIVAL,
    "summary",
    "totals"
  );
}

function ledgerRef(uid: string, id: string) {
  return doc(
    env.authenticatedContext(uid).firestore(),
    "pandals",
    PANDAL,
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
  date: "2026-09-04",
  ledgerType: "COLLECTION",
  createdBy: "u-1",
  updatedBy: "u-1",
};

describe("summary writes with a denormalized permissions array", () => {
  it("a treasurer carrying `permissions` can allocate a receipt number", async () => {
    await seed("u-1", "treasurer", [
      "collections.create",
      "expenses.create",
      "contributions.create",
      "contributions.receive",
    ]);
    await assertSucceeds(setDoc(summaryRef("u-1"), { nextReceiptNumber: 1 }, { merge: true }));
  });

  it("and can write the ledger document alongside it", async () => {
    await seed("u-1", "treasurer", ["collections.create"]);
    await assertSucceeds(setDoc(ledgerRef("u-1", "c-1"), HONEST_COLLECTION));
  });
});

describe("summary writes on the legacy member shape (no permissions field)", () => {
  it("a legacy treasurer can still write the ledger document", async () => {
    await seed("u-1", "treasurer");
    await assertSucceeds(setDoc(ledgerRef("u-1", "c-2"), HONEST_COLLECTION));
  });

  it("can write the summary - the regression this file was written to catch", async () => {
    // Before the summary short-circuit this was refused, and not by an
    // authorization decision: the rule ran out of its 1000-expression
    // allowance part-way through and Firestore returned PERMISSION_DENIED.
    // The summary used to be written in the same batch as the ledger row, and
    // batches are atomic, so a legacy treasurer could not record money at all -
    // while the identical write from a member carrying a `permissions` array
    // went through. The totals have since moved to the trigger, but the receipt
    // allocator still travels with the ledger write, so the budget still
    // matters here.
    await seed("u-1", "treasurer");
    await assertSucceeds(setDoc(summaryRef("u-1"), { nextReceiptNumber: 1 }, { merge: true }));
  });

  it("and so can a legacy collector, the cheapest-permission writer", async () => {
    await seed("u-1", "collector");
    await assertSucceeds(setDoc(summaryRef("u-1"), { nextReceiptNumber: 1 }, { merge: true }));
  });

  it("a legacy admin was never affected - admin short-circuits cheaply", async () => {
    // Recorded because it explains why this went unnoticed: an owner-admin
    // testing the app sees every money flow work.
    await seed("u-1", "admin");
    await assertSucceeds(setDoc(summaryRef("u-1"), { nextReceiptNumber: 1 }, { merge: true }));
  });

  it("still refuses a member with no money permission at all", async () => {
    // The short-circuit must not have turned the summary into a free-for-all.
    await seed("u-1", "viewer", []);
    await assertFails(setDoc(summaryRef("u-1"), { nextReceiptNumber: 1 }, { merge: true }));
  });

  it("still refuses a summary field outside the allowlist", async () => {
    await seed("u-1", "treasurer", ["collections.create"]);
    await assertFails(
      setDoc(summaryRef("u-1"), { nextReceiptNumber: 1, notASummaryField: true }, { merge: true })
    );
  });

  it("and refuses a derived total, which is the trigger's to write now", async () => {
    await seed("u-1", "treasurer", ["collections.create"]);
    await assertFails(setDoc(summaryRef("u-1"), { chanda: 1000 }, { merge: true }));
  });
});
