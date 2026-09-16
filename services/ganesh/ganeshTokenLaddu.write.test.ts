import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Registering a Token Laddu purchase is one transaction (KAN-125).
 *
 * The property under test is all-or-nothing. A quantity of five has to produce
 * five token documents, one registration, one ledger row and one allocator bump
 * — or, if anything fails, none of them. A partial registration is the worst
 * outcome available here: tokens with no money behind them, or money with no
 * tokens, in a pot that is about to be drawn from in public.
 *
 * The fake `runTransaction` below stages writes and commits them only when the
 * body returns, which is how a real Firestore transaction behaves. That is what
 * makes the atomicity assertions meaningful rather than decorative.
 */

type FakeRef = { path: string };
type Write = { path: string; data: Record<string, unknown> };

const writes: Write[] = [];
let docs: Record<string, Record<string, unknown> | undefined> = {};
let festivalStatus = "open";
/** Set to make the transaction body throw part-way through its writes. */
let failOnPath: string | null = null;

const PANDAL = "pandal-1";
const FESTIVAL = "festival-1";
const FESTIVAL_PATH = `pandals/${PANDAL}/festivals/${FESTIVAL}`;
const CONFIG_PATH = `${FESTIVAL_PATH}/tokenLadduConfig/current`;
const SUMMARY_PATH = `${FESTIVAL_PATH}/summary/totals`;

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  getDoc: vi.fn(async (ref: FakeRef) => {
    // `requireOpenFestival` reads the festival through the top-level getDoc,
    // so it is served here as well as inside the transaction.
    if (ref.path === FESTIVAL_PATH) {
      return {
        exists: () => true,
        ref,
        data: () => ({ status: festivalStatus, name: "Ganesh Utsav Test", year: 2026 }),
      };
    }
    return { exists: () => docs[ref.path] !== undefined, ref, data: () => docs[ref.path] };
  }),
  serverTimestamp: () => ({ __serverTimestamp: true }),
  runTransaction: vi.fn(async (_db: unknown, fn: (t: unknown) => Promise<unknown>) => {
    const staged: Write[] = [];
    const txn = {
      get: async (ref: FakeRef) => {
        if (ref.path === FESTIVAL_PATH) {
          return {
            exists: () => true,
            ref,
            data: () => ({ status: festivalStatus, name: "Ganesh Utsav Test", year: 2026 }),
          };
        }
        return { exists: () => docs[ref.path] !== undefined, ref, data: () => docs[ref.path] };
      },
      set: (ref: FakeRef, data: Record<string, unknown>) => {
        if (failOnPath && ref.path.includes(failOnPath)) throw new Error("boom");
        staged.push({ path: ref.path, data });
      },
      update: (ref: FakeRef, data: Record<string, unknown>) => {
        if (failOnPath && ref.path.includes(failOnPath)) throw new Error("boom");
        staged.push({ path: ref.path, data });
      },
    };
    const result = await fn(txn);
    writes.push(...staged);
    return result;
  }),
}));

let idCounter = 0;
vi.mock("@/lib/id", () => ({ newId: () => `generated-${++idCounter}` }));

import {
  cancelTokenLadduRegistration,
  registerTokenLaddu,
  setTokenLadduCapacity,
} from "./ganeshTokenLaddu";

const ACTOR = { uid: "u-treasurer", displayName: "Treasurer" };

function configured(overrides: Record<string, unknown> = {}) {
  return {
    totalTokens: 500,
    amountPerToken: 100,
    nextTokenNumber: 0,
    registeredCount: 0,
    cancelledCount: 0,
    createdBy: ACTOR.uid,
    updatedBy: ACTOR.uid,
    ...overrides,
  };
}

const REGISTRATION = {
  participantName: "Anjali",
  mobile: "9000000000",
  quantity: 5,
  amount: 500,
  paymentMethod: "cash" as const,
  receiptNumberPhysical: "A-101",
  date: "2026-09-05",
  clientOpId: "op-1",
};

function pathsUnder(segment: string) {
  return writes.filter((write) => write.path.includes(segment));
}

beforeEach(() => {
  writes.length = 0;
  docs = {
    [`pandals/${PANDAL}/members/${ACTOR.uid}`]: { status: "active", role: "treasurer" },
  };
  festivalStatus = "open";
  failOnPath = null;
  idCounter = 0;
});

