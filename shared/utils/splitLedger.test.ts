import { describe, expect, it } from "vitest";
import type { Participant, Split } from "@/shared/types/split";
import { containsUndefined } from "./firestorePayload";
import {
  applyShareRequestsToParticipants,
  buildCollectShareRequests,
  buildCreateSplitPayload,
  buildMarkCollectedWrites,
  buildSpendGiftWrites,
  buildUnmarkCollectedWrites,
  linkedLedgerIds,
  toFirestoreParticipant,
  withParticipantKeys,
} from "./splitLedger";
import { calculateEqualSplits } from "./splitMath";

function collectPot(overrides: Partial<Split> = {}): Split {
  const participants: Participant[] = [
    {
      key: "you",
      name: "You",
      amount: 1000,
      paid: true,
      isCurrentUser: true,
    },
    {
      key: "alice",
      name: "Alice",
      amount: 1000,
      paid: false,
      isCurrentUser: false,
    },
    {
      key: "bob",
      name: "Bob",
      amount: 1000,
      paid: false,
      isCurrentUser: false,
    },
  ];
  return {
    id: "split-1",
    title: "Wedding gift",
    totalAmount: 3000,
    splitType: "equal",
    participants,
    createdBy: "user-me",
    createdAt: 1,
    settled: false,
    participantIds: ["user-me"],
    kind: "collect",
    status: "collecting",
    category: "Gifts & Donations",
    ...overrides,
  };
}

describe("buildCreateSplitPayload", () => {
  it("omits undefined participant fields so Firestore can accept the write", () => {
    const parts = calculateEqualSplits(1000, [
      { name: "You", isCurrentUser: true },
      { name: "Alice", isCurrentUser: false },
    ]);
    const { split, expense } = buildCreateSplitPayload({
      uid: "user-me",
      createdByName: "Kesava",
      createdAt: 1,
      data: {
        title: "Dinner",
        totalAmount: 1000,
        splitType: "equal",
        participants: parts,
        kind: "bill",
      },
      options: { createPersonalExpense: true },
      dateKey: "2026-08-19",
      monthKey: "2026-08",
      splitId: "s1",
    });

    expect(containsUndefined(split)).toBe(false);
    expect(expense).not.toBeNull();
    expect(containsUndefined(expense)).toBe(false);
    expect(expense).not.toHaveProperty("accountId");
    expect(split.kind).toBe("bill");
    expect(split).not.toHaveProperty("status");
  });

  it("does not create an expense for collect pots, even if the toggle is on", () => {
    const parts = calculateEqualSplits(4000, [
      { name: "You", isCurrentUser: true, key: "you" },
      { name: "Rahul", isCurrentUser: false, key: "rahul" },
    ]);
    const { split, expense } = buildCreateSplitPayload({
      uid: "user-me",
      createdByName: "Kesava",
      createdAt: 1,
      data: {
        title: "Rahul wedding",
        totalAmount: 4000,
        splitType: "equal",
        participants: parts,
        kind: "collect",
        category: "Gifts & Donations",
      },
      options: { createPersonalExpense: true, accountId: "hdfc" },
      dateKey: "2026-08-19",
      monthKey: "2026-08",
      splitId: "s2",
    });

    expect(expense).toBeNull();
    expect(split.kind).toBe("collect");
    expect(split.status).toBe("collecting");
    expect(split.settled).toBe(false);
    expect(containsUndefined(split)).toBe(false);
    const you = (split.participants as Record<string, unknown>[])[0];
    expect(you.paid).toBe(true);
    expect(you).not.toHaveProperty("receivedAccountId");
  });

  it("logs the creator share as an expense for bill splits when requested", () => {
    const { expense } = buildCreateSplitPayload({
      uid: "user-me",
      createdByName: "Kesava",
      createdAt: 1,
      data: {
        title: "BBQ",
        totalAmount: 600,
        splitType: "equal",
        kind: "bill",
        category: "Food & Dining",
        participants: [
          { name: "You", amount: 300, paid: true, isCurrentUser: true, key: "you" },
          { name: "Bob", amount: 300, paid: false, isCurrentUser: false, key: "bob" },
        ],
      },
      options: { createPersonalExpense: true, accountId: "sbi" },
      dateKey: "2026-08-19",
      monthKey: "2026-08",
      splitId: "s3",
    });

    expect(expense).toMatchObject({
      amount: 300,
      accountId: "sbi",
      splitId: "s3",
      note: "[Split Share] BBQ",
    });
  });
});

