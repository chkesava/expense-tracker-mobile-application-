import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeRef = { path: string };
type Write = {
  path: string;
  data: Record<string, unknown>;
  merge: boolean;
  kind: "set" | "update";
};

let autoIdCounter = 0;
const fakeDoc = (base: unknown, ...segments: string[]): FakeRef => {
  // `doc(collectionRef)` — Firestore picks the id.
  if (segments.length === 0 && base && typeof base === "object" && "path" in base) {
    return { path: `${(base as FakeRef).path}/auto-${++autoIdCounter}` };
  }
  return { path: segments.join("/") };
};

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
  BILL_PAYMENT_EDIT_CONFLICT_MESSAGE,
  appliedAmountOf,
  editCreditBillPayment,
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
  autoIdCounter = 0;
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
      billAppliedAmount: 4000,
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
    expect(journalled(bill?.data.amountPaid)).toEqual({
      [FIRESTORE_SENTINEL_KEY]: "increment",
      n: -4000,
    });
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

describe("voidCreditBillPayment reverses only what the payment stamped", () => {
  it("leaves another payment's share when the voided one overpaid the statement", async () => {
    // pay-2 was 5000 against a statement that only owed 2000 more.
    docs.set("users/u1/accountPayments/pay-2", {
      amount: 5000,
      creditCardBillId: "bill-1",
      billAppliedAmount: 2000,
    });
    docs.set("users/u1/creditCardBills/bill-1", {
      statementAmount: 10000,
      amountPaid: 10000,
      dueDate: "2026-09-25",
      status: "PAID",
      paymentIds: ["pay-1", "pay-2"],
    });

    const result = await voidCreditBillPayment("u1", "pay-2", { timezone: "Asia/Kolkata" });

    const bill = writes.find((w) => w.path.endsWith("/creditCardBills/bill-1"));
    expect(journalled(bill?.data.amountPaid)).toEqual({
      [FIRESTORE_SENTINEL_KEY]: "increment",
      n: -2000,
    });
    expect(bill?.data.remainingAmount).toBe(2000);
    expect(result.billStatus).toBe("PARTIALLY_PAID");
  });

  it("estimates legacy payments from the bill, never past what it holds", () => {
    expect(
      appliedAmountOf("pay-1", { amount: 5000 }, { amountPaid: 3000, paymentIds: ["pay-1"] })
    ).toBe(3000);
    expect(
      appliedAmountOf("pay-1", { amount: 5000 }, { amountPaid: 3000, paymentIds: [] })
    ).toBe(0);
    expect(
      appliedAmountOf(
        "pay-1",
        { amount: 5000, billAppliedAmount: 4000 },
        { amountPaid: 3000, paymentIds: ["pay-1"] }
      )
    ).toBe(3000);
  });
});

