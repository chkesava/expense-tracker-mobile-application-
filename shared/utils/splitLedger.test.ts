import { describe, expect, it } from "vitest";
import type { Participant, Split } from "@/shared/types/split";
import { containsUndefined } from "./firestorePayload";
import {
  applyShareRequestsToParticipants,
  buildCollectShareRequests,
  buildCreateSplitPayload,
  buildMarkCollectedWrites,
  buildParticipantShareRequests,
  buildPaymentRequestSyncPatches,
  buildSpendGiftWrites,
  buildUnmarkCollectedWrites,
  linkedLedgerIds,
  toFirestoreParticipant,
  withParticipantKeys,
} from "./splitLedger";
import { buildSplitPublicSharePayloadFromSplit } from "./splitPublicShare";
import { calculateEqualSplits, participantRemainingDue, recalibrateSplitAfterOptOut } from "./splitMath";

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
        publicSlug: "pub-1",
        publicShareId: "share-1",
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
    expect(split.publicSlug).toBe("pub-1");
    expect(split.publicShareId).toBe("share-1");
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
    expect(marked.participants[1].paidAmount).toBe(1000);
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

  it("credits only the remaining due when collecting a top-up after shares increase", () => {
    const split = collectPot({
      participants: [
        { key: "you", name: "You", amount: 125, paid: false, paidAmount: 100, isCurrentUser: true },
        {
          key: "alice",
          name: "Alice",
          amount: 125,
          paid: false,
          paidAmount: 100,
          isCurrentUser: false,
          receivedAccountId: "hdfc",
          collectedEntryId: "entry-1",
        },
      ],
    });
    const marked = buildMarkCollectedWrites({
      split,
      participantKey: "alice",
      accountId: "hdfc",
      entryId: "entry-2",
      dateKey: "2026-08-19",
    });
    expect("error" in marked).toBe(false);
    if ("error" in marked) return;
    expect(marked.entry.amount).toBe(25);
    expect(marked.participants[1].paidAmount).toBe(125);
    expect(marked.participants[1].paid).toBe(true);
    expect(marked.participants[1].collectedEntryIds).toEqual(["entry-1", "entry-2"]);
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
    expect(unmarked.entryIdsToDelete).toEqual(["entry-1"]);
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
    expect(ids.publicShareId).toBeUndefined();
  });
});

