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
 * Token Laddu authorization, enforced by the rules engine (KAN-125).
 *
 * The thing worth proving here is the draw. A draw result is announced in front
 * of a crowd and can never be quietly re-rolled, so the guarantee cannot be "the
 * app does not offer that button" — anyone can call Firestore directly with the
 * same credentials. These tests run the real rules file, so what they prove is
 * what the server will actually refuse.
 *
 * Run with `npm run test:rules`.
 */

const PROJECT_ID = "ganesh-token-laddu-rules";
const PANDAL = "pandal-1";
const FESTIVAL = "festival-1";

const ADMIN = "u-admin";
const TREASURER = "u-treasurer";
/** Holds tokens.write but not tokens.config or draw.run. */
const SELLER = "u-seller";
const MEMBER = "u-member";
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
      memberIds: [ADMIN, TREASURER, SELLER, MEMBER, VIEWER],
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
    // Denormalized permissions, matching TOKEN_LADDU_ROLE_DEFAULTS.
    await setDoc(doc(db, "pandals", PANDAL, "members", TREASURER), {
      userId: TREASURER,
      displayName: "Treasurer",
      role: "treasurer",
      status: "active",
      permissions: ["tokens.read", "tokens.write", "tokens.config", "draw.run"],
    });
    await setDoc(doc(db, "pandals", PANDAL, "members", SELLER), {
      userId: SELLER,
      displayName: "Seller",
      role: "member",
      status: "active",
      permissions: ["tokens.read", "tokens.write"],
    });
    await setDoc(doc(db, "pandals", PANDAL, "members", MEMBER), {
      userId: MEMBER,
      displayName: "Member",
      role: "member",
      status: "active",
      permissions: ["tokens.read"],
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

function configDoc(uid: string) {
  return doc(as(uid), "pandals", PANDAL, "festivals", FESTIVAL, "tokenLadduConfig", "current");
}

function tokenDoc(uid: string, code: string) {
  return doc(as(uid), "pandals", PANDAL, "festivals", FESTIVAL, "tokenLadduTokens", code);
}

function registrationDoc(uid: string, id: string) {
  return doc(
    as(uid),
    "pandals",
    PANDAL,
    "festivals",
    FESTIVAL,
    "tokenLadduRegistrations",
    id
  );
}

function drawSessionDoc(uid: string, id: string) {
  return doc(as(uid), "pandals", PANDAL, "festivals", FESTIVAL, "tokenDrawSessions", id);
}

function drawResultDoc(uid: string, id: string) {
  return doc(as(uid), "pandals", PANDAL, "festivals", FESTIVAL, "tokenDrawResults", id);
}

const CONFIG = {
  totalTokens: 500,
  amountPerToken: 100,
  nextTokenNumber: 0,
  registeredCount: 0,
  cancelledCount: 0,
  createdBy: TREASURER,
  updatedBy: TREASURER,
};

const TOKEN = {
  tokenNumber: 1,
  status: "eligible",
  registrationId: "reg-1",
  participantName: "Anjali",
  mobile: "9000000000",
  receiptNumberPhysical: "A-101",
  date: "2026-09-05",
  amount: 100,
  paymentMethod: "cash",
  createdBy: SELLER,
  updatedBy: SELLER,
};

const REGISTRATION = {
  participantName: "Anjali",
  mobile: "9000000000",
  quantity: 1,
  amount: 100,
  paymentMethod: "cash",
  receiptNumberPhysical: "A-101",
  collectionId: "col-1",
  collectorId: SELLER,
  date: "2026-09-05",
  tokenNumbers: [1],
  createdBy: SELLER,
  updatedBy: SELLER,
};

const DRAW_SESSION = {
  status: "open",
  startedBy: TREASURER,
  configuredTokens: 500,
  plannedDraws: 500,
  completedDraws: 0,
  createdBy: TREASURER,
  updatedBy: TREASURER,
};

async function seed(path: "tokenLadduTokens" | "tokenDrawResults" | "tokenDrawSessions" | "tokenLadduConfig" | "tokenLadduRegistrations", id: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), "pandals", PANDAL, "festivals", FESTIVAL, path, id),
      data
    );
  });
}

describe("KAN-125 token laddu rules - configuration", () => {
  it("lets a treasurer set capacity and refuses a plain member", async () => {
    await assertSucceeds(setDoc(configDoc(TREASURER), CONFIG));
    await assertFails(setDoc(configDoc(MEMBER), CONFIG));
  });

  it("lets a token seller bump the allocator, because registration must", async () => {
    await seed("tokenLadduConfig", "current", CONFIG);
    await assertSucceeds(
      updateDoc(configDoc(SELLER), {
        nextTokenNumber: 5,
        registeredCount: 5,
        updatedBy: SELLER,
      })
    );
  });

  it("refuses to wind the allocator backwards", async () => {
    await seed("tokenLadduConfig", "current", { ...CONFIG, nextTokenNumber: 10, registeredCount: 10 });
    // Re-issuing a code that has already been announced is the failure this
    // prevents.
    await assertFails(updateDoc(configDoc(TREASURER), { nextTokenNumber: 4 }));
    await assertFails(updateDoc(configDoc(TREASURER), { registeredCount: 2 }));
  });

  it("refuses a negative or non-integer capacity", async () => {
    await assertFails(setDoc(configDoc(TREASURER), { ...CONFIG, totalTokens: -1 }));
    await assertFails(setDoc(configDoc(TREASURER), { ...CONFIG, totalTokens: 12.5 }));
  });
});

