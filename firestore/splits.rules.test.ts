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
 * SPENDLY-32 — a split participant is not a writer.
 *
 * Debtors used to settle, zero the total, rewrite participants[], or delete
 * the split. Only the organizer may write; friends read and file claims.
 */

const PROJECT_ID = "spendly-splits";
const CREATOR = "u-creator";
const MEMBER = "u-member";
const ATTACKER = "u-attacker";

const splitSeed = {
  title: "Dinner",
  totalAmount: 1000,
  splitType: "equal",
  createdBy: CREATOR,
  participantIds: [CREATOR, MEMBER],
  participants: [
    {
      name: "Org",
      amount: 500,
      paid: false,
      isCurrentUser: true,
      userId: CREATOR,
    },
    {
      name: "Debtor",
      amount: 500,
      paid: false,
      isCurrentUser: false,
      userId: MEMBER,
    },
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
    await setDoc(doc(db, "splits", "s1"), splitSeed);
  });
});

describe("split document", () => {
  it("organizer can read the split", async () => {
    const db = env.authenticatedContext(CREATOR).firestore();
    await assertSucceeds(getDoc(doc(db, "splits", "s1")));
  });

  it("participant can read the split", async () => {
    const db = env.authenticatedContext(MEMBER).firestore();
    await assertSucceeds(getDoc(doc(db, "splits", "s1")));
  });

  it("stranger cannot read the split", async () => {
    const db = env.authenticatedContext(ATTACKER).firestore();
    await assertFails(getDoc(doc(db, "splits", "s1")));
  });

  it("participant cannot delete the split", async () => {
    const db = env.authenticatedContext(MEMBER).firestore();
    await assertFails(deleteDoc(doc(db, "splits", "s1")));
  });

  it("organizer can delete the split", async () => {
    const db = env.authenticatedContext(CREATOR).firestore();
    await assertSucceeds(deleteDoc(doc(db, "splits", "s1")));
  });

  it("participant cannot mark the split settled or zero the total", async () => {
    const db = env.authenticatedContext(MEMBER).firestore();
    await assertFails(
      updateDoc(doc(db, "splits", "s1"), { settled: true, totalAmount: 0 })
    );
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

  it("participant cannot change participantIds", async () => {
    const db = env.authenticatedContext(MEMBER).firestore();
    await assertFails(
      updateDoc(doc(db, "splits", "s1"), { participantIds: [MEMBER] })
    );
  });

  it("organizer can rename and settle without changing createdBy", async () => {
    const db = env.authenticatedContext(CREATOR).firestore();
    await assertSucceeds(
      updateDoc(doc(db, "splits", "s1"), {
        title: "Dinner 2",
        settled: true,
      })
    );
  });

  it("organizer can add a person via participantIds", async () => {
    const db = env.authenticatedContext(CREATOR).firestore();
    await assertSucceeds(
      updateDoc(doc(db, "splits", "s1"), {
        participantIds: [CREATOR, MEMBER, ATTACKER],
      })
    );
  });

  it("organizer cannot set a negative totalAmount", async () => {
    const db = env.authenticatedContext(CREATOR).firestore();
    await assertFails(updateDoc(doc(db, "splits", "s1"), { totalAmount: -1 }));
  });

  it("organizer cannot reassign createdBy", async () => {
    const db = env.authenticatedContext(CREATOR).firestore();
    await assertFails(updateDoc(doc(db, "splits", "s1"), { createdBy: MEMBER }));
  });

  it("signed-in user can create a split they own", async () => {
    const db = env.authenticatedContext(ATTACKER).firestore();
    await assertSucceeds(
      setDoc(doc(db, "splits", "sx-self"), {
        title: "Taxi",
        totalAmount: 200,
        createdBy: ATTACKER,
        participantIds: [ATTACKER],
        settled: false,
      })
    );
  });

  it("cannot create a split under someone else's createdBy", async () => {
    const db = env.authenticatedContext(ATTACKER).firestore();
    await assertFails(
      setDoc(doc(db, "splits", "sx-stolen"), {
        title: "Taxi",
        totalAmount: 200,
        createdBy: CREATOR,
        participantIds: [CREATOR],
        settled: false,
      })
    );
  });

  it("cannot create a split with a negative totalAmount", async () => {
    const db = env.authenticatedContext(ATTACKER).firestore();
    await assertFails(
      setDoc(doc(db, "splits", "sx-neg"), {
        title: "Taxi",
        totalAmount: -50,
        createdBy: ATTACKER,
        participantIds: [ATTACKER],
        settled: false,
      })
    );
  });
});
