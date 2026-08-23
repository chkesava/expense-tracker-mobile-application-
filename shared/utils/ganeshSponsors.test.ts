import { describe, expect, it } from "vitest";

import { can } from "./ganeshPermissions";
import { availableGodFund, summarizeLedger, validateExpenseFunding } from "./ganeshMath";
import {
  assertCanCancelSponsorship,
  assertCanReceiveSponsorship,
  breakdownSponsors,
  canLinkSponsoredExpense,
  isSponsorshipOverdue,
  sponsorshipStatusLabel,
  summarizeSponsorships,
} from "./ganeshSponsors";

const today = "2026-08-25";

describe("sponsorship status helpers", () => {
  it("marks a promised lighting deal overdue without changing its stored status", () => {
    const row = { status: "promised" as const, expectedDate: "2026-08-20" };
    expect(isSponsorshipOverdue(row, today)).toBe(true);
    expect(sponsorshipStatusLabel(row, today)).toBe("overdue");
    expect(row.status).toBe("promised");
  });

  it("does not treat confirmed or dateless promised deals as overdue", () => {
    expect(isSponsorshipOverdue({ status: "confirmed", expectedDate: "2026-08-20" }, today)).toBe(
      false
    );
    expect(isSponsorshipOverdue({ status: "promised" }, today)).toBe(false);
  });
});

describe("summarizeSponsorships", () => {
  it("keeps promised cash out of received cash and God Fund", () => {
    const totals = summarizeSponsorships(
      [{ sponsorId: "abc", sponsoringType: "cash", amount: 8000, estimatedValue: 0, status: "promised" }],
      today
    );
    const ledger = summarizeLedger({
      openingFunds: [10000],
      collections: [],
      committeeContributions: [],
      otherCashContributions: [totals.cashReceived],
      godFundExpenses: [],
      reimbursements: [],
      personalAmounts: [],
      inKindValues: [],
      sponsoredValues: [],
    });
    expect(totals.promisedCash).toBe(8000);
    expect(totals.cashReceived).toBe(0);
    expect(availableGodFund(ledger)).toBe(10000);
  });

  it("counts received cash and in-kind separately and isolates festivals", () => {
    const fest2026 = summarizeSponsorships(
      [
        { sponsorId: "abc", sponsoringType: "cash", amount: 8000, estimatedValue: 0, status: "received" },
        { sponsorId: "abc", sponsoringType: "item", amount: 0, estimatedValue: 15000, status: "received" },
        { sponsorId: "bakery", sponsoringType: "cash", amount: 5000, estimatedValue: 0, status: "promised" },
        { sponsorId: "sound", sponsoringType: "service", amount: 0, estimatedValue: 6000, status: "confirmed" },
        { sponsorId: "old", sponsoringType: "cash", amount: 2000, estimatedValue: 0, status: "cancelled" },
        { sponsorId: "lead", sponsoringType: "cash", amount: 0, estimatedValue: 0, status: "prospective" },
      ],
      today
    );
    const fest2027 = summarizeSponsorships([], today);
    expect(fest2026.cashReceived).toBe(8000);
    expect(fest2026.promisedCash).toBe(5000);
    expect(fest2026.inKindReceived).toBe(15000);
    expect(fest2026.promisedInKind).toBe(6000);
    expect(fest2026.cancelledValue).toBe(2000);
    expect(fest2026.sponsorCount).toBe(5);
    expect(fest2026.prospectiveCount).toBe(1);
    expect(fest2026.pendingCount).toBe(3);
    expect(fest2027.cashReceived).toBe(0);
    expect(fest2027.sponsorCount).toBe(0);
  });

  it("groups received and promised totals per sponsor", () => {
    const rows = breakdownSponsors(
      [
        { sponsorId: "abc", sponsoringType: "cash", amount: 8000, estimatedValue: 0, status: "received" },
        { sponsorId: "abc", sponsoringType: "cash", amount: 5000, estimatedValue: 0, status: "promised" },
        { sponsorId: "ramesh", sponsoringType: "item", amount: 0, estimatedValue: 15000, status: "received" },
      ],
      [
        { id: "abc", name: "ABC Electricals" },
        { id: "ramesh", name: "Ramesh Kumar" },
      ]
    );
    expect(rows[0]).toMatchObject({ name: "ABC Electricals", received: 8000, promised: 5000, inKind: 0 });
    expect(rows[1]).toMatchObject({ name: "Ramesh Kumar", received: 0, promised: 0, inKind: 15000 });
  });
});

describe("receive and cancel guards", () => {
  it("rejects a second receive so cash cannot be added twice", () => {
    expect(() => assertCanReceiveSponsorship({ status: "received" })).toThrow(/already received/);
    expect(() => assertCanReceiveSponsorship({ status: "promised", contributionId: "c1" })).toThrow(
      /already received/
    );
    expect(() => assertCanReceiveSponsorship({ status: "promised" })).not.toThrow();
    expect(() => assertCanReceiveSponsorship({ status: "confirmed" })).not.toThrow();
  });

  it("lets an open promise cancel without treating it as received cash", () => {
    expect(() => assertCanCancelSponsorship({ status: "promised" })).not.toThrow();
    expect(() => assertCanCancelSponsorship({ status: "received" })).toThrow(/cannot be cancelled/);
    const cancelled = summarizeSponsorships([
      { sponsorId: "abc", sponsoringType: "cash", amount: 8000, estimatedValue: 0, status: "cancelled" },
    ]);
    expect(cancelled.cashReceived).toBe(0);
    expect(cancelled.cancelledValue).toBe(8000);
  });

  it("does not let a received cash sponsorship fund an expense as sponsored", () => {
    expect(canLinkSponsoredExpense({ sponsoringType: "cash", status: "received" })).toBe(false);
    expect(canLinkSponsoredExpense({ sponsoringType: "expense", status: "promised" })).toBe(true);
  });
});

describe("sponsored expense funding", () => {
  it("keeps God Fund spend at the unfunded remainder", () => {
    const funding = validateExpenseFunding({
      totalAmount: 8000,
      godFundAmount: 3000,
      personalAmount: 0,
      sponsoredAmount: 5000,
    });
    expect(funding.ok).toBe(true);
    const over = validateExpenseFunding({
      totalAmount: 8000,
      godFundAmount: 0,
      personalAmount: 0,
      sponsoredAmount: 9000,
    });
    expect(over.ok).toBe(false);
  });
});

describe("sponsor permissions", () => {
  it("lets a member create but not receive or cancel", () => {
    expect(can("member", "sponsors.create")).toBe(true);
    expect(can("member", "sponsors.receive")).toBe(false);
    expect(can("member", "sponsors.cancel")).toBe(false);
    expect(can("treasurer", "sponsors.receive")).toBe(true);
    expect(can("treasurer", "sponsors.cancel")).toBe(true);
    expect(can("viewer", "sponsors.create")).toBe(false);
  });
});