describe("toFirestoreParticipant", () => {
  it("never emits undefined optional fields", () => {
    const payload = toFirestoreParticipant({
      name: "Alice",
      amount: 50,
      paid: false,
      isCurrentUser: false,
    });
    expect(payload.key).toEqual(expect.any(String));
    expect(payload).not.toHaveProperty("userId");
    expect(payload).not.toHaveProperty("upiId");
    expect(payload).not.toHaveProperty("photoURL");
    expect(containsUndefined(payload)).toBe(false);
  });
});

describe("collect share requests", () => {
  it("builds one payment request per friend using the organizer UPI", () => {
    const participants = withParticipantKeys(collectPot().participants);
    const requests = buildCollectShareRequests({
      splitId: "split-1",
      splitTitle: "Wedding gift",
      createdBy: "user-me",
      createdAt: 1,
      payeeName: "Kesava",
      upiId: "kesava@okaxis",
      qrStyleId: "indigo",
      participants,
    });
    expect(requests).toHaveLength(2);
    expect(requests.every((r) => r.payload.upiId === "kesava@okaxis")).toBe(true);
    expect(requests.every((r) => r.payload.splitId === "split-1")).toBe(true);
    expect(requests.map((r) => r.payload.amount)).toEqual([1000, 1000]);
    requests.forEach((r) => expect(containsUndefined(r.payload)).toBe(false));

    const applied = applyShareRequestsToParticipants(
      participants,
      requests.map((r, i) => ({
        participantKey: r.participantKey,
        slug: r.slug,
        requestId: `req-${i}`,
      }))
    );
    expect(applied[1].paymentSlug).toBe(requests[0].slug);
    expect(applied[2].paymentRequestId).toBe("req-1");
    expect(applied[0].paymentSlug).toBeUndefined();
  });
});

describe("mark / unmark collected", () => {
  it("credits the receiving account and does not treat the organizer as a collection", () => {
    const marked = buildMarkCollectedWrites({
      split: collectPot(),
      participantKey: "alice",
      accountId: "hdfc",
      entryId: "entry-1",
      dateKey: "2026-08-19",
    });
    expect("error" in marked).toBe(false);
    if ("error" in marked) return;
    expect(marked.participants[1].paid).toBe(true);
    expect(marked.participants[1].receivedAccountId).toBe("hdfc");
    expect(marked.participants[1].collectedEntryId).toBe("entry-1");
    expect(marked.entry).toMatchObject({
      accountId: "hdfc",
      amount: 1000,
      direction: "credit",
      source: "split_collection",
      linkedSplitId: "split-1",
    });
    expect(containsUndefined(marked.entry)).toBe(false);

    const self = buildMarkCollectedWrites({
      split: collectPot(),
      participantKey: "you",
      accountId: "hdfc",
      entryId: "entry-x",
      dateKey: "2026-08-19",
    });
    expect("error" in self).toBe(true);
  });

  it("unmark deletes the credit entry id", () => {
    const split = collectPot({
      participants: [
        { key: "you", name: "You", amount: 1000, paid: true, isCurrentUser: true },
        {
          key: "alice",
          name: "Alice",
          amount: 1000,
          paid: true,
          isCurrentUser: false,
          receivedAccountId: "hdfc",
          collectedEntryId: "entry-1",
        },
        { key: "bob", name: "Bob", amount: 1000, paid: false, isCurrentUser: false },
      ],
    });
    const unmarked = buildUnmarkCollectedWrites({
      split,
      participantKey: "alice",
    });
    expect("error" in unmarked).toBe(false);
    if ("error" in unmarked) return;
    expect(unmarked.entryIdToDelete).toBe("entry-1");
    expect(unmarked.participants[1].paid).toBe(false);
    expect(unmarked.participants[1].collectedEntryId).toBeUndefined();
  });
});

