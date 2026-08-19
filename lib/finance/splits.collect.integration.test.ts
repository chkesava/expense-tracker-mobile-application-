import { describe, expect, it } from "vitest";
import type { Account, AccountEntry, Expense } from "@/shared/types/expense";
import { computeBankBalance } from "@/shared/utils/accountBalance";
import type { Split } from "@/shared/types/split";
import {
  buildCreateSplitPayload,
  buildMarkCollectedWrites,
  buildSpendGiftWrites,
} from "@/shared/utils/splitLedger";
import { computeCollectSpendBreakdown } from "@/shared/utils/splitMath";

const hdfc: Account = {
  id: "hdfc",
  name: "HDFC",
  typeId: "bank",
  openingBalance: 10000,
  balanceAsOfDate: "2026-01-01",
};

function asExpense(
  payload: Record<string, unknown>,
  id: string
): Expense {
  return {
    id,
    amount: payload.amount as number,
    category: payload.category as string,
    note: payload.note as string,
    date: payload.date as string,
    month: payload.month as string,
    accountId: payload.accountId as string | undefined,
    splitId: payload.splitId as string | undefined,
    createdAt: 1,
  };
}

function asEntry(
  payload: Record<string, unknown>,
  id: string
): AccountEntry {
  return {
    id,
    accountId: payload.accountId as string,
    amount: payload.amount as number,
    direction: payload.direction as "credit" | "debit",
    date: payload.date as string,
    note: payload.note as string,
    linkedSplitId: payload.linkedSplitId as string | undefined,
    source: payload.source as AccountEntry["source"],
  };
}

describe("collect-then-spend ledger vs bank balance", () => {
  it("does not debit the organizer on create", () => {
    const { expense } = buildCreateSplitPayload({
      uid: "user-me",
      createdByName: "Me",
      createdAt: 1,
      data: {
        title: "Wedding gift",
        totalAmount: 4000,
        splitType: "equal",
        kind: "collect",
        participants: [
          { name: "You", amount: 1000, paid: true, isCurrentUser: true, key: "you" },
          { name: "A", amount: 1000, paid: false, isCurrentUser: false, key: "a" },
          { name: "B", amount: 1000, paid: false, isCurrentUser: false, key: "b" },
          { name: "C", amount: 1000, paid: false, isCurrentUser: false, key: "c" },
        ],
      },
      options: { createPersonalExpense: true, accountId: "hdfc" },
      dateKey: "2026-08-01",
      monthKey: "2026-08",
      splitId: "s1",
    });
    expect(expense).toBeNull();
    expect(computeBankBalance(hdfc, [], [])).toBe(10000);
  });

  it("credits collections without income, then nets to the organizer share after the gift", () => {
    const base: Split = {
      id: "s1",
      title: "Wedding gift",
      totalAmount: 4000,
      splitType: "equal",
      createdBy: "user-me",
      createdAt: 1,
      settled: false,
      participantIds: ["user-me"],
      kind: "collect",
      status: "collecting",
      participants: [
        { key: "you", name: "You", amount: 1000, paid: true, isCurrentUser: true },
        { key: "a", name: "A", amount: 1000, paid: false, isCurrentUser: false },
        { key: "b", name: "B", amount: 1000, paid: false, isCurrentUser: false },
        { key: "c", name: "C", amount: 1000, paid: false, isCurrentUser: false },
      ],
    };

    const entries: AccountEntry[] = [];
    for (const key of ["a", "b", "c"]) {
      const marked = buildMarkCollectedWrites({
        split: { ...base, participants: base.participants.map((p) => ({ ...p })) },
        participantKey: key,
        accountId: "hdfc",
        entryId: `e-${key}`,
        dateKey: "2026-08-10",
      });
      if ("error" in marked) throw new Error(marked.error);
      entries.push(asEntry(marked.entry, `e-${key}`));
      base.participants = marked.participants;
    }

    expect(computeBankBalance(hdfc, [], [], [], entries)).toBe(13000);

    const breakdown = computeCollectSpendBreakdown(base, 4000);
    expect(breakdown.othersCollected).toBe(3000);
    expect(breakdown.ownExpense).toBe(1000);
    expect(breakdown.passThroughDebit).toBe(3000);

    const spent = buildSpendGiftWrites({
      split: base,
      spendAmount: 4000,
      payingAccountId: "hdfc",
      dateKey: "2026-08-20",
      monthKey: "2026-08",
      expenseId: "exp-1",
      passThroughEntryId: "pass-1",
    });
    if ("error" in spent) throw new Error(spent.error);

    const expenses = spent.expense ? [asExpense(spent.expense, "exp-1")] : [];
    if (spent.passThroughEntry) {
      entries.push(asEntry(spent.passThroughEntry, "pass-1"));
    }

    expect(expenses).toHaveLength(1);
    expect(expenses[0].amount).toBe(1000);
    expect(computeBankBalance(hdfc, expenses, [], [], entries)).toBe(9000);
  });
});
