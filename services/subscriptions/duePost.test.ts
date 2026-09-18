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
  writeBatch: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({
  getFirestoreDb: () => ({ __db: true }),
}));

const writes: Write[] = [];
let commits = 0;

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
});

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
    const paths = writes.filter((w) => w.kind === "set").map((w) => w.path);
    expect(paths).toEqual([
      "users/u1/expenses/sub-netflix_2026-08",
      "users/u1/expenses/sub-netflix_2026-08",
    ]);
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
