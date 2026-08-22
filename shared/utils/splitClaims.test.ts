import { describe, expect, it } from "vitest";

import type { Participant, Split } from "@/shared/types/split";
import type { SplitPublicShare } from "@/shared/types/splitPublicShare";
import type { SplitShareClaim } from "@/shared/types/splitShareClaim";
import { containsUndefined } from "./firestorePayload";
import {
  SPLIT_CLAIM_FIELDS,
  buildApplyPaidClaimWrites,
  buildSplitClaimPayload,
  claimApplyPlan,
  clampClaimAmount,
  describeClaimForOrganizer,
  mergePendingClaims,
  parseSplitClaimDocId,
  pendingClaimLabel,
  publicClaimBlockedReason,
  splitClaimDocId,
  splitClaimDocIds,
  splitClaimDocIdsForSplit,
} from "./splitClaims";
import { buildSplitPublicSharePayloadFromSplit } from "./splitPublicShare";

function participant(over: Partial<Participant> & { name: string }): Participant {
  return {
    key: `p_${over.name.toLowerCase()}`,
    amount: 100,
    paid: false,
    paidAmount: 0,
    isCurrentUser: false,
    ...over,
  };
}

function billSplit(over: Partial<Split> = {}): Split {
  return {
    id: "s1",
    title: "Dinner",
    totalAmount: 300,
    splitType: "equal",
    createdBy: "me",
    createdByName: "Kesava",
    createdAt: 1,
    settled: false,
    participantIds: [],
    publicSlug: "dinner42",
    publicShareId: "share1",
    participants: [
      participant({ name: "You", isCurrentUser: true, paid: true, paidAmount: 100 }),
      participant({ name: "Alice" }),
      participant({ name: "Bob" }),
    ],
    ...over,
  };
}

function share(over: Partial<SplitPublicShare> = {}): SplitPublicShare {
  return {
    id: "share1",
    slug: "dinner42",
    splitId: "s1",
    createdBy: "me",
    title: "Dinner",
    kind: "bill",
    totalAmount: 300,
    organizerName: "Kesava",
    status: "open",
    currency: "INR",
    claimKeys: ["p_alice", "p_bob"],
    claimAmountMax: 300,
    claimsEnabled: true,
    updatedAt: 1,
    participants: [
      {
        name: "Alice",
        amount: 100,
        paidAmount: 0,
        remainingDue: 100,
        optedOut: false,
        isOrganizer: false,
        claimKey: "p_alice",
      },
    ],
    ...over,
  };
}

function claim(over: Partial<SplitShareClaim> = {}): SplitShareClaim {
  return {
    shareId: "share1",
    slug: "dinner42",
    participantKey: "p_alice",
    type: "paid",
    amount: 100,
    status: "pending",
    createdAt: 1000,
    updatedAt: 1000,
    ...over,
  };
}

