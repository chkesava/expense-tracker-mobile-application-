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

/**
 * KAN-125 added five subcollections to this same wildcard. Each one is
 * short-circuited ahead of `canWriteFestivalSubcol()` and `payloadWellFormed()`
 * for the reason this file documents — but a short-circuit only helps if it is
 * actually reached, so these pin that a real Token Laddu write still evaluates
 * inside the ceiling.
 *
 * A budget overrun and an authorization refusal are both `PERMISSION_DENIED`
 * and indistinguishable to a client, so the assertion that carries the weight
 * is the one that *succeeds*: if the branch blew the budget, it would fail.
 */
describe("KAN-125 token laddu writes stay inside the evaluation budget", () => {
  function tokenRef(uid: string, code: string) {
    return doc(
      env.authenticatedContext(uid).firestore(),
      "pandals",
      PANDAL,
      "festivals",
      FESTIVAL,
      "tokenLadduTokens",
      code
    );
  }

  function configRef(uid: string) {
    return doc(
      env.authenticatedContext(uid).firestore(),
      "pandals",
      PANDAL,
      "festivals",
      FESTIVAL,
      "tokenLadduConfig",
      "current"
    );
  }

  const TOKEN = {
    tokenNumber: 1,
    status: "eligible",
    registrationId: "reg-1",
    participantName: "Anjali",
    receiptNumberPhysical: "A-101",
    date: "2026-09-05",
    amount: 100,
    paymentMethod: "cash",
    createdBy: "u-1",
    updatedBy: "u-1",
  };

  it("a treasurer carrying the full permission set can write a token", async () => {
    // The widest realistic array, because a longer `permissions` list is the
    // expensive direction for `hasPermOf`.
    await seed("u-1", "treasurer", [
      "collections.create",
      "expenses.create",
      "contributions.create",
      "contributions.receive",
      "sessions.write",
      "reconciliation.approve",
      "tokens.read",
      "tokens.write",
      "tokens.config",
      "draw.run",
    ]);
    await assertSucceeds(setDoc(tokenRef("u-1", "TKN26-000001"), TOKEN));
  });

  it("and can write the config document that carries the allocator", async () => {
    await seed("u-1", "treasurer", ["tokens.read", "tokens.write", "tokens.config"]);
    await assertSucceeds(
      setDoc(configRef("u-1"), {
        totalTokens: 500,
        amountPerToken: 100,
        nextTokenNumber: 0,
        registeredCount: 0,
        cancelledCount: 0,
        createdBy: "u-1",
        updatedBy: "u-1",
      })
    );
  });

  it("refuses a legacy member, and by authorization rather than by accident", async () => {
    // The token rules have no legacy role fallback on purpose: these keys did
    // not exist when the old member documents were written, so the hydration in
    // `ensurePandalRoles` is what grants them. The point of this case is that a
    // legacy treasurer is refused while a permissioned one above succeeds —
    // which is only meaningful because that success proves the budget holds.
    await seed("u-1", "treasurer");
    await assertFails(setDoc(tokenRef("u-1", "TKN26-000002"), TOKEN));
  });
});