describe("editCreditBillPayment", () => {
  const PAYMENT = "users/u1/accountPayments/pay-1";
  const BILL_PATH = "users/u1/creditCardBills/bill-1";
  const TS = { seconds: 1_790_000_000, nanoseconds: 0 };

  const seed = (payment: Record<string, unknown> = {}, bill: Record<string, unknown> = {}) => {
    docs.set(PAYMENT, {
      fromAccountId: "hdfc",
      toAccountId: "card-1",
      amount: 730,
      date: "2026-09-17",
      note: "Credit card bill payment",
      sourceType: "account",
      creditCardBillId: "bill-1",
      billAppliedAmount: 730,
      updatedAt: TS,
      ...payment,
    });
    docs.set(BILL_PATH, {
      statementAmount: 730,
      amountPaid: 730,
      dueDate: "2026-09-25",
      statementDate: "2026-09-05",
      status: "PAID",
      paymentIds: ["pay-1"],
      paymentDate: "2026-09-17",
      ...bill,
    });
    docs.set("users/u1/accounts/sbi", { name: "SBI" });
    docs.set("users/u1/accounts/hdfc", { name: "HDFC" });
  };

  const base = {
    fromAccountId: "hdfc",
    sourceType: "account" as const,
    amount: 730,
    date: "2026-09-17",
    note: "Credit card bill payment",
  };
  const opts = { expectedUpdatedAt: TS, timezone: "Asia/Kolkata" };
  const paymentWrites = () => writes.filter((w) => w.path.includes("/accountPayments/"));
  const billWrites = () => writes.filter((w) => w.path.includes("/creditCardBills/"));
  const eventWrites = () => writes.filter((w) => w.path.includes("/ledgerEvents/"));

  it("moves the payment to the right bank without touching settlement", async () => {
    seed();
    const result = await editCreditBillPayment(
      "u1",
      "pay-1",
      { ...base, fromAccountId: "sbi" },
      opts
    );

    expect(commits).toBe(1);
    expect(result.changed).toBe(true);
    expect(result.billStatus).toBe("PAID");
    // Same row updated in place — no second payment.
    expect(paymentWrites()).toHaveLength(1);
    expect(paymentWrites()[0].kind).toBe("update");
    expect(paymentWrites()[0].path).toBe(PAYMENT);
    expect(paymentWrites()[0].data).toMatchObject({
      fromAccountId: "sbi",
      sourceType: "account",
      amount: 730,
      billAppliedAmount: 730,
    });
    expect(billWrites()).toHaveLength(0);

    const event = eventWrites()[0];
    expect(event.kind).toBe("set");
    expect(event.data).toMatchObject({
      kind: "payment",
      docId: "pay-1",
      action: "update",
      actorUid: "u1",
      before: { accountId: "hdfc", amount: 730, toAccountId: "card-1" },
      after: { accountId: "sbi", amount: 730, toAccountId: "card-1" },
    });
  });

  it("writes nothing when the patch matches what is stored", async () => {
    seed();
    const result = await editCreditBillPayment("u1", "pay-1", base, opts);
    expect(result.changed).toBe(false);
    expect(commits).toBe(0);
  });

  it("is a no-op on replay, so a double submit cannot apply twice", async () => {
    seed({}, { statementAmount: 1000, amountPaid: 730, status: "PARTIALLY_PAID" });
    const patch = { ...base, fromAccountId: "sbi", amount: 900 };
    await editCreditBillPayment("u1", "pay-1", patch, opts);
    expect(commits).toBe(1);
    // The client passes back whatever updatedAt the committed row now carries.
    const stored = docs.get(PAYMENT)!;
    const second = await editCreditBillPayment("u1", "pay-1", patch, {
      ...opts,
      expectedUpdatedAt: stored.updatedAt,
    });
    expect(second.changed).toBe(false);
    expect(commits).toBe(1);
  });

  it("converts an external payment to a bank payment", async () => {
    seed({ fromAccountId: "external", sourceType: "external" });
    await editCreditBillPayment("u1", "pay-1", { ...base, fromAccountId: "sbi" }, opts);
    expect(paymentWrites()[0].data).toMatchObject({
      fromAccountId: "sbi",
      sourceType: "account",
    });
    expect(billWrites()).toHaveLength(0);
  });

  it("converts a bank payment to external without inventing a bank row", async () => {
    seed();
    await editCreditBillPayment(
      "u1",
      "pay-1",
      { ...base, fromAccountId: "hdfc", sourceType: "external" },
      opts
    );
    expect(paymentWrites()).toHaveLength(1);
    expect(paymentWrites()[0].data).toMatchObject({
      fromAccountId: "external",
      sourceType: "external",
    });
    expect(billWrites()).toHaveLength(0);
  });

  it("moves the bill by the difference when the amount drops", async () => {
    seed();
    const result = await editCreditBillPayment("u1", "pay-1", { ...base, amount: 500 }, opts);
    const bill = billWrites()[0];
    expect(journalled(bill.data.amountPaid)).toEqual({
      [FIRESTORE_SENTINEL_KEY]: "increment",
      n: -230,
    });
    expect(bill.data.remainingAmount).toBe(230);
    expect(bill.data.status).toBe("PARTIALLY_PAID");
    expect(result.billStatus).toBe("PARTIALLY_PAID");
    expect(paymentWrites()[0].data.billAppliedAmount).toBe(500);
  });

  it("caps an amount increase at what the statement still owes", async () => {
    // Another payment already covers 300 of a 1000 statement.
    seed(
      { amount: 700, billAppliedAmount: 700 },
      { statementAmount: 1000, amountPaid: 1000, paymentIds: ["pay-0", "pay-1"] }
    );
    await editCreditBillPayment("u1", "pay-1", { ...base, amount: 900 }, opts);
    // 300 + 700 already fills it — the extra 200 is an advance, not a stamp.
    expect(billWrites()).toHaveLength(0);
    expect(paymentWrites()[0].data.billAppliedAmount).toBe(700);
  });

  it("raises the stamp when a larger amount settles more", async () => {
    seed({}, { statementAmount: 1000, amountPaid: 730, status: "PARTIALLY_PAID" });
    const result = await editCreditBillPayment("u1", "pay-1", { ...base, amount: 1000 }, opts);
    expect(journalled(billWrites()[0].data.amountPaid)).toEqual({
      [FIRESTORE_SENTINEL_KEY]: "increment",
      n: 270,
    });
    expect(result.billStatus).toBe("PAID");
  });

  it("moves the bill's payment date with the payment", async () => {
    seed();
    await editCreditBillPayment("u1", "pay-1", { ...base, date: "2026-09-18" }, opts);
    const bill = billWrites()[0];
    expect(bill.data.paymentDate).toBe("2026-09-18");
    expect("amountPaid" in bill.data).toBe(false);
    expect(bill.data.status).toBe("PAID");
  });

  it("refuses to date a payment before its statement", async () => {
    seed();
    await expect(
      editCreditBillPayment("u1", "pay-1", { ...base, date: "2026-09-01" }, opts)
    ).rejects.toThrow("can't be dated earlier");
    expect(commits).toBe(0);
  });

  it("uses the legacy estimate for payments recorded before billAppliedAmount", async () => {
    seed({ billAppliedAmount: undefined });
    await editCreditBillPayment("u1", "pay-1", { ...base, amount: 700 }, opts);
    expect(journalled(billWrites()[0].data.amountPaid)).toEqual({
      [FIRESTORE_SENTINEL_KEY]: "increment",
      n: -30,
    });
  });

  it.each([
    ["missing", () => undefined, "Payment not found"],
    [
      "voided",
      () => seed({ voidedAt: "2026-09-20T00:00:00.000Z" }),
      "removed and can't be edited",
    ],
    [
      "cashback",
      () => seed({ fromAccountId: "cashback", sourceType: "cashback" }),
      "Cashback can't be edited",
    ],
    [
      "bill-deleted",
      () => {
        seed();
        docs.delete(BILL_PATH);
      },
      "bill for this payment no longer exists",
    ],
  ])("rejects a %s payment without writing", async (_name, arrange, message) => {
    arrange();
    await expect(
      editCreditBillPayment("u1", "pay-1", { ...base, fromAccountId: "sbi" }, opts)
    ).rejects.toThrow(message);
    expect(commits).toBe(0);
  });

  it("rejects a bank account that no longer exists", async () => {
    seed();
    await expect(
      editCreditBillPayment("u1", "pay-1", { ...base, fromAccountId: "gone" }, opts)
    ).rejects.toThrow("no longer exists");
    expect(commits).toBe(0);
  });

  it("rejects paying the card from itself", async () => {
    seed();
    await expect(
      editCreditBillPayment("u1", "pay-1", { ...base, fromAccountId: "card-1" }, opts)
    ).rejects.toThrow();
    expect(commits).toBe(0);
  });

  it("refuses an edit when another device changed the payment first", async () => {
    seed({ updatedAt: { seconds: TS.seconds + 60, nanoseconds: 0 } });
    await expect(
      editCreditBillPayment("u1", "pay-1", { ...base, fromAccountId: "sbi" }, opts)
    ).rejects.toThrow(BILL_PAYMENT_EDIT_CONFLICT_MESSAGE);
    expect(commits).toBe(0);
  });

  it("propagates a failed batch without reporting success", async () => {
    seed();
    vi.mocked(commitMutations).mockRejectedValueOnce(new Error("permission-denied"));
    await expect(
      editCreditBillPayment("u1", "pay-1", { ...base, fromAccountId: "sbi" }, opts)
    ).rejects.toThrow("permission-denied");
  });

  it("journals the edit batch as replay-unsafe and serialisable", async () => {
    seed();
    await editCreditBillPayment("u1", "pay-1", { ...base, amount: 500 }, opts);
    for (const write of writes) {
      expect(() => JSON.stringify(encodeFirestoreData(write.data))).not.toThrow();
    }
    const bill = encodeFirestoreData(billWrites()[0].data);
    expect(encodedDataIsNonIdempotent(bill)).toBe(true);
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
