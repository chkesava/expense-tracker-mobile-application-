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
 * Prasadam register authorization, enforced by the rules engine (KAN-126).
 *
 * Two guarantees are worth proving at this level rather than in the service,
 * because anyone can call Firestore directly with the same credentials:
 *
 * 1. **An entry can never carry money.** That is what makes "prasadam cannot be
 *    double-counted" a property of the database rather than a convention.
 * 2. **Cancellation is terminal, and gated separately from editing.** An edit
 *    must never be able to become a cancellation that skipped the narrower
 *    permission, and a cancelled entry must never come back to life.
 *
 * Run with `npm run test:rules`.
 */

const PROJECT_ID = "ganesh-prasadam-rules";
const PANDAL = "pandal-1";
const FESTIVAL = "festival-1";

const ADMIN = "u-admin";
const TREASURER = "u-treasurer";
/** Holds prasadam.write but NOT prasadam.cancel — the counter volunteer. */
const RECORDER = "u-recorder";
/** Holds prasadam.read only. */
const READER = "u-reader";
/** An active member with no prasadam keys at all — the PII case. */
const VIEWER = "u-viewer";
const OUTSIDER = "u-outsider";

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
      memberIds: [ADMIN, TREASURER, RECORDER, READER, VIEWER],
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
    // Denormalized permissions, matching PRASADAM_ROLE_DEFAULTS.
    await setDoc(doc(db, "pandals", PANDAL, "members", TREASURER), {
      userId: TREASURER,
      displayName: "Treasurer",
      role: "treasurer",
      status: "active",
      permissions: ["prasadam.read", "prasadam.write", "prasadam.cancel"],
    });
    await setDoc(doc(db, "pandals", PANDAL, "members", RECORDER), {
      userId: RECORDER,
      displayName: "Recorder",
      role: "member",
      status: "active",
      permissions: ["prasadam.read", "prasadam.write"],
    });
    await setDoc(doc(db, "pandals", PANDAL, "members", READER), {
      userId: READER,
      displayName: "Reader",
      role: "member",
      status: "active",
      permissions: ["prasadam.read"],
    });
    await setDoc(doc(db, "pandals", PANDAL, "members", VIEWER), {
      userId: VIEWER,
      displayName: "Viewer",
      role: "viewer",
      status: "active",
      permissions: ["festival.read"],
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

function entryDoc(uid: string, id: string) {
  return doc(as(uid), "pandals", PANDAL, "festivals", FESTIVAL, "prasadamEntries", id);
}

/** The exact payload `createPrasadamEntry` writes. Kept in step deliberately. */
function entryPayload(uid: string, over: Record<string, unknown> = {}) {
  return {
    date: "2026-09-16",
    session: "morning",
    providerName: "Ravi",
    prasadamType: "sweet",
    prasadamLabel: "Laddu",
    quantity: 500,
    unit: "pieces",
    status: "recorded",
    voided: false,
    clientOpId: "op-1",
    createdBy: uid,
    updatedBy: uid,
    ...over,
  };
}

async function seedEntry(id: string, over: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(
        context.firestore(),
        "pandals",
        PANDAL,
        "festivals",
        FESTIVAL,
        "prasadamEntries",
        id
      ),
      entryPayload(RECORDER, over)
    );
  });
}

describe("recording", () => {
  it("lets a counter volunteer with prasadam.write record an entry", async () => {
    await assertSucceeds(setDoc(entryDoc(RECORDER, "e1"), entryPayload(RECORDER)));
  });

  it("lets the treasurer record one", async () => {
    await assertSucceeds(setDoc(entryDoc(TREASURER, "e1"), entryPayload(TREASURER)));
  });

  it("refuses a member holding only prasadam.read", async () => {
    await assertFails(setDoc(entryDoc(READER, "e1"), entryPayload(READER)));
  });

  it("refuses a viewer and an outsider", async () => {
    await assertFails(setDoc(entryDoc(VIEWER, "e1"), entryPayload(VIEWER)));
    await assertFails(setDoc(entryDoc(OUTSIDER, "e1"), entryPayload(OUTSIDER)));
  });

  it("keeps two providers in the same session as two documents", async () => {
    // The ticket's headline requirement, at the rules level: neither write
    // touches the other's document, so neither can overwrite it.
    await assertSucceeds(
      setDoc(entryDoc(RECORDER, "e1"), entryPayload(RECORDER, { providerName: "A" }))
    );
    await assertSucceeds(
      setDoc(entryDoc(RECORDER, "e2"), entryPayload(RECORDER, { providerName: "B" }))
    );
  });
});

