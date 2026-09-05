import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * KAN-9 foundation attack cases against the real rules engine.
 *
 * Not the full KAN-23 matrix. These prove the authorization foundation:
 * unauthenticated deny, inactive membership, cross-pandal isolation,
 * self-escalation, membership-index forgery, and festival-parent existence.
 */

const PROJECT_ID = "ganesh-foundation-kan9";
const PANDAL = "pandal-1";
const OTHER_PANDAL = "pandal-2";
const FESTIVAL = "festival-1";
const OTHER_FESTIVAL = "festival-2";

const ADMIN = "u-admin";
const MEMBER = "u-member";
const SUSPENDED = "u-suspended";
const REMOVED = "u-removed";
const OTHER_ADMIN = "u-other-admin";
const OTHER_MEMBER = "u-other-member";

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
    await setDoc(doc(db, "pandals", PANDAL), {
      name: "Test Pandal",
      code: "GNSH-TEST",
      ownerId: ADMIN,
      memberIds: [ADMIN, MEMBER, SUSPENDED, REMOVED],
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
    await setDoc(doc(db, "pandals", PANDAL, "members", MEMBER), {
      userId: MEMBER,
      displayName: "Member",
      role: "member",
      status: "active",
    });
    await setDoc(doc(db, "pandals", PANDAL, "members", SUSPENDED), {
      userId: SUSPENDED,
      displayName: "Suspended",
      role: "member",
      status: "suspended",
    });
    await setDoc(doc(db, "pandals", PANDAL, "members", REMOVED), {
      userId: REMOVED,
      displayName: "Removed",
      role: "member",
      status: "removed",
    });
    await setDoc(doc(db, "pandals", PANDAL, "festivals", FESTIVAL), {
      name: "Ganesh Utsav Test",
      year: 2026,
      status: "open",
      createdBy: ADMIN,
      updatedBy: ADMIN,
    });

    await setDoc(doc(db, "pandals", OTHER_PANDAL), {
      name: "Other Pandal",
      code: "GNSH-OTHR",
      ownerId: OTHER_ADMIN,
      memberIds: [OTHER_ADMIN, OTHER_MEMBER],
      adminCount: 1,
      createdBy: OTHER_ADMIN,
      updatedBy: OTHER_ADMIN,
    });
    await setDoc(doc(db, "pandals", OTHER_PANDAL, "members", OTHER_ADMIN), {
      userId: OTHER_ADMIN,
      displayName: "Other Admin",
      role: "admin",
      status: "active",
    });
    await setDoc(doc(db, "pandals", OTHER_PANDAL, "members", OTHER_MEMBER), {
      userId: OTHER_MEMBER,
      displayName: "Other Member",
      role: "member",
      status: "active",
    });
    await setDoc(doc(db, "pandals", OTHER_PANDAL, "festivals", OTHER_FESTIVAL), {
      name: "Other Festival",
      year: 2026,
      status: "open",
      createdBy: OTHER_ADMIN,
      updatedBy: OTHER_ADMIN,
    });
  });
});

function as(uid: string) {
  return env.authenticatedContext(uid).firestore();
}

function honestCollection(overrides: Record<string, unknown> = {}) {
  return {
    donorName: "Ramesh",
    amount: 500,
    paymentMethod: "cash",
    collectorId: MEMBER,
    date: "2026-09-04",
    ledgerType: "COLLECTION",
    createdBy: MEMBER,
    updatedBy: MEMBER,
    ...overrides,
  };
}

