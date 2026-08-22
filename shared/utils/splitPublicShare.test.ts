import { describe, expect, it } from "vitest";

import type { Participant, Split } from "@/shared/types/split";
import { containsUndefined } from "./firestorePayload";
import { recalibrateSplitAfterOptOut } from "./splitMath";
import {
  PUBLIC_FALLBACK_CURRENCY,
  buildSplitPublicSharePayload,
  buildSplitPublicSharePayloadFromSplit,
  publicClaimKeys,
  publicOptedOutNames,
  publicParticipantStatusLabel,
  publicShareCurrency,
  toPublicShareParticipant,
} from "./splitPublicShare";

function participant(over: Partial<Participant> & { name: string }): Participant {
  return {
    key: over.name.toLowerCase(),
    amount: 100,
    paid: false,
    paidAmount: 0,
    isCurrentUser: false,
    ...over,
  };
}

function makeSplit(participants: Participant[], over: Partial<Split> = {}): Split {
  return {
    id: "s1",
    title: "Dinner",
    totalAmount: participants.reduce((sum, p) => sum + p.amount, 0),
    splitType: "equal",
    createdBy: "me",
    createdByName: "Kesava",
    createdAt: 1,
    settled: false,
    participantIds: [],
    participants,
    ...over,
  };
}

const PRIVATE_FIELDS = [
  "upiId",
  "userId",
  "photoURL",
  "receivedAccountId",
  "collectedEntryId",
  "collectedEntryIds",
  "paymentRequestId",
];

