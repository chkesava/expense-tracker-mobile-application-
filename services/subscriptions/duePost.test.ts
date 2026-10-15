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

vi.mock("firebase/firestore", () => ({
  doc: (db: unknown, ...segments: string[]) => fakeDoc(db, ...segments),
  serverTimestamp: () => ({ __serverTimestamp: true }),
  increment: (n: number) => ({ __increment: n }),
  writeBatch: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({
  getFirestoreDb: () => ({ __db: true }),
}));

const writes: Write[] = [];
let commits = 0;
let chargeExists = false;
const accounts: Record<string, { isCreditCard: boolean; oldBalance: number; oldOutstanding: number; needsInitialization: boolean }> = {};

vi.mock("@/services/ledger/fetchAccountTypes", () => ({
  docAlreadyWritten: vi.fn(async () => chargeExists),
  fetchAccountTypes: vi.fn(async (_db: unknown, _uid: string, ids: string[]) =>
    new Map(
      ids.map((id) => [
        id,
        accounts[id] ?? { isCreditCard: false, oldBalance: 10000, oldOutstanding: 0, needsInitialization: false },
      ])
    )
  ),
}));

vi.mock("@/lib/commitMutations", () => ({
  commitMutations: async (
    _uid: string,
    ops: Array<{
      op: "set" | "update" | "delete";
      ref: FakeRef;
      data?: Record<string, unknown>;
      merge?: boolean;
    }>
  ) => {
    for (const op of ops) {
      writes.push({
        path: op.ref.path,
        data: op.data ?? {},
        merge: op.merge === true,
        kind: op.op === "set" ? "set" : "update",
      });
    }
    commits += 1;
    return "acked";
  },
}));

import { increment } from "firebase/firestore";
import { postDueSubscriptionCharge } from "./duePost";
import type { DuePostAction } from "@/shared/utils/subscriptionProcessor";

const EXPENSE_ACTION: DuePostAction = {
  kind: "expense",
  subscriptionId: "sub-netflix",
  docId: "sub-netflix_2026-08",
  monthKey: "2026-08",
  expense: {
    amount: 649,
    category: "Entertainment",
    subcategory: "Subscriptions",
    note: "[Subscription] Netflix",
    date: "2026-08-10",
    month: "2026-08",
    accountId: "bank-1",
    subscriptionId: "sub-netflix",
    isRecurring: true,
    createdAt: "2026-08-10T00:00:00.000Z",
  },
  markCompleted: false,
};

beforeEach(() => {
  writes.length = 0;
  commits = 0;
  chargeExists = false;
  for (const key of Object.keys(accounts)) delete accounts[key];
});

const accountWrite = (id: string) =>
  writes.find((w) => w.path === `users/u1/accounts/${id}`);

describe("postDueSubscriptionCharge", () => {
  it("writes expense and lastProcessed in one batch on a deterministic id", async () => {
    const result = await postDueSubscriptionCharge("u1", EXPENSE_ACTION);

    expect(result).toMatchObject({
      status: "posted",
      docId: "sub-netflix_2026-08",
    });
    expect(commits).toBe(1);
    const expense = writes.find((w) => w.path.includes("/expenses/"));
    expect(expense?.path).toBe("users/u1/expenses/sub-netflix_2026-08");
    expect(expense?.merge).toBe(true);
    expect(expense?.data).toMatchObject({
      amount: 649,
      accountId: "bank-1",
      subscriptionId: "sub-netflix",
    });
    expect(expense?.data).not.toHaveProperty("undefined");
    const stamp = writes.find((w) => w.path.includes("/subscriptions/"));
    expect(stamp?.data).toMatchObject({ lastProcessed: "2026-08" });
  });

  it("replays to the same expense path", async () => {
    await postDueSubscriptionCharge("u1", EXPENSE_ACTION);
    await postDueSubscriptionCharge("u1", EXPENSE_ACTION);
    const paths = writes
      .filter((w) => w.kind === "set" && w.path.includes("/expenses/"))
      .map((w) => w.path);
    expect(paths).toEqual([
      "users/u1/expenses/sub-netflix_2026-08",
      "users/u1/expenses/sub-netflix_2026-08",
    ]);
  });

  // SPENDLY-523: auto-posted charges must move the materialized balance.
  it("debits the expense's account in the same batch", async () => {
    await postDueSubscriptionCharge("u1", EXPENSE_ACTION);
    expect(commits).toBe(1);
    expect(accountWrite("bank-1")?.data.currentBalance).toEqual(
      increment(-649)
    );
  });

  it("raises a card's outstanding when the subscription is charged to a card", async () => {
    accounts["card-1"] = { isCreditCard: true, oldBalance: 0, oldOutstanding: 500, needsInitialization: false };
    await postDueSubscriptionCharge("u1", {
      ...EXPENSE_ACTION,
      expense: { ...EXPENSE_ACTION.expense, accountId: "card-1" },
    });
    expect(accountWrite("card-1")?.data.currentOutstanding).toEqual(increment(649));
  });

  it("moves both accounts for a recurring transfer", async () => {
    await postDueSubscriptionCharge("u1", {
      kind: "transfer",
      subscriptionId: "sub-sip",
      docId: "sub-sip_2026-08",
      monthKey: "2026-08",
      transfer: {
        fromAccountId: "bank-1",
        toAccountId: "bank-2",
        amount: 5000,
        date: "2026-08-05",
        note: "[Auto-Transfer] SIP",
        subscriptionId: "sub-sip",
        recurringTransfer: true,
      },
      markCompleted: false,
    });
    expect(accountWrite("bank-1")?.data.currentBalance).toEqual(increment(-5000));
    expect(accountWrite("bank-2")?.data.currentBalance).toEqual(increment(5000));
  });

  it("does not apply the balance again when the charge doc already exists", async () => {
    chargeExists = true;
    const result = await postDueSubscriptionCharge("u1", EXPENSE_ACTION);
    expect(result.status).toBe("already_posted");
    expect(commits).toBe(1);
    expect(writes.some((w) => w.path.startsWith("users/u1/accounts/"))).toBe(false);
  });

  // SPENDLY-525: a client planning from a stale subscription (old account
  // SBI) re-posted a charge already posted on HDFC; `merge` moved it to SBI.
  it("never rewrites an existing charge, even from a stale payload", async () => {
    chargeExists = true;
    const result = await postDueSubscriptionCharge("u1", {
      ...EXPENSE_ACTION,
      expense: { ...EXPENSE_ACTION.expense, accountId: "sbi-stale" },
    });

    expect(result.status).toBe("already_posted");
    expect(writes.some((w) => w.path.includes("/expenses/"))).toBe(false);
    expect(writes.some((w) => w.path.startsWith("users/u1/accounts/"))).toBe(false);
    const stamp = writes.find((w) => w.path.includes("/subscriptions/"));
    expect(stamp?.data).toEqual({ lastProcessed: "2026-08" });
  });

  it("never rewrites an existing recurring transfer either", async () => {
    chargeExists = true;
    await postDueSubscriptionCharge("u1", {
      kind: "transfer",
      subscriptionId: "sub-sip",
      docId: "sub-sip_2026-08",
      monthKey: "2026-08",
      transfer: {
        fromAccountId: "bank-old",
        toAccountId: "bank-2",
        amount: 5000,
        date: "2026-08-05",
        note: "[Auto-Transfer] SIP",
      },
      markCompleted: false,
    });
    expect(writes.some((w) => w.path.includes("/accountTransfers/"))).toBe(false);
    expect(writes.some((w) => w.path.startsWith("users/u1/accounts/"))).toBe(false);
  });

  it("skips a charge with no account so later subscriptions can still post", async () => {
    const result = await postDueSubscriptionCharge("u1", {
      ...EXPENSE_ACTION,
      expense: { ...EXPENSE_ACTION.expense, accountId: undefined },
    });
    expect(result.status).toBe("skipped_no_account");
    expect(commits).toBe(0);
    expect(writes).toHaveLength(0);
  });

  it("drops undefined fields so Firestore does not throw", async () => {
    await postDueSubscriptionCharge("u1", {
      ...EXPENSE_ACTION,
      expense: { ...EXPENSE_ACTION.expense, subcategory: undefined },
    });
    const expense = writes.find((w) => w.path.includes("/expenses/"));
    expect(expense?.data).not.toHaveProperty("subcategory");
  });
});