describe("KAN-9 unauthenticated and inactive membership", () => {
  it("denies unauthenticated reads of pandal, festival, and members", async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, "pandals", PANDAL)));
    await assertFails(getDoc(doc(anon, "pandals", PANDAL, "festivals", FESTIVAL)));
    await assertFails(getDoc(doc(anon, "pandals", PANDAL, "members", ADMIN)));
  });

  it("denies a suspended member protected pandal reads and writes", async () => {
    const db = as(SUSPENDED);
    await assertFails(getDoc(doc(db, "pandals", PANDAL)));
    await assertFails(getDoc(doc(db, "pandals", PANDAL, "festivals", FESTIVAL)));
    await assertFails(
      setDoc(
        doc(db, "pandals", PANDAL, "festivals", FESTIVAL, "collections", "c-sus"),
        honestCollection({ createdBy: SUSPENDED, updatedBy: SUSPENDED, collectorId: SUSPENDED })
      )
    );
  });

  it("denies a removed member protected pandal reads and writes", async () => {
    const db = as(REMOVED);
    await assertFails(getDoc(doc(db, "pandals", PANDAL)));
    await assertFails(
      setDoc(
        doc(db, "pandals", PANDAL, "festivals", FESTIVAL, "collections", "c-rem"),
        honestCollection({ createdBy: REMOVED, updatedBy: REMOVED, collectorId: REMOVED })
      )
    );
  });
});

describe("KAN-9 cross-pandal isolation", () => {
  it("does not let a member of A read or write B", async () => {
    const db = as(MEMBER);
    await assertFails(getDoc(doc(db, "pandals", OTHER_PANDAL)));
    await assertFails(getDoc(doc(db, "pandals", OTHER_PANDAL, "festivals", OTHER_FESTIVAL)));
    await assertFails(
      setDoc(
        doc(db, "pandals", OTHER_PANDAL, "festivals", OTHER_FESTIVAL, "collections", "c-x"),
        honestCollection()
      )
    );
  });
});

describe("KAN-9 self-role escalation", () => {
  it("does not let a member promote themselves to admin", async () => {
    const db = as(MEMBER);
    await assertFails(
      updateDoc(doc(db, "pandals", PANDAL, "members", MEMBER), {
        role: "admin",
        status: "active",
        userId: MEMBER,
      })
    );
  });
});

describe("KAN-9 membership index trusted fields", () => {
  it("lets an owner stamp an index that matches the live member document", async () => {
    const db = as(MEMBER);
    await assertSucceeds(
      setDoc(doc(db, "users", MEMBER, "pandalMemberships", PANDAL), {
        pandalId: PANDAL,
        role: "member",
        status: "active",
      })
    );
  });

  it("refuses an owner writing role admin when the member doc is member", async () => {
    const db = as(MEMBER);
    await assertFails(
      setDoc(doc(db, "users", MEMBER, "pandalMemberships", PANDAL), {
        pandalId: PANDAL,
        role: "admin",
        status: "active",
      })
    );
  });

  it("refuses a forged pandalId on the membership index", async () => {
    const db = as(MEMBER);
    await assertFails(
      setDoc(doc(db, "users", MEMBER, "pandalMemberships", PANDAL), {
        pandalId: OTHER_PANDAL,
        role: "member",
        status: "active",
      })
    );
  });
});

describe("KAN-9 festival parent validation", () => {
  it("refuses festivalYears that name a festival that does not exist", async () => {
    const db = as(ADMIN);
    await assertFails(
      setDoc(doc(db, "pandals", PANDAL, "festivalYears", "2026"), {
        festivalId: "does-not-exist",
        year: 2026,
      })
    );
  });

  it("lets an admin create festivalYears for an existing festival", async () => {
    const db = as(ADMIN);
    await assertSucceeds(
      setDoc(doc(db, "pandals", PANDAL, "festivalYears", "2026"), {
        festivalId: FESTIVAL,
        year: 2026,
      })
    );
  });

  it("refuses a collection write whose festivalId disagrees with the path", async () => {
    const db = as(MEMBER);
    await assertFails(
      setDoc(
        doc(db, "pandals", PANDAL, "festivals", FESTIVAL, "collections", "c-forge"),
        honestCollection({ festivalId: OTHER_FESTIVAL })
      )
    );
  });
});
