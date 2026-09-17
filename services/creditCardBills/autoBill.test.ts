import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeRef = { path: string };
type Write = {
  path: string;
  data: Record<string, unknown>;
  merge: boolean;
};

const fakeDoc = (_db: unknown, ...segments: string[]): FakeRef => ({
  path: segments.join("/"),
});

vi.mock("firebase/firestore", () => ({
  doc: (db: unknown, ...segments: string[]) => fakeDoc(db, ...segments),
  increment: (n: number) => ({ __increment: n }),
  serverTimestamp: () => ({ __serverTimestamp: true }),
  setDoc: vi.fn(),
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

import { setDoc } from "firebase/firestore";

import { createAutoCreditCardBill } from "./autoBill";
import { AUTO_CREDIT_CARD_BILL_REMINDER_FREQUENCY } from "@/shared/types/creditCardBill";

const DRAFT = {
  accountId: "cc-slice",
  statementAmount: 1450,
  minimumDueAmount: 72.5,
  statementDate: "2026-08-15",
  dueDate: "2026-08-20",
  billingPeriodStart: "2026-07-16",
  billingPeriodEnd: "2026-08-15",
  note: "Auto-created from cycle spend",
  currency: "INR",
  reminderEnabled: true,
  reminderFrequency: AUTO_CREDIT_CARD_BILL_REMINDER_FREQUENCY,
};

let writes: Write[] = [];

beforeEach(() => {
  writes = [];
  vi.mocked(setDoc).mockImplementation(
    (async (
      ref: FakeRef,
      data: Record<string, unknown>,
      options?: { merge?: boolean }
    ) => {
      writes.push({
        path: ref.path,
        data,
        merge: options?.merge === true,
      });
    }) as typeof setDoc
  );
});

describe("createAutoCreditCardBill", () => {
  it("writes accountId_statementDate with merge and increment(0) amountPaid", async () => {
    const result = await createAutoCreditCardBill("u1", DRAFT);

    expect(result.id).toBe("cc-slice_2026-08-15");
    expect(writes).toHaveLength(1);
    expect(writes[0]?.path).toBe("users/u1/creditCardBills/cc-slice_2026-08-15");
    expect(writes[0]?.merge).toBe(true);
    expect(writes[0]?.data).toMatchObject({
      accountId: "cc-slice",
      statementDate: "2026-08-15",
      statementAmount: 1450,
      amountPaid: { __increment: 0 },
    });
    expect(writes[0]?.data).not.toHaveProperty("status");
    expect(writes[0]?.data).not.toHaveProperty("remainingAmount");
    expect(writes[0]?.data).not.toHaveProperty("paymentIds");
    expect(writes[0]?.data).not.toHaveProperty("paymentDate");
  });

  it("replays to the same document instead of minting a second id", async () => {
    await createAutoCreditCardBill("u1", DRAFT);
    await createAutoCreditCardBill("u1", DRAFT);

    expect(writes).toHaveLength(2);
    expect(writes[0]?.path).toBe(writes[1]?.path);
    expect(new Set(writes.map((w) => w.path)).size).toBe(1);
  });
});