describe("bill share requests and public snapshot", () => {
  it("builds person payment requests for bill splits the same way as collect", () => {
    const participants = withParticipantKeys([
      { key: "you", name: "You", amount: 500, paid: true, isCurrentUser: true },
      { key: "alice", name: "Alice", amount: 500, paid: false, isCurrentUser: false },
    ]);
    const requests = buildParticipantShareRequests({
      splitId: "bill-1",
      splitTitle: "Dinner",
      createdBy: "user-me",
      createdAt: 1,
      payeeName: "Kesava",
      upiId: "kesava@okaxis",
      qrStyleId: "indigo",
      participants,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].payload.amount).toBe(500);
    expect(requests[0].payload.shareAmount).toBe(500);
    expect(requests[0].payload.splitId).toBe("bill-1");
  });

  it("writes a sanitized public snapshot and updates remaining-due amounts after opt-out", () => {
    const split: Split = {
      id: "split-1",
      title: "Dinner",
      totalAmount: 1000,
      splitType: "equal",
      createdBy: "user-me",
      createdByName: "Kesava",
      createdAt: 1,
      settled: false,
      participantIds: ["user-me"],
      kind: "bill",
      publicSlug: "dinner42",
      publicShareId: "share-1",
      participants: [
        {
          key: "you",
          name: "You",
          amount: 100,
          paid: true,
          paidAmount: 100,
          isCurrentUser: true,
        },
        {
          key: "alice",
          name: "Alice",
          amount: 100,
          paid: true,
          paidAmount: 100,
          isCurrentUser: false,
          paymentSlug: "alice-pay",
          paymentRequestId: "pr-alice",
        },
        {
          key: "bob",
          name: "Bob",
          amount: 100,
          paid: false,
          paidAmount: 0,
          isCurrentUser: false,
          paymentSlug: "bob-pay",
          paymentRequestId: "pr-bob",
        },
      ],
    };

    const snapshot = buildSplitPublicSharePayloadFromSplit(split);
    expect(containsUndefined(snapshot)).toBe(false);
    expect(snapshot.slug).toBe("dinner42");
    expect(snapshot).not.toHaveProperty("upiId");
    const rows = snapshot.participants as Record<string, unknown>[];
    expect(rows[1]).not.toHaveProperty("userId");
    expect(rows[1]).not.toHaveProperty("paymentRequestId");
    expect(rows[1].personSlug).toBe("alice-pay");

    const dropped = recalibrateSplitAfterOptOut(split, "bob");
    expect("error" in dropped).toBe(false);
    if ("error" in dropped) return;
    const patches = buildPaymentRequestSyncPatches(dropped.participants);
    const alice = patches.find((p) => p.requestId === "pr-alice");
    const bob = patches.find((p) => p.requestId === "pr-bob");
    expect(alice?.fields.amount).toBe(participantRemainingDue(dropped.participants[1]));
    expect(alice?.fields.status).toBe("active");
    expect(bob?.fields.status).toBe("cancelled");
    expect(bob?.fields.amount).toBe(0);
  });

  describe("currency and share-raised threading", () => {
    function payParticipants(): Participant[] {
      return [
        { key: "you", name: "You", amount: 100, paid: true, paidAmount: 100, isCurrentUser: true },
        { key: "alice", name: "Alice", amount: 100, paid: false, paidAmount: 0, isCurrentUser: false },
        {
          key: "bob",
          name: "Bob",
          amount: 100,
          paid: false,
          paidAmount: 0,
          isCurrentUser: false,
          paymentRequestId: "pr-bob",
          paymentSlug: "bob-pay",
        },
        {
          key: "dana",
          name: "Dana",
          amount: 100,
          paid: false,
          paidAmount: 0,
          isCurrentUser: false,
          paymentSlug: "dana-pay",
        },
      ];
    }

    const shareParams = {
      splitId: "s1",
      splitTitle: "Dinner",
      createdBy: "me",
      createdAt: 1,
      payeeName: "Kesava",
      upiId: "me@upi",
      qrStyleId: "indigo" as const,
    };

    it("round-trips shareRaised and omits it when absent", () => {
      const raised = toFirestoreParticipant({
        key: "a",
        name: "A",
        amount: 125,
        paid: false,
        paidAmount: 100,
        isCurrentUser: false,
        shareRaised: true,
      });
      expect(raised.shareRaised).toBe(true);

      const plain = toFirestoreParticipant({
        key: "b",
        name: "B",
        amount: 100,
        paid: false,
        isCurrentUser: false,
      });
      expect(plain).not.toHaveProperty("shareRaised");
      expect(containsUndefined(plain)).toBe(false);
    });

    it("puts the currency on every sync patch, and omits the key without one", () => {
      const withCurrency = buildPaymentRequestSyncPatches(payParticipants(), {
        currency: "USD",
      });
      expect(withCurrency).toHaveLength(1);
      expect(withCurrency[0].fields.currency).toBe("USD");

      const without = buildPaymentRequestSyncPatches(payParticipants());
      expect(without[0]).not.toHaveProperty("currency");
      expect(containsUndefined(without[0].fields)).toBe(false);
    });

    it("stamps the currency onto newly created share requests", () => {
      const requests = buildParticipantShareRequests({
        ...shareParams,
        currency: "USD",
        participants: payParticipants(),
      });
      expect(requests).toHaveLength(3);
      for (const r of requests) {
        expect(r.payload.currency).toBe("USD");
        expect(containsUndefined(r.payload)).toBe(false);
      }
    });

    it("skipExisting back-fills only the participants that have no link yet", () => {
      // Bob has a request id, Dana has only a slug — both already have a page.
      const requests = buildParticipantShareRequests({
        ...shareParams,
        skipExisting: true,
        participants: payParticipants(),
      });
      expect(requests.map((r) => r.participantKey)).toEqual(["alice"]);
    });

    it("skipExisting returns nothing once every participant is wired", () => {
      const wired = payParticipants().map((p) =>
        p.isCurrentUser ? p : { ...p, paymentRequestId: `pr-${p.key}` }
      );
      expect(
        buildParticipantShareRequests({
          ...shareParams,
          skipExisting: true,
          participants: wired,
        })
      ).toEqual([]);
    });

    it("still returns nothing without a UPI id, regardless of skipExisting", () => {
      // No UPI id means no pay page can exist. The caller has to say so.
      for (const skipExisting of [true, false]) {
        expect(
          buildParticipantShareRequests({
            ...shareParams,
            upiId: "",
            skipExisting,
            participants: payParticipants(),
          })
        ).toEqual([]);
      }
    });

    it("mints a distinct slug per participant across a back-fill", () => {
      const many: Participant[] = Array.from({ length: 5 }, (_, i) => ({
        key: `p${i}`,
        name: `P${i}`,
        amount: 100,
        paid: false,
        paidAmount: 0,
        isCurrentUser: false,
      }));
      const requests = buildParticipantShareRequests({
        ...shareParams,
        skipExisting: true,
        participants: many,
      });
      const slugs = requests.map((r) => r.slug);
      expect(slugs).toHaveLength(5);
      expect(new Set(slugs).size).toBe(5);
    });
  });
});