describe("splitPublicShare", () => {
  describe("toPublicShareParticipant", () => {
    it("publishes the claim key and share-raised flag, and nothing private", () => {
      const row = toPublicShareParticipant(
        participant({
          name: "Alice",
          key: "p_alice",
          amount: 125,
          paidAmount: 100,
          upiId: "alice@upi",
          userId: "uid-alice",
          photoURL: "https://example.test/a.png",
          receivedAccountId: "acct-1",
          collectedEntryId: "entry-1",
          paymentRequestId: "pr-1",
          paymentSlug: "alice-pay",
          shareRaised: true,
        })
      );

      expect(row.claimKey).toBe("p_alice");
      expect(row.shareRaised).toBe(true);
      expect(row.personSlug).toBe("alice-pay");
      expect(row.remainingDue).toBe(25);
      for (const leaked of [...PRIVATE_FIELDS, "key"]) {
        expect(row).not.toHaveProperty(leaked);
      }
    });

    it("omits shareRaised rather than publishing false", () => {
      const row = toPublicShareParticipant(participant({ name: "Bob" }));
      expect(row).not.toHaveProperty("shareRaised");
    });
  });

  describe("publicClaimKeys", () => {
    it("covers only contributing, non-organizer participants that have a key", () => {
      const keys = publicClaimKeys([
        participant({ name: "You", key: "p_me", isCurrentUser: true }),
        participant({ name: "Alice", key: "p_alice" }),
        participant({ name: "Bob", key: "p_bob", contributing: false }),
        participant({ name: "Legacy", key: undefined }),
      ]);
      expect(keys).toEqual(["p_alice"]);
    });
  });

  describe("publicOptedOutNames", () => {
    it("lists dropouts in participant order", () => {
      expect(
        publicOptedOutNames([
          participant({ name: "Alice" }),
          participant({ name: "Bob", contributing: false }),
          participant({ name: "Dana", contributing: false }),
        ])
      ).toEqual(["Bob", "Dana"]);
    });
  });

  describe("publicParticipantStatusLabel", () => {
    const opts = { optedOutNames: ["Bob"], currency: "INR" };

    it("labels a dropout", () => {
      expect(
        publicParticipantStatusLabel(
          { paidAmount: 0, remainingDue: 0, optedOut: true },
          opts
        )
      ).toBe("Won't contribute");
    });

    it("labels a settled share as paid even when the share was raised", () => {
      expect(
        publicParticipantStatusLabel(
          { paidAmount: 125, remainingDue: 0, optedOut: false, shareRaised: true },
          opts
        )
      ).toBe("Paid");
    });

    it("names the top-up and who caused it when someone already paid", () => {
      const label = publicParticipantStatusLabel(
        { paidAmount: 100, remainingDue: 25, optedOut: false, shareRaised: true },
        opts
      );
      expect(label).toContain("Extra");
      expect(label).toContain("25");
      expect(label).toContain("Bob");
      expect(label).toContain("dropped out");
    });

    it("explains a raised share for someone who had not paid yet", () => {
      expect(
        publicParticipantStatusLabel(
          { paidAmount: 0, remainingDue: 125, optedOut: false, shareRaised: true },
          opts
        )
      ).toBe("Share went up after Bob dropped out");
    });

    it("distinguishes a genuine partial payment from a top-up", () => {
      expect(
        publicParticipantStatusLabel(
          { paidAmount: 40, remainingDue: 60, optedOut: false },
          opts
        )
      ).toBe("Paid part · remaining due");
    });

    it("falls back to unpaid", () => {
      expect(
        publicParticipantStatusLabel(
          { paidAmount: 0, remainingDue: 100, optedOut: false },
          opts
        )
      ).toBe("Unpaid");
    });

    it("collapses three or more dropouts", () => {
      expect(
        publicParticipantStatusLabel(
          { paidAmount: 0, remainingDue: 130, optedOut: false, shareRaised: true },
          { optedOutNames: ["Bob", "Dana", "Eve"], currency: "INR" }
        )
      ).toBe("Share went up after Bob and 2 others dropped out");
    });

    it("names two dropouts in full", () => {
      expect(
        publicParticipantStatusLabel(
          { paidAmount: 0, remainingDue: 130, optedOut: false, shareRaised: true },
          { optedOutNames: ["Bob", "Dana"], currency: "INR" }
        )
      ).toBe("Share went up after Bob and Dana dropped out");
    });

    it("takes the currency symbol from the argument, not a global default", () => {
      const label = publicParticipantStatusLabel(
        { paidAmount: 100, remainingDue: 25, optedOut: false, shareRaised: true },
        { optedOutNames: ["Bob"], currency: "USD" }
      );
      expect(label).toContain("$");
      expect(label).not.toContain("₹");
    });

    it("survives a snapshot written before optedOutNames existed", () => {
      expect(
        publicParticipantStatusLabel(
          { paidAmount: 0, remainingDue: 125, optedOut: false, shareRaised: true },
          { currency: "INR" }
        )
      ).toBe("Share went up after someone dropped out");
    });
  });

  describe("buildSplitPublicSharePayload", () => {
    const base = {
      splitId: "s1",
      slug: "dinner42",
      createdBy: "me",
      title: "Dinner",
      totalAmount: 1000,
      organizerName: "Kesava",
      settled: false,
      updatedAt: 1234,
    };

    it("carries the currency so an anonymous page never needs system settings", () => {
      const payload = buildSplitPublicSharePayload({
        ...base,
        currency: "USD",
        participants: [participant({ name: "Alice" })],
      });
      expect(payload.currency).toBe("USD");
      expect(containsUndefined(payload)).toBe(false);
    });

    it("omits currency entirely rather than writing undefined", () => {
      const payload = buildSplitPublicSharePayload({
        ...base,
        participants: [participant({ name: "Alice" })],
      });
      expect(payload).not.toHaveProperty("currency");
      expect(containsUndefined(payload)).toBe(false);
    });

    it("publishes the flat claim fields the Firestore rules need", () => {
      const payload = buildSplitPublicSharePayload({
        ...base,
        participants: [
          participant({ name: "You", key: "p_me", isCurrentUser: true }),
          participant({ name: "Alice", key: "p_alice" }),
          participant({ name: "Bob", key: "p_bob", contributing: false }),
        ],
      });
      expect(payload.claimKeys).toEqual(["p_alice"]);
      expect(payload.claimAmountMax).toBe(1000);
      expect(payload.claimsEnabled).toBe(true);
      expect(payload.optedOutNames).toEqual(["Bob"]);
    });

    it("honours an explicit claimsEnabled false so the organizer can revoke", () => {
      const payload = buildSplitPublicSharePayload({
        ...base,
        claimsEnabled: false,
        participants: [participant({ name: "Alice" })],
      });
      expect(payload.claimsEnabled).toBe(false);
    });
  });

  describe("buildSplitPublicSharePayloadFromSplit", () => {
    it("mirrors a raised share end to end after the drop-out the user described", () => {
      // 10 people at 100 each, 8 have paid, then 2 refuse to contribute.
      const participants: Participant[] = Array.from({ length: 10 }, (_, i) => ({
        key: `p${i}`,
        name: i === 0 ? "You" : `Friend ${i}`,
        amount: 100,
        paid: i < 8,
        paidAmount: i < 8 ? 100 : 0,
        isCurrentUser: i === 0,
      }));
      const original = makeSplit(participants, { totalAmount: 1000 });

      const first = recalibrateSplitAfterOptOut(original, "p8");
      expect("error" in first).toBe(false);
      if ("error" in first) return;
      const second = recalibrateSplitAfterOptOut(
        { ...original, participants: first.participants },
        "p9"
      );
      expect("error" in second).toBe(false);
      if ("error" in second) return;

      const payload = buildSplitPublicSharePayloadFromSplit(
        { ...original, participants: second.participants },
        { slug: "dinner42", currency: "INR", updatedAt: 99 }
      );

      expect(payload.optedOutNames).toEqual(["Friend 8", "Friend 9"]);
      const rows = payload.participants as Array<Record<string, unknown>>;

      // Everyone still in went from 100 to 125, so every one of them is flagged.
      const stillIn = rows.filter((r) => r.optedOut === false);
      expect(stillIn).toHaveLength(8);
      for (const row of stillIn) {
        expect(row.shareRaised).toBe(true);
        expect(row.amount).toBe(125);
      }

      // The eight who had already paid 100 now owe a 25 top-up, and the page
      // says so instead of calling them unpaid.
      const alreadyPaid = rows[1];
      expect(alreadyPaid.paidAmount).toBe(100);
      expect(alreadyPaid.remainingDue).toBe(25);
      const label = publicParticipantStatusLabel(alreadyPaid as never, {
        optedOutNames: payload.optedOutNames as string[],
        currency: "INR",
      });
      expect(label).toContain("Extra");
      expect(label).toContain("25");
      expect(label).toContain("Friend 8");

      // Dropouts keep their money recorded but owe nothing further.
      const dropped = rows[8];
      expect(dropped.optedOut).toBe(true);
      expect(dropped.remainingDue).toBe(0);
      expect(dropped).not.toHaveProperty("shareRaised");

      expect(containsUndefined(payload)).toBe(false);
    });

    it("never leaks private participant fields", () => {
      const payload = buildSplitPublicSharePayloadFromSplit(
        makeSplit([
          participant({
            name: "Alice",
            upiId: "alice@upi",
            userId: "uid-alice",
            receivedAccountId: "acct-1",
            collectedEntryId: "entry-1",
            paymentRequestId: "pr-1",
          }),
        ]),
        { slug: "dinner42" }
      );
      const rows = payload.participants as Array<Record<string, unknown>>;
      for (const leaked of PRIVATE_FIELDS) {
        expect(rows[0]).not.toHaveProperty(leaked);
        expect(payload).not.toHaveProperty(leaked);
      }
    });
  });

  describe("publicShareCurrency", () => {
    it("prefers the snapshot currency", () => {
      expect(publicShareCurrency({ currency: "USD" })).toBe("USD");
    });

    it("falls back without consulting system settings", () => {
      expect(publicShareCurrency(null)).toBe(PUBLIC_FALLBACK_CURRENCY);
      expect(publicShareCurrency({})).toBe(PUBLIC_FALLBACK_CURRENCY);
    });
  });
});
