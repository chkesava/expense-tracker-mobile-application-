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
 * SPENDLY-31 — vault membership is not a write primitive.
 *
 * Members used to delete the vault, rewrite others' expenses, and anyone
 * could create a vault naming a stranger. These cases pin the new grants.
 */

const PROJECT_ID = "spendly-vaults";
const OWNER = "u-owner";
const MEMBER = "u-member";
const ATTACKER = "u-attacker";
const VICTIM = "u-victim";

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
    await setDoc(doc(db, "vaults", "v1", "expenses", "ve-member"), {
      amount: 200,
      type: "deposit",
      createdBy: MEMBER,
    });
  });
});

describe("vault document", () => {
  it("owner can read the vault", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(getDoc(doc(db, "vaults", "v1")));
  });

  it("member can read the vault", async () => {
    const db = env.authenticatedContext(MEMBER).firestore();
    await assertSucceeds(getDoc(doc(db, "vaults", "v1")));
  });

  it("stranger cannot read the vault", async () => {
    const db = env.authenticatedContext(ATTACKER).firestore();
    await assertFails(getDoc(doc(db, "vaults", "v1")));
  });

  it("member cannot delete the vault", async () => {
    const db = env.authenticatedContext(MEMBER).firestore();
    await assertFails(deleteDoc(doc(db, "vaults", "v1")));
  });

  it("owner can delete the vault", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(deleteDoc(doc(db, "vaults", "v1")));
  });

  it("member cannot rename the vault or set a negative budget", async () => {
    const db = env.authenticatedContext(MEMBER).firestore();
    await assertFails(
      updateDoc(doc(db, "vaults", "v1"), { name: "hacked", budget: -1 })
    );
  });

  it("owner can update name without touching membership", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(updateDoc(doc(db, "vaults", "v1"), { name: "House 2" }));
  });

  it("owner cannot add a stranger via memberIds", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(
      updateDoc(doc(db, "vaults", "v1"), { memberIds: [OWNER, MEMBER, VICTIM] })
    );
  });

  it("owner cannot reassign ownerId", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(updateDoc(doc(db, "vaults", "v1"), { ownerId: MEMBER }));
  });

  it("signed-in user can create a vault that only contains themselves", async () => {
    const db = env.authenticatedContext(ATTACKER).firestore();
    await assertSucceeds(
      setDoc(doc(db, "vaults", "vx-self"), {
        ownerId: ATTACKER,
        memberIds: [ATTACKER],
        name: "Mine",
        budget: 1,
      })
    );
  });

  it("cannot create a vault naming a stranger as a member", async () => {
    const db = env.authenticatedContext(ATTACKER).firestore();
    await assertFails(
      setDoc(doc(db, "vaults", "vx"), {
        ownerId: ATTACKER,
        memberIds: [ATTACKER, VICTIM],
        name: "spam",
        budget: 1,
      })
    );
  });

  it("cannot create a vault as someone else's ownerId", async () => {
    const db = env.authenticatedContext(ATTACKER).firestore();
    await assertFails(
      setDoc(doc(db, "vaults", "vx-steal"), {
        ownerId: VICTIM,
        memberIds: [VICTIM],
        name: "stolen",
        budget: 1,
      })
    );
  });
});

describe("vault expenses", () => {
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

  it("member cannot delete the owner's expense", async () => {
    const db = env.authenticatedContext(MEMBER).firestore();
    await assertFails(deleteDoc(doc(db, "vaults", "v1", "expenses", "ve1")));
  });

  it("member can create their own positive expense", async () => {
    const db = env.authenticatedContext(MEMBER).firestore();
    await assertSucceeds(
      setDoc(doc(db, "vaults", "v1", "expenses", "ve-new"), {
        amount: 40,
        type: "deposit",
        createdBy: MEMBER,
      })
    );
  });

  it("member cannot create a negative amount", async () => {
    const db = env.authenticatedContext(MEMBER).firestore();
    await assertFails(
      setDoc(doc(db, "vaults", "v1", "expenses", "ve-neg"), {
        amount: -999999,
        type: "withdrawal",
        createdBy: MEMBER,
      })
    );
  });

  it("member cannot create an expense as someone else", async () => {
    const db = env.authenticatedContext(MEMBER).firestore();
    await assertFails(
      setDoc(doc(db, "vaults", "v1", "expenses", "ve-forge"), {
        amount: 10,
        type: "deposit",
        createdBy: OWNER,
      })
    );
  });

  it("member can delete their own expense", async () => {
    const db = env.authenticatedContext(MEMBER).firestore();
    await assertSucceeds(deleteDoc(doc(db, "vaults", "v1", "expenses", "ve-member")));
  });

  it("owner can delete a member's expense", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(deleteDoc(doc(db, "vaults", "v1", "expenses", "ve-member")));
  });

  it("stranger cannot write a vault expense", async () => {
    const db = env.authenticatedContext(ATTACKER).firestore();
    await assertFails(
      setDoc(doc(db, "vaults", "v1", "expenses", "ve-spam"), {
        amount: 10,
        type: "deposit",
        createdBy: ATTACKER,
      })
    );
  });
});