describe("an entry can never carry money", () => {
  // The double-count guarantee. It holds against every role, admin included,
  // because it is a property of the payload rather than of the caller.
  const moneyKeys = [
    "amount",
    "totalAmount",
    "godFundAmount",
    "personalAmount",
    "sponsoredAmount",
    "estimatedValue",
    "ledgerType",
    "purposeType",
    "purposeCategory",
  ];

  for (const key of moneyKeys) {
    it(`refuses an entry carrying ${key}`, async () => {
      await assertFails(
        setDoc(entryDoc(RECORDER, "e1"), entryPayload(RECORDER, { [key]: 500 }))
      );
    });
  }

  it("refuses it for the admin too", async () => {
    await assertFails(
      setDoc(entryDoc(ADMIN, "e1"), entryPayload(ADMIN, { estimatedValue: 500 }))
    );
  });

  it("refuses adding money on an edit, not just on create", async () => {
    await seedEntry("e1");
    await assertFails(
      updateDoc(entryDoc(RECORDER, "e1"), { amount: 100, updatedBy: RECORDER })
    );
  });
});

describe("payload shape", () => {
  it("refuses an entry born cancelled", async () => {
    await assertFails(
      setDoc(entryDoc(RECORDER, "e1"), entryPayload(RECORDER, { status: "cancelled" }))
    );
  });

  it("refuses a bad session", async () => {
    await assertFails(
      setDoc(entryDoc(RECORDER, "e1"), entryPayload(RECORDER, { session: "midday" }))
    );
  });

  it("refuses an impossible or malformed date", async () => {
    await assertFails(
      setDoc(entryDoc(RECORDER, "e1"), entryPayload(RECORDER, { date: "banana" }))
    );
    await assertFails(
      setDoc(entryDoc(RECORDER, "e1"), entryPayload(RECORDER, { date: "2026-99-99" }))
    );
  });

  it("refuses a missing, zero, negative or absurd quantity", async () => {
    await assertFails(
      setDoc(entryDoc(RECORDER, "e1"), entryPayload(RECORDER, { quantity: 0 }))
    );
    await assertFails(
      setDoc(entryDoc(RECORDER, "e1"), entryPayload(RECORDER, { quantity: -5 }))
    );
    await assertFails(
      setDoc(entryDoc(RECORDER, "e1"), entryPayload(RECORDER, { quantity: 1e300 }))
    );
    await assertFails(
      setDoc(entryDoc(RECORDER, "e1"), entryPayload(RECORDER, { quantity: "many" }))
    );
  });

  it("refuses an empty or oversized provider name", async () => {
    await assertFails(
      setDoc(entryDoc(RECORDER, "e1"), entryPayload(RECORDER, { providerName: "" }))
    );
    await assertFails(
      setDoc(
        entryDoc(RECORDER, "e1"),
        entryPayload(RECORDER, { providerName: "x".repeat(81) })
      )
    );
  });

  it("refuses an unknown unit or type", async () => {
    await assertFails(
      setDoc(entryDoc(RECORDER, "e1"), entryPayload(RECORDER, { unit: "furlongs" }))
    );
    await assertFails(
      setDoc(entryDoc(RECORDER, "e1"), entryPayload(RECORDER, { prasadamType: "nectar" }))
    );
  });
});