describe("registerTokenLaddu — one token per laddu", () => {
  it("creates exactly one token for a quantity of one", async () => {
    docs[CONFIG_PATH] = configured();
    const result = await registerTokenLaddu(
      {} as never,
      ACTOR,
      PANDAL,
      FESTIVAL,
      { ...REGISTRATION, quantity: 1, amount: 100 }
    );

    expect(result.tokenCodes).toEqual(["TKN26-000001"]);
    expect(pathsUnder("tokenLadduTokens")).toHaveLength(1);
  });

  it("creates exactly five unique tokens for a quantity of five, on one receipt", async () => {
    docs[CONFIG_PATH] = configured();
    const result = await registerTokenLaddu({} as never, ACTOR, PANDAL, FESTIVAL, REGISTRATION);

    expect(result.tokenCodes).toEqual([
      "TKN26-000001",
      "TKN26-000002",
      "TKN26-000003",
      "TKN26-000004",
      "TKN26-000005",
    ]);
    expect(new Set(result.tokenCodes).size).toBe(5);

    const tokens = pathsUnder("tokenLadduTokens");
    expect(tokens).toHaveLength(5);
    // Every token points back at the one registration, and none is reassigned.
    for (const token of tokens) {
      expect(token.data.registrationId).toBe("op-1");
      expect(token.data.receiptNumberPhysical).toBe("A-101");
      expect(token.data.status).toBe("eligible");
    }
  });

  it("splits the amount so the per-token figures add back to what was paid", async () => {
    docs[CONFIG_PATH] = configured();
    await registerTokenLaddu({} as never, ACTOR, PANDAL, FESTIVAL, {
      ...REGISTRATION,
      quantity: 3,
      amount: 100,
    });

    const shares = pathsUnder("tokenLadduTokens").map((write) => Number(write.data.amount));
    expect(shares).toHaveLength(3);
    expect(shares.reduce((sum, value) => sum + value, 0)).toBeCloseTo(100, 2);
  });

  it("continues the sequence from the allocator rather than restarting", async () => {
    docs[CONFIG_PATH] = configured({ nextTokenNumber: 41, registeredCount: 41 });
    const result = await registerTokenLaddu({} as never, ACTOR, PANDAL, FESTIVAL, {
      ...REGISTRATION,
      quantity: 2,
      amount: 200,
    });

    expect(result.tokenCodes).toEqual(["TKN26-000042", "TKN26-000043"]);
    const config = writes.find((write) => write.path === CONFIG_PATH);
    expect(config?.data.nextTokenNumber).toBe(43);
    expect(config?.data.registeredCount).toBe(43);
  });
});

describe("registerTokenLaddu — the money", () => {
  it("writes one ordinary collection row carrying the whole amount", async () => {
    docs[CONFIG_PATH] = configured();
    await registerTokenLaddu({} as never, ACTOR, PANDAL, FESTIVAL, REGISTRATION);

    const ledger = pathsUnder("/collections/");
    expect(ledger).toHaveLength(1);
    expect(ledger[0].data.amount).toBe(500);
    expect(ledger[0].data.ledgerType).toBe("COLLECTION");
    expect(ledger[0].data.paymentMethod).toBe("cash");
    // Festival totals derive from this row, so the token documents must not
    // also carry the money — that is the double-count KAN-125 forbids.
    const tokenTotal = pathsUnder("tokenLadduTokens").reduce(
      (sum, write) => sum + Number(write.data.amount),
      0
    );
    expect(tokenTotal).toBe(500);
    expect(ledger[0].data.amount).toBe(500);
  });

  it("allocates a ledger receipt number and keeps the physical one separate", async () => {
    docs[CONFIG_PATH] = configured();
    docs[SUMMARY_PATH] = { nextReceiptNumber: 181 };
    const result = await registerTokenLaddu({} as never, ACTOR, PANDAL, FESTIVAL, REGISTRATION);

    expect(result.receiptNumber).toBe("GNS26-000182");
    const registration = writes.find((write) => write.path.includes("tokenLadduRegistrations"));
    expect(registration?.data.receiptNumber).toBe("GNS26-000182");
    expect(registration?.data.receiptNumberPhysical).toBe("A-101");
    expect(writes.find((write) => write.path === SUMMARY_PATH)?.data.nextReceiptNumber).toBe(182);
  });

  it("records who took the cash", async () => {
    docs[CONFIG_PATH] = configured();
    await registerTokenLaddu({} as never, ACTOR, PANDAL, FESTIVAL, REGISTRATION);
    expect(pathsUnder("/collections/")[0].data.collectorId).toBe(ACTOR.uid);
  });
});

