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

vi.mock("firebase/firestore", () => ({
  doc: (db: unknown, ...segments: string[]) => fakeDoc(db, ...segments),
  collection: (db: unknown, ...segments: string[]) => fakeDoc(db, ...segments),
  getDoc: vi.fn(async (ref: FakeRef) => ({
    exists: () => docs.has(ref.path),
    data: () => docs.get(ref.path),
  })),
  increment: (n: number) => ({ __increment: n }),
  arrayUnion: (...values: unknown[]) => ({ __arrayUnion: values }),
  arrayRemove: (...values: unknown[]) => ({ __arrayRemove: values }),
  serverTimestamp: () => ({ __serverTimestamp: true }),
  setDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({
  getFirestoreDb: () => ({ __db: true }),
}));

vi.mock("@/lib/firestoreWrite", () => ({
  commitWrite: async (fn: () => Promise<unknown>) => {
    await fn();
    return "acked";
  },
}));

let idCounter = 0;
vi.mock("@/lib/id", () => ({
  newId: () => `pay-${++idCounter}`,
}));

import { writeBatch } from "firebase/firestore";

import {
  recordCreditBillPayment,
  voidCreditBillPayment,
} from "./billPayment";

let writes: Write[] = [];
let commits = 0;

function installBatchRecorder() {
  vi.mocked(writeBatch).mockImplementation(
    () =>
      ({
        set: (ref: FakeRef, data: Record<string, unknown>, options?: { merge?: boolean }) => {
          writes.push({ path: ref.path, data, merge: options?.merge === true, kind: "set" });
          docs.set(ref.path, { ...(docs.get(ref.path) ?? {}), ...data });
        },
        update: (ref: FakeRef, data: Record<string, unknown>) => {
          writes.push({ path: ref.path, data, merge: false, kind: "update" });
          docs.set(ref.path, { ...(docs.get(ref.path) ?? {}), ...data });
        },
        commit: async () => {
          commits += 1;
        },
      }) as never
  );
}

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
  vi.clearAllMocks();
  installBatchRecorder();
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
    expect(bill?.data.amountPaid).toEqual({ __increment: 4000 });
    expect(bill?.data.paymentIds).toEqual({ __arrayUnion: ["pay-1"] });
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
    vi.mocked(writeBatch).mockImplementation(
      () =>
        ({
          set: () => undefined,
          update: () => undefined,
          commit: async () => {
            throw new Error("bill stamp failed");
          },
        }) as never
    );

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
    expect(bill?.data.paymentIds).toEqual({ __arrayRemove: ["pay-1"] });
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