describe("editing", () => {
  it("lets a writer correct the provider, item and quantity", async () => {
    await seedEntry("e1");
    await assertSucceeds(
      updateDoc(entryDoc(RECORDER, "e1"), {
        providerName: "Ravi Kumar",
        prasadamLabel: "Pulihora",
        quantity: 6,
        unit: "kg",
        updatedBy: RECORDER,
      })
    );
  });

  it("refuses moving an entry to another day or session", async () => {
    // Relocating one is a cancel and a fresh record, so a day's counts stay
    // reconcilable against its own history.
    await seedEntry("e1");
    await assertFails(
      updateDoc(entryDoc(RECORDER, "e1"), { date: "2026-09-17", updatedBy: RECORDER })
    );
    await assertFails(
      updateDoc(entryDoc(RECORDER, "e1"), { session: "evening", updatedBy: RECORDER })
    );
  });

  it("refuses an edit that also flips status", async () => {
    // Otherwise an edit becomes a cancellation that skipped prasadam.cancel.
    await seedEntry("e1");
    await assertFails(
      updateDoc(entryDoc(RECORDER, "e1"), {
        quantity: 9,
        status: "cancelled",
        updatedBy: RECORDER,
      })
    );
  });

  it("refuses a reader editing", async () => {
    await seedEntry("e1");
    await assertFails(
      updateDoc(entryDoc(READER, "e1"), { quantity: 9, updatedBy: READER })
    );
  });
});

describe("cancelling", () => {
  /** The exact payload `cancelPrasadamEntry` writes. */
  const cancelPayload = (uid: string) => ({
    status: "cancelled",
    cancelReason: "Recorded twice by mistake",
    voided: true,
    voidReason: "Recorded twice by mistake",
    voidedBy: uid,
    updatedBy: uid,
  });

  it("lets the treasurer cancel", async () => {
    await seedEntry("e1");
    await assertSucceeds(updateDoc(entryDoc(TREASURER, "e1"), cancelPayload(TREASURER)));
  });

  it("refuses a writer who does not hold prasadam.cancel", async () => {
    await seedEntry("e1");
    await assertFails(updateDoc(entryDoc(RECORDER, "e1"), cancelPayload(RECORDER)));
  });

  it("refuses a cancel that also rewrites the quantity", async () => {
    await seedEntry("e1");
    await assertFails(
      updateDoc(entryDoc(TREASURER, "e1"), { ...cancelPayload(TREASURER), quantity: 1 })
    );
  });

  it("makes cancellation terminal: no re-cancel, no edit, no restore", async () => {
    await seedEntry("e1", { status: "cancelled", voided: true });
    await assertFails(updateDoc(entryDoc(TREASURER, "e1"), cancelPayload(TREASURER)));
    await assertFails(
      updateDoc(entryDoc(RECORDER, "e1"), { quantity: 3, updatedBy: RECORDER })
    );
    await assertFails(
      updateDoc(entryDoc(TREASURER, "e1"), {
        status: "recorded",
        voided: false,
        updatedBy: TREASURER,
      })
    );
  });
});

describe("reading", () => {
  it("lets anyone holding prasadam.read see an entry", async () => {
    await seedEntry("e1");
    await assertSucceeds(
      getDoc(entryDoc(READER, "e1"))
    );
  });

  it("refuses a viewer — the register is donor PII (GS-073)", async () => {
    await seedEntry("e1");
    await assertFails(
      getDoc(entryDoc(VIEWER, "e1"))
    );
  });

  it("refuses an outsider", async () => {
    await seedEntry("e1");
    await assertFails(
      getDoc(entryDoc(OUTSIDER, "e1"))
    );
  });
});

describe("deletion and festival state", () => {
  it("refuses deletion for everyone, admin included", async () => {
    await seedEntry("e1");
    await assertFails(deleteDoc(entryDoc(ADMIN, "e1")));
    await assertFails(deleteDoc(entryDoc(TREASURER, "e1")));
  });

  it("refuses writes once the festival is closed", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "pandals", PANDAL, "festivals", FESTIVAL),
        { name: "Ganesh Utsav Test", year: 2026, status: "closed", createdBy: ADMIN, updatedBy: ADMIN }
      );
    });
    await assertFails(setDoc(entryDoc(RECORDER, "e9"), entryPayload(RECORDER)));
  });

  it("refuses writes once the pandal is archived", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "pandals", PANDAL), { archived: true });
    });
    await assertFails(setDoc(entryDoc(RECORDER, "e9"), entryPayload(RECORDER)));
  });
});
