import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeRef = { path: string };
type Write = {
  path: string;
  data: Record<string, unknown>;
  merge: boolean;
  kind: "set" | "update";
};

const fakeDoc = (_db: unknown, ...segments: string[]): FakeRef => ({
  path: segments.join("/"),
});

const docs = new Map<string, Record<string, unknown>>();

/**
 * Sentinels shaped the way the shipped bundles hand them over (SPENDLY-94).
 *
 * Firebase mangles the payload properties in its RN and browser builds —
 * the `increment` operand arrives as `ar`, array elements as `_r` — and
 * only `_methodName` survives. Mocking that shape rather than a tidy tagged
 * object is what keeps this suite honest about what the outbox must encode.
 */
vi.mock("firebase/firestore", () => {
  class MangledFieldValue {
    constructor(public _methodName: string) {}
  }
  const mangled = (methodName: string, payload?: Record<string, unknown>): object =>
    Object.assign(new MangledFieldValue(methodName), payload ?? {});

  class FakeTimestamp {
    constructor(
      public seconds: number,
      public nanoseconds: number
    ) {}
    static fromDate(date: Date) {
      return new FakeTimestamp(Math.floor(date.getTime() / 1000), 0);
    }
    toMillis() {
      return this.seconds * 1000;
    }
  }

  return {
    doc: (db: unknown, ...segments: string[]) => fakeDoc(db, ...segments),
    collection: (db: unknown, ...segments: string[]) => fakeDoc(db, ...segments),
    getDoc: vi.fn(async (ref: FakeRef) => ({
      exists: () => docs.has(ref.path),
      data: () => docs.get(ref.path),
    })),
    increment: (n: number) => mangled("increment", { ar: n }),
    arrayUnion: (...values: unknown[]) => mangled("arrayUnion", { _r: values }),
    arrayRemove: (...values: unknown[]) => mangled("arrayRemove", { _r: values }),
    serverTimestamp: () => mangled("serverTimestamp"),
    deleteField: () => mangled("deleteField"),
    Timestamp: FakeTimestamp,
    setDoc: vi.fn(),
    writeBatch: vi.fn(),
  };
});

vi.mock("@/lib/firebase", () => ({
  getFirestoreDb: () => ({ __db: true }),
}));

vi.mock("@/lib/commitMutations", () => ({
  commitMutations: vi.fn(async (_uid: string, ops: Array<{
    op: "set" | "update" | "delete";
    ref: FakeRef;
    data?: Record<string, unknown>;
    merge?: boolean;
  }>) => {
    for (const op of ops) {
      writes.push({
        path: op.ref.path,
        data: op.data ?? {},
        merge: op.merge === true,
        kind: op.op === "set" ? "set" : "update",
      });
      if (op.op !== "delete" && op.data) {
        docs.set(op.ref.path, { ...(docs.get(op.ref.path) ?? {}), ...op.data });
      }
    }
    commits += 1;
    return "acked";
  }),
}));

let idCounter = 0;
vi.mock("@/lib/id", () => ({
  newId: () => `pay-${++idCounter}`,
}));

import { commitMutations } from "@/lib/commitMutations";
import {
  FIRESTORE_SENTINEL_KEY,
  encodeFirestoreData,
  encodedDataIsNonIdempotent,
} from "@/lib/firestoreSentinel";
import {
  recordCreditBillPayment,
  voidCreditBillPayment,
  type RecordCreditBillPaymentInput,
} from "./billPayment";

/** What the durable outbox would journal for a field. */
const journalled = (value: unknown) => encodeFirestoreData(value);

let writes: Write[] = [];
let commits = 0;

const BILL = {
  id: "bill-1",
  statementAmount: 10000,
  amountPaid: 0,
  dueDate: "2026-09-25",
  status: "OVERDUE" as const,
  settleable: 4000,
  timezone: "Asia/Kolkata",
};

beforeEach(() => {
  writes = [];
  commits = 0;
  idCounter = 0;
  docs.clear();
  vi.mocked(commitMutations).mockReset();
  vi.mocked(commitMutations).mockImplementation(async (_uid, ops) => {
    for (const op of ops) {
      const data = op.op === "delete" ? {} : (op.data as Record<string, unknown>);
      writes.push({
        path: op.ref.path,
        data,
        merge: op.op === "set" && op.merge === true,
        kind: op.op === "set" ? "set" : "update",
      });
      if (op.op !== "delete") {
        docs.set(op.ref.path, { ...(docs.get(op.ref.path) ?? {}), ...data });
      }
    }
    commits += 1;
    return "acked";
  });
});

