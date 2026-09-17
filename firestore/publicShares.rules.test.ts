import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

/**
 * SPENDLY-36 — public payment/split docs are get-by-slug, not enumerable.
 *
 * Anonymous list used to dump names + UPI. createdBy was reassignable, so a
 * request could be planted in a victim's Collect list.
 */

const PROJECT_ID = "spendly-public-slug";
const CREATOR = "u-creator";
const VICTIM = "u-victim";
const SLUG = "payme12345";
const SHARE_SLUG = "splithr123";

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
    await setDoc(doc(db, "paymentRequests", SLUG), {
      slug: SLUG,
      createdBy: CREATOR,
      payeeName: "Org",
      upiId: "org@okaxis",
      amount: 450,
      createdAt: 1,
      status: "active",
    });
    await setDoc(doc(db, "splitPublicShares", SHARE_SLUG), {
      slug: SHARE_SLUG,
      createdBy: CREATOR,
      title: "Dinner",
      totalAmount: 1000,
    });
  });
});

describe("paymentRequests", () => {
  it("anonymous client can get by slug", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, "paymentRequests", SLUG)));
  });

  it("anonymous client cannot list the collection", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDocs(collection(db, "paymentRequests")));
  });

  it("anonymous client cannot query by slug", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(
      getDocs(
        query(collection(db, "paymentRequests"), where("slug", "==", SLUG))
      )
    );
  });

  it("creator can list their own payment requests", async () => {
    const db = env.authenticatedContext(CREATOR).firestore();
    await assertSucceeds(
      getDocs(
        query(
          collection(db, "paymentRequests"),
          where("createdBy", "==", CREATOR)
        )
      )
    );
  });

  it("signed-in user cannot list someone else's payment requests", async () => {
    const db = env.authenticatedContext(VICTIM).firestore();
    await assertFails(
      getDocs(
        query(
          collection(db, "paymentRequests"),
          where("createdBy", "==", CREATOR)
        )
      )
    );
  });

  it("creator cannot reassign createdBy", async () => {
    const db = env.authenticatedContext(CREATOR).firestore();
    await assertFails(
      updateDoc(doc(db, "paymentRequests", SLUG), { createdBy: VICTIM })
    );
  });

  it("creator can update amount without touching createdBy", async () => {
    const db = env.authenticatedContext(CREATOR).firestore();
    await assertSucceeds(
      updateDoc(doc(db, "paymentRequests", SLUG), { amount: 200 })
    );
  });

  it("signed-in user can create a request whose id is the slug", async () => {
    const db = env.authenticatedContext(CREATOR).firestore();
    await assertSucceeds(
      setDoc(doc(db, "paymentRequests", "newslug123"), {
        slug: "newslug123",
        createdBy: CREATOR,
        amount: 10,
      })
    );
  });

  it("cannot create a request under an auto-id that is not the slug", async () => {
    const db = env.authenticatedContext(CREATOR).firestore();
    await assertFails(
      setDoc(doc(collection(db, "paymentRequests")), {
        slug: "mismatch01",
        createdBy: CREATOR,
        amount: 10,
      })
    );
  });
});

describe("splitPublicShares", () => {
  it("anonymous client can get by slug", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, "splitPublicShares", SHARE_SLUG)));
  });

  it("anonymous client cannot list the collection", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDocs(collection(db, "splitPublicShares")));
  });

  it("creator cannot reassign createdBy", async () => {
    const db = env.authenticatedContext(CREATOR).firestore();
    await assertFails(
      updateDoc(doc(db, "splitPublicShares", SHARE_SLUG), {
        createdBy: VICTIM,
      })
    );
  });

  it("creator can update the snapshot without touching createdBy", async () => {
    const db = env.authenticatedContext(CREATOR).firestore();
    await assertSucceeds(
      updateDoc(doc(db, "splitPublicShares", SHARE_SLUG), { title: "Brunch" })
    );
  });

  it("cannot create a share under an auto-id that is not the slug", async () => {
    const db = env.authenticatedContext(CREATOR).firestore();
    await assertFails(
      setDoc(doc(collection(db, "splitPublicShares")), {
        slug: "mismatch02",
        createdBy: CREATOR,
        title: "Taxi",
      })
    );
  });
});