describe("splitClaims", () => {
  describe("document ids", () => {
    it("round-trips", () => {
      const id = splitClaimDocId("share1", "p_alice");
      expect(id).toBe("share1__p_alice");
      expect(parseSplitClaimDocId(id)).toEqual({
        shareId: "share1",
        participantKey: "p_alice",
      });
    });

    it("splits on the first separator so a key may contain one", () => {
      const id = splitClaimDocId("share1", "p__weird");
      expect(parseSplitClaimDocId(id)).toEqual({
        shareId: "share1",
        participantKey: "p__weird",
      });
    });

    it("rejects malformed ids", () => {
      expect(parseSplitClaimDocId("noseparator")).toBeNull();
      expect(parseSplitClaimDocId("__leading")).toBeNull();
      expect(parseSplitClaimDocId("trailing__")).toBeNull();
    });

    it("skips missing keys and an absent share id", () => {
      expect(splitClaimDocIds("share1", ["a", undefined, "", "b"])).toEqual([
        "share1__a",
        "share1__b",
      ]);
      expect(splitClaimDocIds(undefined, ["a"])).toEqual([]);
    });

    it("enumerates a split's claim slots for cascade deletes", () => {
      expect(splitClaimDocIdsForSplit(billSplit())).toEqual([
        "share1__p_you",
        "share1__p_alice",
        "share1__p_bob",
      ]);
      expect(
        splitClaimDocIdsForSplit({ ...billSplit(), publicShareId: undefined })
      ).toEqual([]);
    });
  });

  describe("publicClaimBlockedReason", () => {
    it("allows a listed contributing participant", () => {
      expect(publicClaimBlockedReason(share(), "p_alice")).toBeNull();
    });

    it("treats an absent claimsEnabled as closed", () => {
      expect(
        publicClaimBlockedReason(share({ claimsEnabled: undefined }), "p_alice")
      ).toMatch(/turned off/);
    });

    it("respects an explicit revoke", () => {
      expect(
        publicClaimBlockedReason(share({ claimsEnabled: false }), "p_alice")
      ).toMatch(/turned off/);
    });

    it("blocks a settled or spent split", () => {
      expect(publicClaimBlockedReason(share({ status: "settled" }), "p_alice")).toMatch(
        /already closed/
      );
      expect(publicClaimBlockedReason(share({ status: "spent" }), "p_alice")).toMatch(
        /already closed/
      );
    });

    it("blocks a key that is not published", () => {
      expect(publicClaimBlockedReason(share(), "p_stranger")).toMatch(
        /can't be updated/
      );
      expect(publicClaimBlockedReason(share(), undefined)).toMatch(
        /can't be updated/
      );
    });

    it("blocks a second claim on the same slot", () => {
      expect(publicClaimBlockedReason(share(), "p_alice", claim())).toMatch(
        /already sent/
      );
    });

    it("blocks when the share has no id", () => {
      expect(publicClaimBlockedReason(share({ id: undefined }), "p_alice")).toMatch(
        /no longer available/
      );
    });
  });

  describe("clampClaimAmount", () => {
    const row = { amount: 100 };

    it("accepts a plain amount", () => {
      expect(clampClaimAmount(row, "60", 300)).toEqual({ amount: 60 });
    });

    it("rounds to cents", () => {
      expect(clampClaimAmount(row, "60.555", 300)).toEqual({ amount: 60.56 });
    });

    it("clamps to the row's own share rather than erroring", () => {
      expect(clampClaimAmount(row, "5000", 300)).toEqual({ amount: 100 });
    });

    it("clamps to the share ceiling when that is lower", () => {
      expect(clampClaimAmount({ amount: 100 }, "90", 50)).toEqual({ amount: 50 });
    });

    it("rejects junk, zero and negatives", () => {
      for (const bad of ["", "   ", "abc", "-5", "0", "NaN", "Infinity"]) {
        const result = clampClaimAmount(row, bad, 300);
        expect("error" in result).toBe(true);
      }
    });
  });

  describe("buildSplitClaimPayload", () => {
    it("emits exactly the whitelisted fields the rules accept", () => {
      const built = buildSplitClaimPayload({
        share: share(),
        participantKey: "p_alice",
        type: "paid",
        amount: 100,
        now: 5000,
      });
      expect("error" in built).toBe(false);
      if ("error" in built) return;

      expect(built.docId).toBe("share1__p_alice");
      // Drift guard: the rules assert this exact set.
      expect(Object.keys(built.payload).sort()).toEqual(
        [...SPLIT_CLAIM_FIELDS].sort()
      );
      expect(built.payload.status).toBe("pending");
      expect(built.payload.createdAt).toBe(5000);
      expect(built.payload.updatedAt).toBe(5000);
      expect(containsUndefined(built.payload)).toBe(false);
    });

    it("forces an opt-out claim to zero", () => {
      const built = buildSplitClaimPayload({
        share: share(),
        participantKey: "p_alice",
        type: "optOut",
        amount: 999,
        now: 5000,
      });
      expect("error" in built).toBe(false);
      if ("error" in built) return;
      expect(built.payload.amount).toBe(0);
    });

    it("refuses an amount over the whole split", () => {
      const built = buildSplitClaimPayload({
        share: share(),
        participantKey: "p_alice",
        type: "paid",
        amount: 1000,
        now: 5000,
      });
      expect("error" in built).toBe(true);
    });

    it("refuses a zero paid claim", () => {
      const built = buildSplitClaimPayload({
        share: share(),
        participantKey: "p_alice",
        type: "paid",
        amount: 0,
        now: 5000,
      });
      expect("error" in built).toBe(true);
    });

    it("never returns a payload for a blocked share", () => {
      for (const bad of [
        share({ claimsEnabled: false }),
        share({ claimsEnabled: undefined }),
        share({ status: "settled" }),
        share({ status: "spent" }),
        share({ claimKeys: [] }),
      ]) {
        const built = buildSplitClaimPayload({
          share: bad,
          participantKey: "p_alice",
          type: "paid",
          amount: 100,
          now: 5000,
        });
        expect("error" in built).toBe(true);
      }
    });
  });

  describe("mergePendingClaims", () => {
    it("attaches a pending claim to the matching row only", () => {
      const s = share({
        participants: [
          {
            name: "Alice",
            amount: 100,
            paidAmount: 0,
            remainingDue: 100,
            optedOut: false,
            isOrganizer: false,
            claimKey: "p_alice",
          },
          {
            name: "Bob",
            amount: 100,
            paidAmount: 0,
            remainingDue: 100,
            optedOut: false,
            isOrganizer: false,
            claimKey: "p_bob",
          },
        ],
      });
      const rows = mergePendingClaims(s, [claim()]);
      expect(rows[0].pending?.amount).toBe(100);
      expect(rows[1].pending).toBeUndefined();
    });

    it("ignores a claim for a row that no longer exists", () => {
      const rows = mergePendingClaims(share(), [
        claim({ participantKey: "p_ghost" }),
      ]);
      expect(rows[0].pending).toBeUndefined();
    });

    it("ignores a claim on a row that has dropped out", () => {
      const s = share({
        participants: [
          {
            name: "Alice",
            amount: 0,
            paidAmount: 0,
            remainingDue: 0,
            optedOut: true,
            isOrganizer: false,
            claimKey: "p_alice",
          },
        ],
      });
      expect(mergePendingClaims(s, [claim()])[0].pending).toBeUndefined();
    });

    it("collapses the overlay once the authoritative amount covers the claim", () => {
      // The organizer applied it; this device just has not seen the delete yet.
      // Showing it pending would make a settled row look unapplied.
      const s = share({
        participants: [
          {
            name: "Alice",
            amount: 100,
            paidAmount: 100,
            remainingDue: 0,
            optedOut: false,
            isOrganizer: false,
            claimKey: "p_alice",
          },
        ],
      });
      expect(mergePendingClaims(s, [claim({ amount: 100 })])[0].pending).toBeUndefined();
    });

    it("keeps the overlay for a partial claim that is not yet covered", () => {
      const s = share({
        participants: [
          {
            name: "Alice",
            amount: 100,
            paidAmount: 40,
            remainingDue: 60,
            optedOut: false,
            isOrganizer: false,
            claimKey: "p_alice",
          },
        ],
      });
      expect(mergePendingClaims(s, [claim({ amount: 100 })])[0].pending?.amount).toBe(
        100
      );
    });
  });

  describe("pendingClaimLabel", () => {
    const base = {
      name: "Alice",
      amount: 100,
      paidAmount: 0,
      remainingDue: 100,
      optedOut: false,
      isOrganizer: false,
      claimKey: "p_alice",
    };

    it("names the amount and the organizer for a paid claim", () => {
      const label = pendingClaimLabel(
        { ...base, pending: { type: "paid", amount: 100, createdAt: 1 } },
        { organizerName: "Kesava", currency: "INR" }
      );
      expect(label).toContain("Kesava");
      expect(label).toContain("100");
      expect(label).toContain("waiting");
    });

    it("has distinct wording for an opt-out", () => {
      const label = pendingClaimLabel(
        { ...base, pending: { type: "optOut", amount: 0, createdAt: 1 } },
        { organizerName: "Kesava", currency: "INR" }
      );
      expect(label).toContain("won't contribute");
      expect(label).not.toContain("paid");
    });

    it("is null with no pending claim", () => {
      expect(
        pendingClaimLabel(base, { organizerName: "Kesava", currency: "INR" })
      ).toBeNull();
    });
  });

  describe("claimApplyPlan", () => {
    it("routes a bill paid claim to a splits-only write", () => {
      const plan = claimApplyPlan(billSplit(), claim());
      expect(plan).toEqual({
        action: "togglePaid",
        participantIndex: 1,
        participantKey: "p_alice",
        paidAmount: 100,
      });
    });

    it("routes a collect paid claim through the account picker", () => {
      const plan = claimApplyPlan(
        billSplit({ kind: "collect", status: "collecting" }),
        claim()
      );
      expect(plan).toEqual({
        action: "markCollected",
        participantKey: "p_alice",
        requiresAccount: true,
      });
    });

    it("routes an opt-out claim to the redistribution path", () => {
      const plan = claimApplyPlan(billSplit(), claim({ type: "optOut", amount: 0 }));
      expect(plan).toEqual({ action: "optOut", participantKey: "p_alice" });
    });

    it("dismisses a claim for an already settled share", () => {
      const split = billSplit({
        participants: [
          participant({ name: "You", isCurrentUser: true, paid: true, paidAmount: 100 }),
          participant({ name: "Alice", paid: true, paidAmount: 100 }),
          participant({ name: "Bob" }),
        ],
      });
      const plan = claimApplyPlan(split, claim());
      expect(plan.action).toBe("dismiss");
    });

    it("dismisses a claim on a spent collect pot", () => {
      const plan = claimApplyPlan(
        billSplit({ kind: "collect", status: "spent" }),
        claim()
      );
      expect(plan.action).toBe("dismiss");
    });

    it("dismisses a claim for someone no longer in the split", () => {
      const plan = claimApplyPlan(billSplit(), claim({ participantKey: "p_ghost" }));
      expect(plan.action).toBe("dismiss");
    });

    it("dismisses a claim against the organizer's own row", () => {
      const plan = claimApplyPlan(billSplit(), claim({ participantKey: "p_you" }));
      expect(plan.action).toBe("dismiss");
    });

    it("carries the exact opt-out block reason when the last contributor would go", () => {
      const split = billSplit({
        totalAmount: 100,
        participants: [
          participant({ name: "Gone", contributing: false, amount: 0 }),
          participant({ name: "Alice", amount: 100 }),
        ],
      });
      const plan = claimApplyPlan(split, claim({ type: "optOut", amount: 0 }));
      expect(plan).toEqual({
        action: "dismiss",
        reason: "At least one person has to stay in the split.",
      });
    });

    it("dismisses a paid claim for someone who already dropped out", () => {
      const split = billSplit({
        participants: [
          participant({ name: "You", isCurrentUser: true }),
          participant({ name: "Alice", contributing: false, amount: 0 }),
        ],
      });
      const plan = claimApplyPlan(split, claim());
      expect(plan.action).toBe("dismiss");
    });
  });

  describe("buildApplyPaidClaimWrites", () => {
    it("sets paidAmount absolutely and leaves everyone else untouched", () => {
      const split = billSplit();
      const built = buildApplyPaidClaimWrites({ split, claim: claim({ amount: 60 }) });
      expect("error" in built).toBe(false);
      if ("error" in built) return;

      expect(built.participants[1].paidAmount).toBe(60);
      expect(built.participants[1].paid).toBe(false);
      expect(built.participants[0]).toEqual(split.participants[0]);
      expect(built.participants[2]).toEqual(split.participants[2]);
      expect(built.settled).toBe(false);
    });

    it("marks the share settled at the full amount", () => {
      const built = buildApplyPaidClaimWrites({
        split: billSplit(),
        claim: claim({ amount: 100 }),
      });
      expect("error" in built).toBe(false);
      if ("error" in built) return;
      expect(built.participants[1].paid).toBe(true);
      expect(built.participants[1].paidAmount).toBe(100);
    });

    it("clamps a claim above the share down to the share", () => {
      const built = buildApplyPaidClaimWrites({
        split: billSplit(),
        claim: claim({ amount: 250 }),
      });
      expect("error" in built).toBe(false);
      if ("error" in built) return;
      expect(built.participants[1].paidAmount).toBe(100);
    });

    it("is idempotent: applying twice gives an identical result", () => {
      const split = billSplit();
      const once = buildApplyPaidClaimWrites({ split, claim: claim({ amount: 60 }) });
      if ("error" in once) throw new Error("first apply failed");
      const twice = buildApplyPaidClaimWrites({
        split: { ...split, participants: once.participants },
        claim: claim({ amount: 60 }),
      });
      if ("error" in twice) throw new Error("second apply failed");
      expect(twice.participants).toEqual(once.participants);
      expect(twice.participants[1].paidAmount).toBe(60);
    });

    it("refuses the collect path, which needs an account id", () => {
      const built = buildApplyPaidClaimWrites({
        split: billSplit({ kind: "collect", status: "collecting" }),
        claim: claim(),
      });
      expect("error" in built).toBe(true);
    });

    it("refuses a missing participant and the organizer's own row", () => {
      expect(
        "error" in
          buildApplyPaidClaimWrites({
            split: billSplit(),
            claim: claim({ participantKey: "p_ghost" }),
          })
      ).toBe(true);
      expect(
        "error" in
          buildApplyPaidClaimWrites({
            split: billSplit(),
            claim: claim({ participantKey: "p_you" }),
          })
      ).toBe(true);
    });

    it("applies the claimed amount, not the raised share, on a stale claim", () => {
      // Alice claimed 100, then someone dropped out and her share became 150.
      const split = billSplit({
        participants: [
          participant({ name: "You", isCurrentUser: true, paid: true, paidAmount: 100 }),
          participant({ name: "Alice", amount: 150, shareRaised: true }),
          participant({ name: "Bob", contributing: false, amount: 0 }),
        ],
      });
      const built = buildApplyPaidClaimWrites({ split, claim: claim({ amount: 100 }) });
      expect("error" in built).toBe(false);
      if ("error" in built) return;
      expect(built.participants[1].paidAmount).toBe(100);
      expect(built.participants[1].paid).toBe(false);
      expect(built.settled).toBe(false);
    });
  });

  describe("describeClaimForOrganizer", () => {
    it("states the amount claimed against the share", () => {
      const described = describeClaimForOrganizer(
        claim({ amount: 100 }),
        billSplit(),
        "INR"
      );
      expect(described.name).toBe("Alice");
      expect(described.headline).toContain("100");
      expect(described.destructive).toBe(false);
    });

    it("says what is left over on a partial claim", () => {
      const described = describeClaimForOrganizer(
        claim({ amount: 60 }),
        billSplit(),
        "INR"
      );
      expect(described.detail).toContain("40");
    });

    it("flags an opt-out as destructive and explains the knock-on", () => {
      const described = describeClaimForOrganizer(
        claim({ type: "optOut", amount: 0 }),
        billSplit(),
        "INR"
      );
      expect(described.destructive).toBe(true);
      expect(described.detail).toMatch(/cover/i);
    });
  });

  describe("integration with the published snapshot", () => {
    it("every published claim key can build a valid payload", () => {
      const split = billSplit();
      const payload = buildSplitPublicSharePayloadFromSplit(split, {
        slug: "dinner42",
        currency: "INR",
        updatedAt: 1,
      }) as unknown as SplitPublicShare;
      const live: SplitPublicShare = { ...payload, id: "share1" };

      expect(live.claimKeys).toEqual(["p_alice", "p_bob"]);
      for (const key of live.claimKeys as string[]) {
        const built = buildSplitClaimPayload({
          share: live,
          participantKey: key,
          type: "paid",
          amount: 100,
          now: 5000,
        });
        expect("error" in built).toBe(false);
      }
    });
  });
});