describe("recordCreditBillPayment", () => {
  it("writes the payment and the bill stamp in one batch", async () => {
    const result = await recordCreditBillPayment("u1", {
      fromAccountId: "bank-1",
      toAccountId: "card-1",
      amount: 4000,
      date: "2026-09-17",
      note: "September bill",
      sourceType: "account",
      paymentId: "pay-1",
      bill: BILL,
    });

    expect(commits).toBe(1);
    expect(result.paymentId).toBe("pay-1");
    expect(result.billStatus).toBe("PARTIALLY_PAID");

    const payment = writes.find((w) => w.path.includes("/accountPayments/"));
    expect(payment?.kind).toBe("set");
    expect(payment?.data).toMatchObject({
      fromAccountId: "bank-1",
      toAccountId: "card-1",
      amount: 4000,
      creditCardBillId: "bill-1",
      sourceType: "account",
    });

    const bill = writes.find((w) => w.path.includes("/creditCardBills/"));
    expect(bill?.kind).toBe("update");
    expect(journalled(bill?.data.amountPaid)).toEqual({
      [FIRESTORE_SENTINEL_KEY]: "increment",
      n: 4000,
    });
    expect(journalled(bill?.data.paymentIds)).toEqual({
      [FIRESTORE_SENTINEL_KEY]: "arrayUnion",
      values: ["pay-1"],
    });
    expect(bill?.data.remainingAmount).toBe(6000);
    expect(bill?.data.status).toBe("PARTIALLY_PAID");
  });

  it("does not stamp a bill when settleable is 0 — payment still commits once", async () => {
    await recordCreditBillPayment("u1", {
      fromAccountId: "bank-1",
      toAccountId: "card-1",
      amount: 4000,
      date: "2026-09-17",
      sourceType: "account",
      bill: { ...BILL, settleable: 0 },
    });

    expect(commits).toBe(1);
    expect(writes.filter((w) => w.path.includes("/creditCardBills/"))).toHaveLength(0);
    expect(writes.filter((w) => w.path.includes("/accountPayments/"))).toHaveLength(1);
  });

  it("targets the same payment path when retried with the same id", async () => {
    await recordCreditBillPayment("u1", {
      fromAccountId: "bank-1",
      toAccountId: "card-1",
      amount: 4000,
      date: "2026-09-17",
      sourceType: "account",
      paymentId: "pay-stable",
      bill: BILL,
    });
    const firstPaths = writes.map((w) => w.path);
    writes = [];
    await recordCreditBillPayment("u1", {
      fromAccountId: "bank-1",
      toAccountId: "card-1",
      amount: 4000,
      date: "2026-09-17",
      sourceType: "account",
      paymentId: "pay-stable",
      bill: BILL,
    });
    expect(writes.map((w) => w.path)).toEqual(firstPaths);
  });

  it("rejects without committing when the batch fails", async () => {
    vi.mocked(commitMutations).mockRejectedValueOnce(new Error("bill stamp failed"));

    await expect(
      recordCreditBillPayment("u1", {
        fromAccountId: "bank-1",
        toAccountId: "card-1",
        amount: 4000,
        date: "2026-09-17",
        sourceType: "account",
        bill: BILL,
      })
    ).rejects.toThrow("bill stamp failed");
    expect(commits).toBe(0);
  });
});