describe("KAN-125 token laddu rules - registration and tokens", () => {
  it("lets a token writer create a registration and its tokens", async () => {
    await assertSucceeds(setDoc(registrationDoc(SELLER, "reg-1"), REGISTRATION));
    await assertSucceeds(setDoc(tokenDoc(SELLER, "TKN26-000001"), TOKEN));
  });

  it("refuses a read-only member and a viewer", async () => {
    await assertFails(setDoc(tokenDoc(MEMBER, "TKN26-000001"), TOKEN));
    await assertFails(setDoc(tokenDoc(VIEWER, "TKN26-000001"), TOKEN));
  });

  it("refuses an outsider entirely", async () => {
    await assertFails(setDoc(tokenDoc(OUTSIDER, "TKN26-000001"), TOKEN));
    await assertFails(getDoc(tokenDoc(OUTSIDER, "TKN26-000001")));
  });

  it("withholds token reads from a viewer, because a token carries donor PII", async () => {
    await seed("tokenLadduTokens", "TKN26-000001", TOKEN);
    await assertSucceeds(getDoc(tokenDoc(MEMBER, "TKN26-000001")));
    await assertFails(getDoc(tokenDoc(VIEWER, "TKN26-000001")));
  });

  it("allows cancelling a token but never deleting one", async () => {
    await seed("tokenLadduTokens", "TKN26-000001", TOKEN);
    await assertFails(deleteDoc(tokenDoc(TREASURER, "TKN26-000001")));
    await assertSucceeds(
      updateDoc(tokenDoc(SELLER, "TKN26-000001"), {
        status: "cancelled",
        cancelReason: "Receipt torn up",
        cancelledBy: SELLER,
        updatedBy: SELLER,
      })
    );
  });

  it("refuses to reassign a token to a different participant", async () => {
    await seed("tokenLadduTokens", "TKN26-000001", TOKEN);
    // KAN-125: a token id is never silently reused for someone else.
    await assertFails(
      updateDoc(tokenDoc(SELLER, "TKN26-000001"), { participantName: "Someone Else" })
    );
    await assertFails(updateDoc(tokenDoc(SELLER, "TKN26-000001"), { registrationId: "reg-9" }));
  });

  it("refuses to un-cancel a token", async () => {
    await seed("tokenLadduTokens", "TKN26-000001", { ...TOKEN, status: "cancelled" });
    await assertFails(updateDoc(tokenDoc(SELLER, "TKN26-000001"), { status: "eligible" }));
  });
});

describe("KAN-125 token laddu rules - the draw is server-only", () => {
  it("refuses every client write to a draw result, even from an admin", async () => {
    const result = {
      drawSessionId: "draw-1",
      sequence: 1,
      tokenId: "TKN26-000001",
      tokenNumber: 1,
      registrationId: "reg-1",
      participantName: "Anjali",
      receiptNumberPhysical: "A-101",
      drawnBy: ADMIN,
      eligibleCount: 10,
    };
    for (const uid of [ADMIN, TREASURER, SELLER, MEMBER]) {
      await assertFails(setDoc(drawResultDoc(uid, "draw-1__1"), result));
    }
  });

  it("refuses to overwrite or delete a committed result", async () => {
    await seed("tokenDrawResults", "draw-1__1", {
      drawSessionId: "draw-1",
      sequence: 1,
      tokenId: "TKN26-000001",
      tokenNumber: 1,
      registrationId: "reg-1",
      participantName: "Anjali",
      receiptNumberPhysical: "A-101",
      drawnBy: ADMIN,
      eligibleCount: 10,
    });
    await assertFails(updateDoc(drawResultDoc(ADMIN, "draw-1__1"), { tokenId: "TKN26-000002" }));
    await assertFails(deleteDoc(drawResultDoc(ADMIN, "draw-1__1")));
    // It stays readable to anyone who may see tokens — the winner is public.
    await assertSucceeds(getDoc(drawResultDoc(MEMBER, "draw-1__1")));
  });

  it("refuses a client crowning a token as winner", async () => {
    await seed("tokenLadduTokens", "TKN26-000001", TOKEN);
    for (const uid of [ADMIN, TREASURER, SELLER]) {
      await assertFails(updateDoc(tokenDoc(uid, "TKN26-000001"), { status: "winner" }));
      await assertFails(
        updateDoc(tokenDoc(uid, "TKN26-000001"), {
          wonDrawSessionId: "draw-1",
          wonDrawSequence: 1,
        })
      );
    }
  });

  it("refuses a client demoting a token that already won", async () => {
    await seed("tokenLadduTokens", "TKN26-000001", {
      ...TOKEN,
      status: "winner",
      wonDrawSessionId: "draw-1",
      wonDrawSequence: 1,
    });
    await assertFails(
      updateDoc(tokenDoc(TREASURER, "TKN26-000001"), {
        status: "cancelled",
        cancelReason: "changed my mind",
        cancelledBy: TREASURER,
        updatedBy: TREASURER,
      })
    );
  });
});

