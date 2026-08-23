import { describe, expect, it } from "vitest";

import { can } from "./ganeshPermissions";
import {
  assertCanCancelContribution,
  assertCanReceiveContribution,
  assertMoneyReceiveOnline,
  contributionStatusLabel,
  isCancelled,
  isOverdue,
  isPromised,
  isReceived,
  summarizeContributions,
} from "./ganeshContributions";
import { availableGodFund, summarizeLedger } from "./ganeshMath";

const today = "2026-08-25";

describe("contribution status helpers", () => {
  it("treats a missing status as promised", () => {
    expect(isPromised({})).toBe(true);
    expect(isReceived({ status: "received" })).toBe(true);
    expect(isCancelled({ status: "cancelled" })).toBe(true);
  });

  it("marks a promised idol overdue without changing its stored status", () => {
    const idol = { status: "promised" as const, expectedDate: "2026-08-20", estimatedValue: 15000 };
    expect(isOverdue(idol, today)).toBe(true);
    expect(contributionStatusLabel(idol, today)).toBe("overdue");
    expect(idol.status).toBe("promised");
  });

  it("does not treat a received or dateless promise as overdue", () => {
    expect(isOverdue({ status: "received", expectedDate: "2026-08-20" }, today)).toBe(false);
    expect(isOverdue({ status: "promised" }, today)).toBe(false);
  });
});

describe("summarizeContributions", () => {
  it("keeps a promised idol out of cash and received in-kind", () => {
    const totals = summarizeContributions(
      [{ kind: "item", amount: 0, estimatedValue: 15000, status: "promised" }],
      today
    );
    expect(totals.promisedInKind).toBe(15000);
    expect(totals.inKindReceived).toBe(0);
    expect(totals.cashReceived).toBe(0);
    expect(totals.promisedCount).toBe(1);
  });

  it("counts received items as in-kind and received money as cash", () => {
    const fest2026 = summarizeContributions(
      [
        { kind: "item", amount: 0, estimatedValue: 15000, status: "received" },
        { kind: "money", amount: 5000, estimatedValue: 0, status: "received" },
        { kind: "money", amount: 2000, estimatedValue: 0, status: "promised" },
        { kind: "sponsorship", amount: 0, estimatedValue: 8000, status: "promised" },
        { kind: "item", amount: 0, estimatedValue: 4000, status: "cancelled" },
      ],
      today
    );
    const fest2027 = summarizeContributions([], today);
    expect(fest2026.cashReceived).toBe(5000);
    expect(fest2026.promisedCash).toBe(2000);
    expect(fest2026.inKindReceived).toBe(15000);
    expect(fest2026.promisedInKind).toBe(8000);
    expect(fest2026.cancelledValue).toBe(4000);
    expect(fest2026.promisedSponsorCount).toBe(1);
    expect(fest2027.cashReceived).toBe(0);
    expect(fest2027.promisedCount).toBe(0);
  });

  it("never adds promised cash to available God Fund", () => {
    const promised = summarizeContributions(
      [{ kind: "money", amount: 5000, estimatedValue: 0, status: "promised" }],
      today
    );
    const ledger = summarizeLedger({
      openingFunds: [10000],
      collections: [],
      committeeContributions: [],
      otherCashContributions: [promised.cashReceived],
      godFundExpenses: [],
      reimbursements: [],
      personalAmounts: [],
      inKindValues: [],
      sponsoredValues: [],
    });
    expect(promised.promisedCash).toBe(5000);
    expect(promised.cashReceived).toBe(0);
    expect(availableGodFund(ledger)).toBe(10000);
  });
});

describe("receive and cancel guards", () => {
  it("rejects a second receive so cash cannot be added twice", () => {
    expect(() => assertCanReceiveContribution({ status: "received" })).toThrow(
      /already received/
    );
    expect(() => assertCanReceiveContribution({ status: "promised" })).not.toThrow();
  });

  it("requires the device to be online before marking money received", () => {
    expect(() => assertMoneyReceiveOnline(false, "money")).toThrow(/online/);
    expect(() => assertMoneyReceiveOnline(true, "money")).not.toThrow();
    expect(() => assertMoneyReceiveOnline(false, "item")).not.toThrow();
  });

  it("lets a promised row cancel without treating it as received cash", () => {
    const cancelled = { kind: "money" as const, amount: 5000, estimatedValue: 0, status: "cancelled" as const };
    expect(() => assertCanCancelContribution({ status: "promised" })).not.toThrow();
    expect(() => assertCanCancelContribution({ status: "received" })).toThrow(/cannot be cancelled/);
    expect(summarizeContributions([cancelled]).cashReceived).toBe(0);
    expect(summarizeContributions([cancelled]).cancelledValue).toBe(5000);
  });
});

describe("contribution permissions", () => {
  it("lets a member create but not receive or cancel", () => {
    expect(can("member", "contributions.create")).toBe(true);
    expect(can("member", "contributions.receive")).toBe(false);
    expect(can("member", "contributions.cancel")).toBe(false);
    expect(can("treasurer", "contributions.receive")).toBe(true);
    expect(can("treasurer", "contributions.cancel")).toBe(true);
    expect(can("viewer", "contributions.receive")).toBe(false);
  });
});
