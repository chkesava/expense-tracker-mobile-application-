import { beforeEach, describe, expect, it, vi } from "vitest";

type FakeRef = { path: string };
type Write = {
  path: string;
  data: Record<string, unknown>;
  kind: "set" | "update";
};

const docs = new Map<string, Record<string, unknown>>();

vi.mock("firebase/firestore", () => ({
  doc: (dbOrRef: unknown, ...segments: string[]) => {
    if (
      segments.length === 0 &&
      dbOrRef &&
      typeof dbOrRef === "object" &&
      "path" in dbOrRef
    ) {
      return { path: `${(dbOrRef as FakeRef).path}/evt-1` };
    }
    return { path: segments.join("/") };
  },
  collection: (_db: unknown, ...segments: string[]) => ({
    path: segments.join("/"),
  }),
  getDoc: vi.fn(async (ref: FakeRef) => ({
    exists: () => docs.has(ref.path),
    data: () => docs.get(ref.path),
  })),
  increment: (n: number) => ({ __increment: n }),
  serverTimestamp: () => ({ __serverTimestamp: true }),
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

import { writeBatch } from "firebase/firestore";

import {
  ALREADY_REMOVED_LEDGER_MESSAGE,
  PAST_MONTH_LOCKED_MESSAGE,
  SPLIT_OWNED_LEDGER_MESSAGE,
  softDeleteExpense,
  softDeleteIncome,
  updateExpense,
  updateIncome,
} from "./mutateLedgerTransaction";

let writes: Write[] = [];
let commits = 0;

function installBatchRecorder() {
  vi.mocked(writeBatch).mockImplementation(
    () =>
      ({
        set: (ref: FakeRef, data: Record<string, unknown>) => {
          writes.push({ path: ref.path, data, kind: "set" });
          docs.set(ref.path, { ...(docs.get(ref.path) ?? {}), ...data });
        },
        update: (ref: FakeRef, data: Record<string, unknown>) => {
          writes.push({ path: ref.path, data, kind: "update" });
          docs.set(ref.path, { ...(docs.get(ref.path) ?? {}), ...data });
        },
        commit: async () => {
          commits += 1;
        },
      }) as never
  );
}

const EXPENSE = {
  amount: 5000,
  category: "Food",
  subcategory: "Groceries",
  date: "2026-09-01",
  month: "2026-09",
  accountId: "bank-1",
  note: "Lunch",
  tags: ["work"],
  tripId: "trip-1",
  smsFingerprint: "sms-abc",
};

const INCOME = {
  amount: 2000,
  source: "Salary",
  date: "2026-09-01",
  month: "2026-09",
  accountId: "bank-1",
  note: "Pay",
};

beforeEach(() => {
  docs.clear();
  writes = [];
  commits = 0;
  installBatchRecorder();
  docs.set("users/u1/expenses/exp-1", { ...EXPENSE });
  docs.set("users/u1/incomes/inc-1", { ...INCOME });
  docs.set("users/u1/trips/trip-1", { spentAmount: 5000 });
});

describe("updateExpense", () => {
  it("writes the live row and an event in one commit", async () => {
    await updateExpense("u1", "exp-1", {
      amount: 500,
      category: "Food",
      subcategory: "Groceries",
      date: "2026-09-01",
      month: "2026-09",
      accountId: "bank-1",
      note: "Lunch",
      tags: ["work"],
    });

    expect(commits).toBe(1);
    const expenseWrite = writes.find(
      (write) => write.path === "users/u1/expenses/exp-1"
    );
    const eventWrite = writes.find((write) =>
      write.path.startsWith("users/u1/ledgerEvents/")
    );
    expect(expenseWrite?.data.amount).toBe(500);
    expect(expenseWrite?.data.smsFingerprint).toBeUndefined();
    expect(eventWrite?.kind).toBe("set");
    expect(eventWrite?.data).toMatchObject({
      kind: "expense",
      docId: "exp-1",
      action: "update",
      actorUid: "u1",
      before: { amount: 5000, tripId: "trip-1" },
      after: { amount: 500, tripId: "trip-1" },
    });
  });

  it("increments trip spend by the amount delta", async () => {
    await updateExpense("u1", "exp-1", {
      amount: 500,
      category: "Food",
      subcategory: "Groceries",
      date: "2026-09-01",
      month: "2026-09",
      accountId: "bank-1",
      note: "Lunch",
      tags: [],
    });

    const tripWrite = writes.find(
      (write) => write.path === "users/u1/trips/trip-1"
    );
    expect(tripWrite?.data.spentAmount).toEqual({ __increment: -4500 });
  });

  it("does not strip smsFingerprint from the live document", async () => {
    await updateExpense("u1", "exp-1", {
      amount: 5000,
      category: "Travel",
      subcategory: "Other",
      date: "2026-09-01",
      month: "2026-09",
      accountId: "bank-1",
      note: "Taxi",
      tags: [],
    });

    expect(docs.get("users/u1/expenses/exp-1")?.smsFingerprint).toBe("sms-abc");
    expect(docs.get("users/u1/expenses/exp-1")?.tripId).toBe("trip-1");
  });

  it("refuses a split-owned expense", async () => {
    docs.set("users/u1/expenses/exp-1", { ...EXPENSE, splitId: "split-1" });
    await expect(
      updateExpense("u1", "exp-1", {
        amount: 1,
        category: "Food",
        subcategory: "Other",
        date: "2026-09-01",
        month: "2026-09",
        accountId: "bank-1",
        note: "",
        tags: [],
      })
    ).rejects.toThrow(SPLIT_OWNED_LEDGER_MESSAGE);
    expect(commits).toBe(0);
  });

  it("throws when the id is missing", async () => {
    await expect(
      updateExpense("u1", "  ", {
        amount: 1,
        category: "Food",
        subcategory: "Other",
        date: "2026-09-01",
        month: "2026-09",
        accountId: null,
        note: "",
        tags: [],
      })
    ).rejects.toThrow("missing id");
  });
});

describe("softDeleteExpense", () => {
  it("sets deletedAt instead of deleting the document", async () => {
    await softDeleteExpense("u1", "exp-1");

    expect(commits).toBe(1);
    const expenseWrite = writes.find(
      (write) => write.path === "users/u1/expenses/exp-1"
    );
    const eventWrite = writes.find((write) =>
      write.path.startsWith("users/u1/ledgerEvents/")
    );
    expect(expenseWrite?.kind).toBe("update");
    expect(typeof expenseWrite?.data.deletedAt).toBe("string");
    expect(expenseWrite?.data.deletedBy).toBe("u1");
    expect(eventWrite?.data).toMatchObject({
      action: "delete",
      after: null,
      before: { amount: 5000 },
    });
    expect(docs.has("users/u1/expenses/exp-1")).toBe(true);
  });

  it("increments trip spend by the negative amount", async () => {
    await softDeleteExpense("u1", "exp-1");
    const tripWrite = writes.find(
      (write) => write.path === "users/u1/trips/trip-1"
    );
    expect(tripWrite?.data.spentAmount).toEqual({ __increment: -5000 });
  });

  it("refuses a split-owned expense", async () => {
    docs.set("users/u1/expenses/exp-1", { ...EXPENSE, splitId: "split-1" });
    await expect(softDeleteExpense("u1", "exp-1")).rejects.toThrow(
      SPLIT_OWNED_LEDGER_MESSAGE
    );
    expect(commits).toBe(0);
  });

  it("refuses a row that is already removed", async () => {
    docs.set("users/u1/expenses/exp-1", {
      ...EXPENSE,
      deletedAt: "2026-09-17T00:00:00.000Z",
    });
    await expect(softDeleteExpense("u1", "exp-1")).rejects.toThrow(
      ALREADY_REMOVED_LEDGER_MESSAGE
    );
  });

  it("refuses a past-month delete when months are locked", async () => {
    docs.set("users/u1/expenses/exp-1", {
      ...EXPENSE,
      date: "2020-01-01",
      month: "2020-01",
    });
    await expect(
      softDeleteExpense("u1", "exp-1", {
        lockPastMonths: true,
        timezone: "UTC",
      })
    ).rejects.toThrow(PAST_MONTH_LOCKED_MESSAGE);
    expect(commits).toBe(0);
  });
});

describe("income mutations", () => {
  it("updates income with an event and no trip write", async () => {
    await updateIncome("u1", "inc-1", {
      amount: 2500,
      source: "Freelance",
      date: "2026-09-01",
      month: "2026-09",
      accountId: "bank-1",
      note: "Pay",
    });
    expect(commits).toBe(1);
    expect(
      writes.some((write) => write.path === "users/u1/trips/trip-1")
    ).toBe(false);
    const eventWrite = writes.find((write) =>
      write.path.startsWith("users/u1/ledgerEvents/")
    );
    expect(eventWrite?.data).toMatchObject({
      kind: "income",
      action: "update",
      before: { amount: 2000, source: "Salary" },
      after: { amount: 2500, source: "Freelance" },
    });
  });

  it("soft-deletes income", async () => {
    await softDeleteIncome("u1", "inc-1");
    const incomeWrite = writes.find(
      (write) => write.path === "users/u1/incomes/inc-1"
    );
    expect(typeof incomeWrite?.data.deletedAt).toBe("string");
  });
});