describe("KAN-125 token laddu rules - draw sessions", () => {
  it("lets draw.run open a session and refuses a seller", async () => {
    await assertSucceeds(setDoc(drawSessionDoc(TREASURER, "draw-1"), DRAW_SESSION));
    await assertFails(setDoc(drawSessionDoc(SELLER, "draw-2"), DRAW_SESSION));
  });

  it("refuses to edit the terms a draw started under", async () => {
    await seed("tokenDrawSessions", "draw-1", DRAW_SESSION);
    // The snapshot is the audit trail; editing it after the fact would rewrite
    // what the committee announced.
    await assertFails(updateDoc(drawSessionDoc(TREASURER, "draw-1"), { plannedDraws: 2 }));
    await assertFails(updateDoc(drawSessionDoc(TREASURER, "draw-1"), { configuredTokens: 2 }));
    await assertFails(updateDoc(drawSessionDoc(TREASURER, "draw-1"), { completedDraws: 99 }));
  });

  it("lets an authorized user complete or cancel a session", async () => {
    await seed("tokenDrawSessions", "draw-1", DRAW_SESSION);
    await assertSucceeds(
      updateDoc(drawSessionDoc(TREASURER, "draw-1"), {
        status: "completed",
        completedBy: TREASURER,
        updatedBy: TREASURER,
      })
    );
  });

  it("accepts exactly the field set closeTokenDrawSession writes", async () => {
    // The service and the rules allowlist are written apart and can drift. This
    // pins the whole payload rather than a convenient subset of it.
    await seed("tokenDrawSessions", "draw-1", DRAW_SESSION);
    await assertSucceeds(
      updateDoc(drawSessionDoc(TREASURER, "draw-1"), {
        status: "cancelled",
        cancelReason: "Rain stopped the event",
        completedAt: new Date(),
        completedBy: TREASURER,
        updatedBy: TREASURER,
        updatedAt: new Date(),
      })
    );
  });

  it("accepts the payload openTokenDrawSession creates", async () => {
    await assertSucceeds(
      setDoc(drawSessionDoc(TREASURER, "draw-2"), {
        status: "open",
        startedAt: new Date(),
        startedBy: TREASURER,
        startedByName: "Treasurer",
        configuredTokens: 500,
        plannedDraws: 500,
        completedDraws: 0,
        createdBy: TREASURER,
        createdAt: new Date(),
        updatedBy: TREASURER,
        updatedAt: new Date(),
      })
    );
  });
});

describe("KAN-125 token laddu rules - the registration's ledger row", () => {
  // The shape `registerTokenLaddu` actually writes, GS-078 purpose fields
  // included — an incomplete payload would fail for the wrong reason.
  function collectionPayload(uid: string) {
    return {
      donorName: "Anjali",
      amount: 500,
      paymentMethod: "cash",
      collectorId: uid,
      receiptNumber: "GNS26-000182",
      date: "2026-09-05",
      ledgerType: "COLLECTION",
      purposeType: "collection",
      purposeCategory: "other",
      direction: "in",
      voided: false,
      createdBy: uid,
      updatedBy: uid,
    };
  }

  function collectionDoc(uid: string, id: string) {
    return doc(as(uid), "pandals", PANDAL, "festivals", FESTIVAL, "collections", id);
  }

  it("refuses the money row to a seller who cannot write collections", async () => {
    // SELLER holds tokens.read/write and nothing else. The registration
    // transaction also writes a collections row, so `tokens.write` alone is not
    // enough — which is why the hook demands `collections.create` up front
    // rather than letting the transaction fail half-way.
    await assertFails(setDoc(collectionDoc(SELLER, "tkn-op-1"), collectionPayload(SELLER)));
  });

  it("allows it for a treasurer, who holds both", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "pandals", PANDAL, "members", TREASURER), {
        userId: TREASURER,
        displayName: "Treasurer",
        role: "treasurer",
        status: "active",
        permissions: [
          "tokens.read",
          "tokens.write",
          "tokens.config",
          "draw.run",
          "collections.create",
        ],
      });
    });
    await assertSucceeds(
      setDoc(collectionDoc(TREASURER, "tkn-op-2"), collectionPayload(TREASURER))
    );
  });
});

describe("KAN-125 token laddu rules - a closed festival is closed", () => {
  it("refuses registration and draw writes once the festival closes", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "pandals", PANDAL, "festivals", FESTIVAL),
        { name: "Ganesh Utsav Test", year: 2026, status: "closed", createdBy: ADMIN, updatedBy: ADMIN }
      );
    });
    await assertFails(setDoc(tokenDoc(SELLER, "TKN26-000002"), TOKEN));
    await assertFails(setDoc(configDoc(TREASURER), CONFIG));
    await assertFails(setDoc(drawSessionDoc(TREASURER, "draw-2"), DRAW_SESSION));
  });
});
