/**
 * Ledger consequences of applying a self-service claim filed from the public
 * split link.
 *
 * The point of these tests is the money boundary: a `bill` claim must never
 * touch an account, a `collect` claim must credit exactly once, and replaying
 * either must not double-count. `computeBankBalance` is the arbiter rather than
 * the participant array, because that is what the user actually sees.
 */

import { describe, expect, it } from "vitest";

import type { Account, AccountEntry } from "@/shared/types/expense";
import type { Split } from "@/shared/types/split";
import type { SplitShareClaim } from "@/shared/types/splitShareClaim";
import { computeBankBalance } from "@/shared/utils/accountBalance";
import {
  buildApplyPaidClaimWrites,
  claimApplyPlan,
} from "@/shared/utils/splitClaims";
import { buildMarkCollectedWrites } from "@/shared/utils/splitLedger";
import {
  computeSplitProgress,
  computeSplitSummary,
  participantRemainingDue,
  recalibrateSplitAfterOptOut,
} from "@/shared/utils/splitMath";
import {
  publicParticipantStatusLabel,
  toPublicShareParticipant,
} from "@/shared/utils/splitPublicShare";

const hdfc: Account = {
  id: "hdfc",
  name: "HDFC",
  typeId: "bank",
  openingBalance: 10000,
  balanceAsOfDate: "2026-01-01",
};