describe("voidCreditBillPayment", () => {
  it("voids the payment and reverses the bill stamp in one batch", async () => {
    docs.set("users/u1/accountPayments/pay-1", {
      amount: 4000,
      creditCardBillId: "bill-1",
    });
    docs.set("users/u1/creditCardBills/bill-1", {
      statementAmount: 10000,
      amountPaid: 4000,
      dueDate: "2026-09-25",
      status: "PARTIALLY_PAID",
      paymentIds: ["pay-1"],
    });

    await voidCreditBillPayment("u1", "pay-1", { timezone: "Asia/Kolkata" });

    expect(commits).toBe(1);
    const payment = writes.find((w) => w.path.endsWith("/accountPayments/pay-1"));
    expect(payment?.data.voidedAt).toEqual(expect.any(String));
    expect("voidedAt" in (payment?.data ?? {})).toBe(true);

    const bill = writes.find((w) => w.path.endsWith("/creditCardBills/bill-1"));
    expect(bill?.data.amountPaid).toBe(0);
    expect(journalled(bill?.data.paymentIds)).toEqual({
      [FIRESTORE_SENTINEL_KEY]: "arrayRemove",
      values: ["pay-1"],
    });
    expect(bill?.data.remainingAmount).toBe(10000);
  });

  it("is a no-op when the payment is already voided", async () => {
    docs.set("users/u1/accountPayments/pay-1", {
      amount: 4000,
      voidedAt: "2026-09-17T00:00:00.000Z",
    });

    await voidCreditBillPayment("u1", "pay-1");
    expect(commits).toBe(0);
  });
});

/**
 * The failure SPENDLY-94 reported: Pay Bill died in the write outbox with
 * "Write outbox cannot serialise this value" before the mutation could run.
 * The suites above stub `commitMutations`, so nothing there reaches the
 * serialiser — these cases push the ops it was handed through the real one.
 */
describe("outbox serialisation of every payment path", () => {
  const serialiseCapturedOps = () =>
    writes.map((write) => encodeFirestoreData(write.data));

  const cases: Array<[string, RecordCreditBillPaymentInput]> = [
    [
      "account to credit card, partial",
      {
        fromAccountId: "bank-1",
        toAccountId: "card-1",
        amount: 4000,
        date: "2026-09-17",
        sourceType: "account" as const,
        paymentId: "pay-1",
        bill: BILL,
      },
    ],
    [
      "account to credit card, full",
      {
        fromAccountId: "bank-1",
        toAccountId: "card-1",
        amount: 10000,
        date: "2026-09-17",
        sourceType: "account" as const,
        paymentId: "pay-1",
        bill: { ...BILL, settleable: 10000 },
      },
    ],
    [
      "external, already paid",
      {
        fromAccountId: "external",
        toAccountId: "card-1",
        amount: 10000,
        date: "2026-09-17",
        sourceType: "external" as const,
        paymentId: "pay-1",
        bill: { ...BILL, settleable: 10000 },
      },
    ],
    [
      "no statement to stamp",
      {
        fromAccountId: "bank-1",
        toAccountId: "card-1",
        amount: 4000,
        date: "2026-09-17",
        sourceType: "account" as const,
        paymentId: "pay-1",
      },
    ],
  ];

  it.each(cases)("journals a %s payment without throwing", async (_name, input) => {
    await recordCreditBillPayment("u1", input);

    expect(commits).toBe(1);
    const encoded = serialiseCapturedOps();
    expect(encoded).toHaveLength(writes.length);
    for (const data of encoded) {
      expect(() => JSON.stringify(data)).not.toThrow();
    }
  });

  it("journals the full settlement as a replay-unsafe increment", async () => {
    await recordCreditBillPayment("u1", {
      fromAccountId: "bank-1",
      toAccountId: "card-1",
      amount: 10000,
      date: "2026-09-17",
      sourceType: "account",
      paymentId: "pay-1",
      bill: { ...BILL, settleable: 10000 },
    });

    const bill = writes.find((w) => w.path.includes("/creditCardBills/"));
    const encoded = encodeFirestoreData(bill?.data) as Record<string, unknown>;
    expect(encoded.amountPaid).toEqual({ [FIRESTORE_SENTINEL_KEY]: "increment", n: 10000 });
    expect(encoded.status).toBe("PAID");
    expect(encodedDataIsNonIdempotent(encoded)).toBe(true);
  });

  it("journals a reversal without throwing", async () => {
    docs.set("users/u1/accountPayments/pay-1", {
      amount: 4000,
      creditCardBillId: "bill-1",
    });
    docs.set("users/u1/creditCardBills/bill-1", {
      statementAmount: 10000,
      amountPaid: 4000,
      dueDate: "2026-09-25",
      status: "PARTIALLY_PAID",
      paymentIds: ["pay-1"],
    });

    await voidCreditBillPayment("u1", "pay-1", { timezone: "Asia/Kolkata" });

    for (const data of serialiseCapturedOps()) {
      expect(() => JSON.stringify(data)).not.toThrow();
    }
  });
});