describe("registerTokenLaddu — all N or nothing", () => {
  it("writes nothing at all when a token write fails part-way", async () => {
    docs[CONFIG_PATH] = configured();
    failOnPath = "tokenLadduTokens";

    await expect(
      registerTokenLaddu({} as never, ACTOR, PANDAL, FESTIVAL, REGISTRATION)
    ).rejects.toThrow("boom");

    // Not "fewer tokens" — nothing. No registration, no ledger row, no
    // allocator bump left behind to strand the next registration.
    expect(writes).toHaveLength(0);
  });

  it("writes nothing when the ledger row fails", async () => {
    docs[CONFIG_PATH] = configured();
    failOnPath = "/collections/";

    await expect(
      registerTokenLaddu({} as never, ACTOR, PANDAL, FESTIVAL, REGISTRATION)
    ).rejects.toThrow("boom");
    expect(writes).toHaveLength(0);
  });
});

describe("registerTokenLaddu — idempotency and capacity", () => {
  it("does not create a second set of tokens for a repeated submission", async () => {
    docs[CONFIG_PATH] = configured();
    docs[`${FESTIVAL_PATH}/tokenLadduRegistrations/op-1`] = {
      participantName: "Anjali",
      tokenNumbers: [1, 2, 3, 4, 5],
      festivalYear: 2026,
      receiptNumber: "GNS26-000182",
    };

    const result = await registerTokenLaddu({} as never, ACTOR, PANDAL, FESTIVAL, REGISTRATION);

    expect(result.alreadyRegistered).toBe(true);
    expect(result.tokenCodes).toHaveLength(5);
    expect(writes).toHaveLength(0);
  });

  it("refuses to register past the configured capacity", async () => {
    docs[CONFIG_PATH] = configured({ totalTokens: 10, nextTokenNumber: 8, registeredCount: 8 });

    await expect(
      registerTokenLaddu({} as never, ACTOR, PANDAL, FESTIVAL, REGISTRATION)
    ).rejects.toThrow(/Only 2 Token Laddus are left/);
    expect(writes).toHaveLength(0);
  });

  it("refuses when nothing has been configured yet", async () => {
    await expect(
      registerTokenLaddu({} as never, ACTOR, PANDAL, FESTIVAL, REGISTRATION)
    ).rejects.toThrow(/Set the number of Token Laddus/);
  });

  it("refuses a closed festival before touching anything", async () => {
    docs[CONFIG_PATH] = configured();
    festivalStatus = "closed";
    await expect(
      registerTokenLaddu({} as never, ACTOR, PANDAL, FESTIVAL, REGISTRATION)
    ).rejects.toThrow("This festival is closed.");
    expect(writes).toHaveLength(0);
  });
});

describe("registerTokenLaddu — the trail", () => {
  it("writes an audit entry naming the codes it created", async () => {
    docs[CONFIG_PATH] = configured();
    await registerTokenLaddu({} as never, ACTOR, PANDAL, FESTIVAL, REGISTRATION);

    const audit = pathsUnder("auditLogs")[0];
    expect(audit.data.action).toBe("created");
    expect(audit.data.entityType).toBe("tokenLadduRegistration");
    expect((audit.data.newValue as { tokenCodes: string[] }).tokenCodes).toHaveLength(5);
    expect(pathsUnder("/activity/")).toHaveLength(1);
  });
});