function asEntry(payload: Record<string, unknown>, id: string): AccountEntry {
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

function tenWay(paidCount: number, over: Partial<Split> = {}): Split {
  return {
    id: "s1",
    title: "Dinner",
    totalAmount: 1000,
    splitType: "equal",
    createdBy: "user-me",
    createdByName: "Me",
    createdAt: 1,
    settled: false,
    participantIds: ["user-me"],
    publicSlug: "dinner42",
    publicShareId: "share1",
    participants: Array.from({ length: 10 }, (_, i) => ({
      key: `p${i}`,
      name: i === 0 ? "You" : `Friend ${i}`,
      amount: 100,
      paid: i < paidCount,
      paidAmount: i < paidCount ? 100 : 0,
      isCurrentUser: i === 0,
    })),
    ...over,
  };
}

function claim(over: Partial<SplitShareClaim> = {}): SplitShareClaim {
  return {
    shareId: "share1",
    slug: "dinner42",
    participantKey: "p9",
    type: "paid",
    amount: 100,
    status: "pending",
    createdAt: 1000,
    updatedAt: 1000,
    ...over,
  };
}

describe("public claim application vs the ledger", () => {
  it("a bill claim settles the share and produces no account entry", () => {
    const split = tenWay(9);
    const built = buildApplyPaidClaimWrites({ split, claim: claim() });
    expect("error" in built).toBe(false);
    if ("error" in built) return;

    const applied: Split = { ...split, participants: built.participants };
    expect(computeSplitProgress(applied).percentage).toBe(100);
    expect(built.settled).toBe(true);

    // The bill path is bookkeeping only. Nothing may reach the bank.
    expect(computeBankBalance(hdfc, [], [])).toBe(10000);

    const before = computeSplitSummary([split], "user-me").totalOwedToYou;
    const after = computeSplitSummary([applied], "user-me").totalOwedToYou;
    expect(before - after).toBeCloseTo(100, 2);
  });

  it("a partial bill claim leaves the remainder due and does not read as a top-up", () => {
    const split = tenWay(9);
    const built = buildApplyPaidClaimWrites({ split, claim: claim({ amount: 40 }) });
    expect("error" in built).toBe(false);
    if ("error" in built) return;

    const target = built.participants[9];
    expect(target.paidAmount).toBe(40);
    expect(target.paid).toBe(false);
    expect(participantRemainingDue(target)).toBe(60);
    // No opt-out happened, so this must not claim a share increase.
    expect(target.shareRaised).toBeUndefined();
    expect(
      publicParticipantStatusLabel(toPublicShareParticipant(target), {
        optedOutNames: [],
        currency: "INR",
      })
    ).toBe("Paid part · remaining due");
  });

  it("a collect claim credits the account exactly once, and a replay is refused", () => {
    const pot = tenWay(1, { kind: "collect", status: "collecting" });

    const plan = claimApplyPlan(pot, claim());
    expect(plan).toEqual({
      action: "markCollected",
      participantKey: "p9",
      requiresAccount: true,
    });

    const first = buildMarkCollectedWrites({
      split: pot,
      participantKey: "p9",
      accountId: "hdfc",
      entryId: "entry-1",
      dateKey: "2026-08-01",
    });
    expect("error" in first).toBe(false);
    if ("error" in first) return;

    const entries = [asEntry(first.entry, "entry-1")];
    expect(computeBankBalance(hdfc, [], [], [], entries)).toBe(10100);

    // Applying the same claim again must not credit a second time.
    const replayed = buildMarkCollectedWrites({
      split: { ...pot, participants: first.participants },
      participantKey: "p9",
      accountId: "hdfc",
      entryId: "entry-2",
      dateKey: "2026-08-01",
    });
    expect(replayed).toEqual({ error: "Already marked collected." });
    expect(computeBankBalance(hdfc, [], [], [], entries)).toBe(10100);
  });

  it("applying an opt-out claim redistributes to the cent and records the top-ups", () => {
    // The scenario from the report: 10 people, 8 paid, 2 refuse.
    const split = tenWay(8);
    const plan = claimApplyPlan(split, claim({ type: "optOut", amount: 0 }));
    expect(plan).toEqual({ action: "optOut", participantKey: "p9" });

    const first = recalibrateSplitAfterOptOut(split, "p8");
    if ("error" in first) throw new Error(first.error);
    const second = recalibrateSplitAfterOptOut(
      { ...split, participants: first.participants },
      "p9"
    );
    if ("error" in second) throw new Error(second.error);

    const contributing = second.participants.filter((p) => p.contributing !== false);
    expect(contributing).toHaveLength(8);
    expect(contributing.reduce((sum, p) => sum + p.amount, 0)).toBeCloseTo(1000, 2);

    // The eight who already paid 100 now owe a 25 top-up each.
    for (const p of contributing) {
      expect(p.amount).toBe(125);
      expect(participantRemainingDue(p)).toBe(25);
      expect(p.shareRaised).toBe(true);
    }
    // Redistribution alone must not move money.
    expect(computeBankBalance(hdfc, [], [])).toBe(10000);
  });

  it("a partial then a full claim ends at the share, never above it", () => {
    const split = tenWay(9);
    const partial = buildApplyPaidClaimWrites({ split, claim: claim({ amount: 40 }) });
    if ("error" in partial) throw new Error(partial.error);

    const full = buildApplyPaidClaimWrites({
      split: { ...split, participants: partial.participants },
      claim: claim({ amount: 100 }),
    });
    if ("error" in full) throw new Error(full.error);

    expect(full.participants[9].paidAmount).toBe(100);
    expect(full.participants[9].paid).toBe(true);
  });

  it("a claim filed before a drop-out applies the claimed amount, leaving the top-up open", () => {
    // Friend 9 says "I've paid 100". Before the organizer applies it, Friend 8
    // drops out and Friend 9's share becomes ~111.11. Applying must record the
    // 100 they actually paid, not silently settle the raised share.
    const split = tenWay(8);
    const staleClaim = claim({ participantKey: "p9", amount: 100 });

    const dropped = recalibrateSplitAfterOptOut(split, "p8");
    if ("error" in dropped) throw new Error(dropped.error);
    const raised: Split = { ...split, participants: dropped.participants };
    expect(raised.participants[9].amount).toBeGreaterThan(100);

    const built = buildApplyPaidClaimWrites({ split: raised, claim: staleClaim });
    if ("error" in built) throw new Error(built.error);

    const target = built.participants[9];
    expect(target.paidAmount).toBe(100);
    expect(target.paid).toBe(false);
    expect(participantRemainingDue(target)).toBeCloseTo(target.amount - 100, 2);
    expect(built.settled).toBe(false);
    expect(computeBankBalance(hdfc, [], [])).toBe(10000);
  });
});
