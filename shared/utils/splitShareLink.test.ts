import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Participant, Split } from "@/shared/types/split";
import {
  NO_ORIGIN_SHARE_REASON,
  NO_UPI_PAY_LINK_REASON,
  isSharingRepairNoop,
  paySlugsByKey,
  planSplitSharingRepair,
  resolvePersonShareLink,
  resolveSplitShareLink,
} from "./splitShareLink";

const ORIGIN = "https://kesavaexpensetracker.netlify.app";

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

function legacySplit(over: Partial<Split> = {}): Split {
  return {
    id: "s1",
    title: "Dinner",
    totalAmount: 300,
    splitType: "equal",
    createdBy: "me",
    createdAt: 1,
    settled: false,
    participantIds: [],
    participants: [
      participant({ name: "You", key: "p_me", isCurrentUser: true }),
      participant({ name: "Alice", key: "p_alice" }),
      participant({ name: "Bob", key: "p_bob" }),
    ],
    ...over,
  };
}

describe("splitShareLink", () => {
  const previousAppUrl = process.env.EXPO_PUBLIC_APP_URL;

  beforeEach(() => {
    // getSplitShareUrl reads the origin from the environment.
    process.env.EXPO_PUBLIC_APP_URL = ORIGIN;
  });

  afterEach(() => {
    if (previousAppUrl === undefined) delete process.env.EXPO_PUBLIC_APP_URL;
    else process.env.EXPO_PUBLIC_APP_URL = previousAppUrl;
  });

  describe("resolveSplitShareLink", () => {
    it("builds the group URL when both origin and slug exist", () => {
      expect(
        resolveSplitShareLink({ publicSlug: "abc123", origin: ORIGIN })
      ).toEqual({ ready: true, url: `${ORIGIN}/split/abc123` });
    });

    it("reports no-origin without inventing a relative URL", () => {
      const result = resolveSplitShareLink({ publicSlug: "abc123", origin: "" });
      expect(result).toEqual({
        ready: false,
        reason: "no-origin",
        message: NO_ORIGIN_SHARE_REASON,
      });
    });

    it("reports no-slug for a split that predates public links", () => {
      const result = resolveSplitShareLink({ origin: ORIGIN });
      expect(result.ready).toBe(false);
      if (result.ready) return;
      expect(result.reason).toBe("no-slug");
    });

    it("does not double the slash when the origin has a trailing one", () => {
      process.env.EXPO_PUBLIC_APP_URL = `${ORIGIN}/`;
      const result = resolveSplitShareLink({
        publicSlug: "abc123",
        origin: `${ORIGIN}/`,
      });
      expect(result.ready).toBe(true);
      if (!result.ready) return;
      expect(result.url).toBe(`${ORIGIN}/split/abc123`);
      expect(result.url).not.toContain("//split");
    });
  });

  describe("resolvePersonShareLink", () => {
    it("builds the per-person pay URL", () => {
      expect(
        resolvePersonShareLink({ paymentSlug: "pay789", origin: ORIGIN })
      ).toEqual({ ready: true, url: `${ORIGIN}/payment/pay789` });
    });

    it("reports no-slug when the participant has no pay page", () => {
      const result = resolvePersonShareLink({ origin: ORIGIN });
      expect(result.ready).toBe(false);
      if (result.ready) return;
      expect(result.reason).toBe("no-slug");
    });
  });

  describe("planSplitSharingRepair", () => {
    it("flags both the missing slug and the missing snapshot on a legacy split", () => {
      const plan = planSplitSharingRepair(legacySplit(), { upiId: "me@upi" });
      expect(plan.needsSlug).toBe(true);
      expect(plan.needsShareDoc).toBe(true);
      expect(isSharingRepairNoop(plan)).toBe(false);
    });

    it("lists exactly the participants with no pay link", () => {
      const split = legacySplit({
        publicSlug: "abc123",
        publicShareId: "share1",
        participants: [
          participant({ name: "You", key: "p_me", isCurrentUser: true }),
          participant({ name: "Alice", key: "p_alice", paymentSlug: "alice-pay" }),
          participant({ name: "Bob", key: "p_bob" }),
          participant({ name: "Dana", key: "p_dana" }),
        ],
      });
      const plan = planSplitSharingRepair(split, { upiId: "me@upi" });
      expect(plan.keysMissingPayLink).toEqual(["p_bob", "p_dana"]);
      expect(plan.needsSlug).toBe(false);
      expect(plan.needsShareDoc).toBe(false);
    });

    it("never asks for a pay link for the organizer, dropouts, or keyless rows", () => {
      const split = legacySplit({
        publicSlug: "abc123",
        publicShareId: "share1",
        participants: [
          participant({ name: "You", key: "p_me", isCurrentUser: true }),
          participant({ name: "Bob", key: "p_bob", contributing: false }),
          participant({ name: "Legacy", key: undefined }),
          participant({ name: "Alice", key: "p_alice" }),
        ],
      });
      const plan = planSplitSharingRepair(split, { upiId: "me@upi" });
      expect(plan.keysMissingPayLink).toEqual(["p_alice"]);
    });

    it("explains why pay links are impossible with no UPI id", () => {
      const plan = planSplitSharingRepair(legacySplit(), { upiId: "" });
      // Nothing to create, but the organizer gets told why.
      expect(plan.keysMissingPayLink).toEqual([]);
      expect(plan.payLinkBlockedReason).toBe(NO_UPI_PAY_LINK_REASON);
      // The group link is still repairable without a UPI id.
      expect(plan.needsSlug).toBe(true);
      expect(isSharingRepairNoop(plan)).toBe(false);
    });

    it("treats whitespace-only UPI ids as absent", () => {
      const plan = planSplitSharingRepair(legacySplit(), { upiId: "   " });
      expect(plan.payLinkBlockedReason).toBe(NO_UPI_PAY_LINK_REASON);
    });

    it("stays silent about UPI when nobody needs a pay link anyway", () => {
      const split = legacySplit({
        publicSlug: "abc123",
        publicShareId: "share1",
        participants: [participant({ name: "You", key: "p_me", isCurrentUser: true })],
      });
      const plan = planSplitSharingRepair(split, { upiId: "" });
      expect(plan.payLinkBlockedReason).toBeUndefined();
      expect(isSharingRepairNoop(plan)).toBe(true);
    });

    it("is a no-op once the split is fully wired", () => {
      const split = legacySplit({
        publicSlug: "abc123",
        publicShareId: "share1",
        participants: [
          participant({ name: "You", key: "p_me", isCurrentUser: true }),
          participant({ name: "Alice", key: "p_alice", paymentRequestId: "pr-a" }),
          participant({ name: "Bob", key: "p_bob", paymentSlug: "bob-pay" }),
        ],
      });
      const plan = planSplitSharingRepair(split, { upiId: "me@upi" });
      expect(isSharingRepairNoop(plan)).toBe(true);
    });

    it("regression: a UPI id added after creation makes every pay link repairable", () => {
      // The exact broken state: created with no UPI id, so no participant ever
      // got a paymentSlug, and the sync path only patched existing requests.
      const created = legacySplit({ publicSlug: "abc123", publicShareId: "share1" });

      const beforeUpi = planSplitSharingRepair(created, { upiId: "" });
      expect(beforeUpi.keysMissingPayLink).toEqual([]);
      expect(beforeUpi.payLinkBlockedReason).toBe(NO_UPI_PAY_LINK_REASON);

      const afterUpi = planSplitSharingRepair(created, { upiId: "me@upi" });
      expect(afterUpi.keysMissingPayLink).toEqual(["p_alice", "p_bob"]);
      expect(afterUpi.payLinkBlockedReason).toBeUndefined();
      expect(isSharingRepairNoop(afterUpi)).toBe(false);
    });
  });

  describe("paySlugsByKey", () => {
    it("maps only participants that actually have a slug", () => {
      expect(
        paySlugsByKey([
          participant({ name: "Alice", key: "p_alice", paymentSlug: "alice-pay" }),
          participant({ name: "Bob", key: "p_bob" }),
          participant({ name: "Legacy", key: undefined, paymentSlug: "orphan" }),
        ])
      ).toEqual({ p_alice: "alice-pay" });
    });
  });
});