describe("setTokenLadduCapacity", () => {
  it("seeds the config on first use", async () => {
    await setTokenLadduCapacity({} as never, ACTOR, PANDAL, FESTIVAL, {
      totalTokens: 500,
      amountPerToken: 100,
    });

    const config = writes.find((write) => write.path === CONFIG_PATH);
    expect(config?.data.totalTokens).toBe(500);
    expect(config?.data.nextTokenNumber).toBe(0);
    expect(config?.data.registeredCount).toBe(0);
  });

  it("refuses to drop capacity below the tokens already registered", async () => {
    docs[CONFIG_PATH] = configured({ totalTokens: 500, registeredCount: 120 });
    await expect(
      setTokenLadduCapacity({} as never, ACTOR, PANDAL, FESTIVAL, {
        totalTokens: 100,
        reason: "miscounted",
      })
    ).rejects.toThrow(/120 Token Laddus are already registered/);
    expect(writes).toHaveLength(0);
  });

  it("requires a reason to reduce capacity, and audits the change", async () => {
    docs[CONFIG_PATH] = configured({ totalTokens: 500, registeredCount: 10 });
    await expect(
      setTokenLadduCapacity({} as never, ACTOR, PANDAL, FESTIVAL, { totalTokens: 200 })
    ).rejects.toThrow(/reason/i);

    await setTokenLadduCapacity({} as never, ACTOR, PANDAL, FESTIVAL, {
      totalTokens: 200,
      reason: "Only 200 laddus were made",
    });
    const audit = pathsUnder("auditLogs")[0];
    expect(audit.data.reason).toBe("Only 200 laddus were made");
    expect((audit.data.oldValue as { totalTokens: number }).totalTokens).toBe(500);
    expect((audit.data.newValue as { totalTokens: number }).totalTokens).toBe(200);
  });

  it("allows raising capacity without a reason, which is how a full pot reopens", async () => {
    docs[CONFIG_PATH] = configured({ totalTokens: 100, registeredCount: 100 });
    await setTokenLadduCapacity({} as never, ACTOR, PANDAL, FESTIVAL, { totalTokens: 150 });
    expect(writes.find((write) => write.path === CONFIG_PATH)?.data.totalTokens).toBe(150);
  });
});

describe("cancelTokenLadduRegistration", () => {
  function seedRegistration(tokenStatuses: string[]) {
    docs[CONFIG_PATH] = configured({ nextTokenNumber: 3, registeredCount: 3 });
    docs[`${FESTIVAL_PATH}/tokenLadduRegistrations/op-1`] = {
      participantName: "Anjali",
      tokenNumbers: [1, 2, 3],
      festivalYear: 2026,
      voided: false,
    };
    tokenStatuses.forEach((status, index) => {
      docs[`${FESTIVAL_PATH}/tokenLadduTokens/TKN26-00000${index + 1}`] = {
        tokenNumber: index + 1,
        status,
        registrationId: "op-1",
      };
    });
  }

  it("makes every token ineligible and counts them once", async () => {
    seedRegistration(["eligible", "eligible", "eligible"]);
    const result = await cancelTokenLadduRegistration({} as never, ACTOR, PANDAL, FESTIVAL, {
      registrationId: "op-1",
      reason: "Receipt cancelled",
    });

    expect(result.cancelledTokens).toBe(3);
    const cancelled = pathsUnder("tokenLadduTokens");
    expect(cancelled).toHaveLength(3);
    for (const token of cancelled) expect(token.data.status).toBe("cancelled");
    expect(writes.find((write) => write.path === CONFIG_PATH)?.data.cancelledCount).toBe(3);
  });

  it("does not wind back registeredCount, so a code is never reissued", async () => {
    seedRegistration(["eligible", "eligible", "eligible"]);
    await cancelTokenLadduRegistration({} as never, ACTOR, PANDAL, FESTIVAL, {
      registrationId: "op-1",
      reason: "Receipt cancelled",
    });
    const config = writes.find((write) => write.path === CONFIG_PATH);
    expect(config?.data.registeredCount).toBeUndefined();
    expect(config?.data.nextTokenNumber).toBeUndefined();
  });

  it("refuses to cancel a registration holding a winner", async () => {
    seedRegistration(["eligible", "winner", "eligible"]);
    await expect(
      cancelTokenLadduRegistration({} as never, ACTOR, PANDAL, FESTIVAL, {
        registrationId: "op-1",
        reason: "changed my mind",
      })
    ).rejects.toThrow(/winning Token Laddu/);
    expect(writes).toHaveLength(0);
  });

  it("is a no-op on an already-cancelled registration", async () => {
    seedRegistration(["cancelled", "cancelled", "cancelled"]);
    docs[`${FESTIVAL_PATH}/tokenLadduRegistrations/op-1`] = {
      participantName: "Anjali",
      tokenNumbers: [1, 2, 3],
      festivalYear: 2026,
      voided: true,
    };
    const result = await cancelTokenLadduRegistration({} as never, ACTOR, PANDAL, FESTIVAL, {
      registrationId: "op-1",
      reason: "again",
    });
    expect(result.cancelledTokens).toBe(0);
    expect(writes).toHaveLength(0);
  });

  it("requires a reason", async () => {
    seedRegistration(["eligible"]);
    await expect(
      cancelTokenLadduRegistration({} as never, ACTOR, PANDAL, FESTIVAL, {
        registrationId: "op-1",
        reason: "   ",
      })
    ).rejects.toThrow(/reason/i);
  });
});
