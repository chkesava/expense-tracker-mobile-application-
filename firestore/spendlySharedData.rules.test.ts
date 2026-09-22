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
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * SPENDLY-9 — inverted 21-case Spendly audit probe (2026-09-12).
 *
 * The audit proved these writes against the live rules engine. After the
 * SEC-01…SEC-05 fixes they must stay denied. Dedicated suites already cover
 * each surface in more detail; this file is the single regression checklist
 * named in the audit (Section N / `spendlySharedData.rules.test.ts`).
 */

const PROJECT_ID = "spendly-audit-probe";
const OWNER = "u-owner";
const MEMBER = "u-member";
const ATTACKER = "u-attacker";
const VICTIM = "u-victim";
const PAY_SLUG = "payme12345";
const SHARE_SLUG = "splithr123";

const splitSeed = {
  title: "Dinner",
  totalAmount: 1000,
  splitType: "equal",
  createdBy: OWNER,
  participantIds: [OWNER, MEMBER],
  participants: [
    { name: "Org", amount: 500, paid: false, isCurrentUser: true, userId: OWNER },
    { name: "Debtor", amount: 500, paid: false, isCurrentUser: false, userId: MEMBER },
  ],
  settled: false,
};

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
    await setDoc(doc(db, "system_settings", "global"), { v: 1 });
    await setDoc(doc(db, "system_settings", "latest_release"), { v: 1 });
    await setDoc(doc(db, "users", OWNER), { email: "owner@example.com" });
    await setDoc(doc(db, "users", OWNER, "expenses", "e1"), {
      amount: 10,
      date: "2026-09-17",
    });
    await setDoc(doc(db, "vaults", "v1"), {
      name: "House",
      budget: 10000,
      ownerId: OWNER,
      memberIds: [OWNER, MEMBER],
    });
    await setDoc(doc(db, "vaults", "v1", "expenses", "ve1"), {
      amount: 500,
      type: "withdrawal",
      createdBy: OWNER,
    });
    await setDoc(doc(db, "splits", "s1"), splitSeed);
    await setDoc(doc(db, "paymentRequests", PAY_SLUG), {
      slug: PAY_SLUG,
      createdBy: OWNER,
      payeeName: "Org",
      upiId: "org@okaxis",
      amount: 450,
    });
    await setDoc(doc(db, "splitPublicShares", SHARE_SLUG), {
      slug: SHARE_SLUG,
      createdBy: OWNER,
      title: "Dinner",
      totalAmount: 1000,
    });
  });
});

describe("SEC-01 system_settings/global is not client-writable", () => {
  it("signed-in cannot write the kill switch", async () => {
    const db = env.authenticatedContext(ATTACKER).firestore();
    await assertFails(
      setDoc(
        doc(db, "system_settings", "global"),
        { maintenanceMode: true, disableSignups: true },
        { merge: true }
      )
    );
  });

  it("signed-out cannot write global", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(db, "system_settings", "global"), { defaultCurrency: "ZWL" })
    );
  });

  it("signed-in cannot write a release pointer", async () => {
    const db = env.authenticatedContext(ATTACKER).firestore();
    await assertFails(
      setDoc(doc(db, "system_settings", "latest_release"), { url: "evil" })
    );
  });
});

describe("SEC-02 users/{uid}.role is not self-assignable", () => {
  it("owner cannot merge SUPER_ADMIN onto their user doc", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(
      setDoc(doc(db, "users", OWNER), { role: "SUPER_ADMIN" }, { merge: true })
    );
  });
});

describe("SEC-03 vault membership is not a write primitive", () => {
  it("member cannot delete the vault", async () => {
    const db = env.authenticatedContext(MEMBER).firestore();
    await assertFails(deleteDoc(doc(db, "vaults", "v1")));
  });

  it("member cannot overwrite the owner's expense", async () => {
    const db = env.authenticatedContext(MEMBER).firestore();
    await assertFails(
      setDoc(doc(db, "vaults", "v1", "expenses", "ve1"), {
        amount: -999999,
        type: "withdrawal",
        createdBy: MEMBER,
      })
    );
  });

  it("cannot create a vault naming a stranger as a member", async () => {
    const db = env.authenticatedContext(ATTACKER).firestore();
    await assertFails(
      setDoc(doc(db, "vaults", "vx"), {
        name: "Spam",
        ownerId: ATTACKER,
        memberIds: [ATTACKER, VICTIM],
      })
    );
  });

  it("member cannot create a negative vault expense", async () => {
    const db = env.authenticatedContext(MEMBER).firestore();
    await assertFails(
      setDoc(doc(db, "vaults", "v1", "expenses", "ve-neg"), {
        amount: -999999,
        type: "withdrawal",
        createdBy: MEMBER,
      })
    );
  });
});

describe("SEC-04 a split participant is not a writer", () => {
  it("participant cannot mark the split settled or zero the total", async () => {
    const db = env.authenticatedContext(MEMBER).firestore();
    await assertFails(
      updateDoc(doc(db, "splits", "s1"), { settled: true, totalAmount: 0 })
    );
  });

  it("participant cannot delete the split", async () => {
    const db = env.authenticatedContext(MEMBER).firestore();
    await assertFails(deleteDoc(doc(db, "splits", "s1")));
  });

  it("participant cannot rewrite participants to erase their debt", async () => {
    const db = env.authenticatedContext(MEMBER).firestore();
    await assertFails(
      updateDoc(doc(db, "splits", "s1"), {
        participants: [
          {
            name: "Debtor",
            amount: 0,
            paid: true,
            isCurrentUser: true,
            userId: MEMBER,
          },
        ],
      })
    );
  });
});

describe("SEC-05 public payment/split docs are get-by-slug, not enumerable", () => {
  it("anonymous client can get a payment request by slug", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, "paymentRequests", PAY_SLUG)));
  });

  it("anonymous client cannot list paymentRequests", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDocs(collection(db, "paymentRequests")));
  });

  it("creator cannot reassign paymentRequest createdBy", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(
      updateDoc(doc(db, "paymentRequests", PAY_SLUG), { createdBy: VICTIM })
    );
  });

  it("anonymous client can get a split share by slug", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, "splitPublicShares", SHARE_SLUG)));
  });

  it("anonymous client cannot list splitPublicShares", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDocs(collection(db, "splitPublicShares")));
  });

  it("creator cannot reassign splitPublicShare createdBy", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(
      updateDoc(doc(db, "splitPublicShares", SHARE_SLUG), { createdBy: VICTIM })
    );
  });
});

describe("SEC-06 personal money rows reject negative amounts", () => {
  it("owner cannot write a negative expense amount", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(
      addDoc(collection(db, "users", OWNER, "expenses"), {
        amount: -1e12,
        date: "2026-09-17",
      })
    );
  });

  it("owner cannot write a negative accountEntries amount", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(
      addDoc(collection(db, "users", OWNER, "accountEntries"), {
        amount: -1,
        date: "2026-09-17",
      })
    );
  });

  it("owner cannot write a negative amountPaid on a credit-card bill", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(
      addDoc(collection(db, "users", OWNER, "creditCardBills"), {
        statementAmount: 12000,
        amountPaid: -1,
        remainingAmount: 12000,
        dueDate: "2026-10-05",
      })
    );
  });

  it("a stranger cannot list the owner's expenses", async () => {
    const db = env.authenticatedContext(ATTACKER).firestore();
    await assertFails(getDocs(collection(db, "users", OWNER, "expenses")));
  });

  it("owner cannot mint an unknown personal collection", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(
      setDoc(doc(db, "users", OWNER, "zzzAnything", "x"), { blob: "nope" })
    );
  });
});
