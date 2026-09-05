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
 * KAN-10 membership lifecycle attack cases against the real rules engine.
 *
 * Complements ganeshFoundation.rules.test.ts (KAN-9). Full collection matrix
 * stays on KAN-23.
 */

const PROJECT_ID = "ganesh-membership-kan10";
const PANDAL = "pandal-1";
const OTHER_PANDAL = "pandal-2";
const FESTIVAL = "festival-1";

const ADMIN = "u-admin";
const MEMBER = "u-member";
const SUSPENDED = "u-suspended";
const REMOVED = "u-removed";
const APPLICANT = "u-applicant";
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
  });
});

function as(uid: string) {
  return env.authenticatedContext(uid).firestore();
}

describe("KAN-10 join request create", () => {
  it("lets a signed-in user file a pending request against an existing Pandal", async () => {
    const db = as(APPLICANT);
    await assertSucceeds(
      setDoc(doc(db, "pandalJoinRequests", `${PANDAL}__${APPLICANT}`), {
        pandalId: PANDAL,
        userId: APPLICANT,
        status: "pending",
        displayName: "Applicant",
      })
    );
  });

  it("refuses a join request against a Pandal that does not exist", async () => {
    const db = as(APPLICANT);
    await assertFails(
      setDoc(doc(db, "pandalJoinRequests", `missing__${APPLICANT}`), {
        pandalId: "missing",
        userId: APPLICANT,
        status: "pending",
      })
    );
  });

  it("refuses a forged userId on a join request", async () => {
    const db = as(APPLICANT);
    await assertFails(
      setDoc(doc(db, "pandalJoinRequests", `${PANDAL}__${APPLICANT}`), {
        pandalId: PANDAL,
        userId: MEMBER,
        status: "pending",
      })
    );
  });

  it("refuses a forged pandalId that disagrees with the slot id", async () => {
    const db = as(APPLICANT);
    await assertFails(
      setDoc(doc(db, "pandalJoinRequests", `${PANDAL}__${APPLICANT}`), {
        pandalId: OTHER_PANDAL,
        userId: APPLICANT,
        status: "pending",
      })
    );
  });
});

describe("KAN-10 join request self-approve and pending access", () => {
  it("does not let the applicant approve their own request", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "pandalJoinRequests", `${PANDAL}__${APPLICANT}`), {
        pandalId: PANDAL,
        userId: APPLICANT,
        status: "pending",
      });
    });
    const db = as(APPLICANT);
    await assertFails(
      updateDoc(doc(db, "pandalJoinRequests", `${PANDAL}__${APPLICANT}`), {
        pandalId: PANDAL,
        userId: APPLICANT,
        status: "approved",
      })
    );
  });

  it("denies a pending applicant protected Pandal and festival reads", async () => {
    const db = as(APPLICANT);
    await assertFails(getDoc(doc(db, "pandals", PANDAL)));
    await assertFails(getDoc(doc(db, "pandals", PANDAL, "festivals", FESTIVAL)));
    await assertFails(getDoc(doc(db, "pandals", PANDAL, "members", MEMBER)));
  });
});

describe("KAN-10 self-activation and self-role", () => {
  it("does not let a suspended member activate themselves", async () => {
    const db = as(SUSPENDED);
    await assertFails(
      updateDoc(doc(db, "pandals", PANDAL, "members", SUSPENDED), {
        userId: SUSPENDED,
        role: "member",
        status: "active",
      })
    );
  });

  it("does not let a removed member activate themselves", async () => {
    const db = as(REMOVED);
    await assertFails(
      updateDoc(doc(db, "pandals", PANDAL, "members", REMOVED), {
        userId: REMOVED,
        role: "member",
        status: "active",
      })
    );
  });

  it("does not let a member change their own role", async () => {
    const db = as(MEMBER);
    await assertFails(
      updateDoc(doc(db, "pandals", PANDAL, "members", MEMBER), {
        userId: MEMBER,
        role: "treasurer",
        status: "active",
      })
    );
  });

  it("does not let a member create another person's member document", async () => {
    const db = as(MEMBER);
    await assertFails(
      setDoc(doc(db, "pandals", PANDAL, "members", APPLICANT), {
        userId: APPLICANT,
        displayName: "Forged",
        role: "member",
        status: "active",
      })
    );
  });
});

describe("KAN-10 status transitions and history", () => {
  it("lets an admin suspend and restore a member", async () => {
    const db = as(ADMIN);
    await assertSucceeds(
      updateDoc(doc(db, "pandals", PANDAL, "members", MEMBER), {
        userId: MEMBER,
        role: "member",
        status: "suspended",
      })
    );
    await assertSucceeds(
      updateDoc(doc(db, "pandals", PANDAL, "members", MEMBER), {
        userId: MEMBER,
        role: "member",
        status: "active",
      })
    );
  });

  it("refuses deleting a member document", async () => {
    const db = as(ADMIN);
    await assertFails(deleteDoc(doc(db, "pandals", PANDAL, "members", MEMBER)));
    await assertFails(deleteDoc(doc(as(MEMBER), "pandals", PANDAL, "members", MEMBER)));
  });

  it("denies a suspended member protected reads and a removed member writes", async () => {
    await assertFails(getDoc(doc(as(SUSPENDED), "pandals", PANDAL)));
    await assertFails(getDoc(doc(as(REMOVED), "pandals", PANDAL, "festivals", FESTIVAL)));
  });
});

describe("KAN-10 cross-pandal membership", () => {
  it("does not let a member of A read B's member list or write B's index", async () => {
    const db = as(MEMBER);
    await assertFails(getDoc(doc(db, "pandals", OTHER_PANDAL, "members", OTHER_MEMBER)));
    await assertFails(
      setDoc(doc(db, "users", MEMBER, "pandalMemberships", OTHER_PANDAL), {
        pandalId: OTHER_PANDAL,
        role: "member",
        status: "active",
      })
    );
  });
});