describe("spend gift writes", () => {
  it("records only the organizer out-of-pocket as an expense plus a pass-through debit", () => {
    const split = collectPot({
      participants: [
        { key: "you", name: "You", amount: 1000, paid: true, isCurrentUser: true },
        {
          key: "alice",
          name: "Alice",
          amount: 1000,
          paid: true,
          isCurrentUser: false,
          receivedAccountId: "hdfc",
          collectedEntryId: "e1",
        },
        {
          key: "bob",
          name: "Bob",
          amount: 1000,
          paid: true,
          isCurrentUser: false,
          receivedAccountId: "hdfc",
          collectedEntryId: "e2",
        },
      ],
    });

    const spent = buildSpendGiftWrites({
      split,
      spendAmount: 3000,
      payingAccountId: "hdfc",
      dateKey: "2026-08-19",
      monthKey: "2026-08",
      expenseId: "exp-1",
      passThroughEntryId: "pass-1",
    });
    expect("error" in spent).toBe(false);
    if ("error" in spent) return;
    expect(spent.expense).toMatchObject({
      amount: 1000,
      accountId: "hdfc",
      splitId: "split-1",
    });
    expect(spent.passThroughEntry).toMatchObject({
      amount: 2000,
      direction: "debit",
      source: "split_spend",
      accountId: "hdfc",
    });
    expect(spent.splitUpdates.status).toBe("spent");
    expect(spent.splitUpdates.settled).toBe(true);
    expect(containsUndefined(spent.splitUpdates)).toBe(false);
    expect(containsUndefined(spent.expense)).toBe(false);
    expect(containsUndefined(spent.passThroughEntry)).toBe(false);
  });

  it("skips the expense when friends fully funded a cheaper gift", () => {
    const split = collectPot({
      participants: [
        { key: "you", name: "You", amount: 1000, paid: true, isCurrentUser: true },
        {
          key: "alice",
          name: "Alice",
          amount: 1000,
          paid: true,
          isCurrentUser: false,
          collectedEntryId: "e1",
        },
        {
          key: "bob",
          name: "Bob",
          amount: 1000,
          paid: true,
          isCurrentUser: false,
          collectedEntryId: "e2",
        },
      ],
    });
    const spent = buildSpendGiftWrites({
      split,
      spendAmount: 1800,
      payingAccountId: "hdfc",
      dateKey: "2026-08-19",
      monthKey: "2026-08",
      expenseId: "exp-1",
      passThroughEntryId: "pass-1",
    });
    expect("error" in spent).toBe(false);
    if ("error" in spent) return;
    expect(spent.expense).toBeNull();
    expect(spent.passThroughEntry).toMatchObject({ amount: 1800 });
    expect(spent.splitUpdates).not.toHaveProperty("spentExpenseId");
  });

  it("refuses a second spend", () => {
    const spent = buildSpendGiftWrites({
      split: collectPot({ status: "spent" }),
      spendAmount: 3000,
      payingAccountId: "hdfc",
      dateKey: "2026-08-19",
      monthKey: "2026-08",
      expenseId: "exp-1",
      passThroughEntryId: "pass-1",
    });
    expect(spent).toEqual({ error: "This pot has already been spent." });
  });
});

describe("linkedLedgerIds", () => {
  it("collects entry, expense, and payment request ids for delete", () => {
    const ids = linkedLedgerIds(
      collectPot({
        spentExpenseId: "exp-1",
        spendPassThroughEntryId: "pass-1",
        paymentRequestIds: ["pr-1"],
        participants: [
          { key: "you", name: "You", amount: 1000, paid: true, isCurrentUser: true },
          {
            key: "alice",
            name: "Alice",
            amount: 1000,
            paid: true,
            isCurrentUser: false,
            collectedEntryId: "e1",
            paymentRequestId: "pr-2",
          },
        ],
      })
    );
    expect(ids.entryIds.sort()).toEqual(["e1", "pass-1"]);
    expect(ids.expenseIds).toEqual(["exp-1"]);
    expect(ids.paymentRequestIds.sort()).toEqual(["pr-1", "pr-2"]);
  });
});
