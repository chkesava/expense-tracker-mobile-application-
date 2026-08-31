import { describe, expect, it } from "vitest";

import { EMPTY_GANESH_SUMMARY, EMPTY_PERMANENT_FUND } from "@/shared/types/ganesh";
import { availableGodFund } from "@/shared/utils/ganeshMath";
import { buildFinancialOverview } from "@/shared/utils/ganeshFinancialOverview";

describe("buildFinancialOverview", () => {
  it("does not count promised or in-kind value as available cash", () => {
    const overview = buildFinancialOverview({
      summary: {
        ...EMPTY_GANESH_SUMMARY,
        openingFunds: 10000,
        chanda: 80000,
        inKindValue: 15000,
      },
      contributions: [
        {
          id: "p1",
          kind: "money",
          contributorName: "Ravi",
          amount: 5000,
          estimatedValue: 0,
          date: "2026-08-01",
          status: "promised",
          createdBy: "u1",
          updatedBy: "u1",
        },
        {
          id: "i1",
          kind: "item",
          contributorName: "Suresh",
          amount: 0,
          estimatedValue: 15000,
          date: "2026-08-01",
          status: "received",
          createdBy: "u1",
          updatedBy: "u1",
        },
      ],
    });
    expect(overview.availableGodFund).toBe(90000);
    expect(overview.moneyIn).toBe(90000);
    expect(overview.inKindEstimated).toBe(15000);
    expect(overview.contributionTotals.promisedCash).toBe(5000);
  });

  it("does not treat a personal expense as God Fund spend or a location change", () => {
    const overview = buildFinancialOverview({
      summary: {
        ...EMPTY_GANESH_SUMMARY,
        openingFunds: 10000,
        cash: 10000,
        personalMoneyUsed: 5000,
        pendingReimbursements: 5000,
      },
    });
    expect(overview.availableGodFund).toBe(10000);
    expect(overview.locations.cash).toBe(10000);
    expect(overview.pendingReimbursements).toBe(5000);
    expect(overview.moneyOut).toBe(0);
  });

  it("counts only the God Fund leg of a split expense as money out", () => {
    const overview = buildFinancialOverview({
      summary: {
        ...EMPTY_GANESH_SUMMARY,
        openingFunds: 10000,
        godFundExpenses: 3000,
        personalMoneyUsed: 2000,
        pendingReimbursements: 2000,
        cash: 7000,
      },
    });
    expect(overview.availableGodFund).toBe(7000);
    expect(overview.moneyOutLines.find((line) => line.id === "godExpenses")?.amount).toBe(3000);
    expect(overview.pendingReimbursements).toBe(2000);
  });

  it("reduces God Fund and pending obligation when a reimbursement is recorded", () => {
    const overview = buildFinancialOverview({
      summary: {
        ...EMPTY_GANESH_SUMMARY,
        openingFunds: 10000,
        reimbursements: 2000,
        personalMoneyUsed: 5000,
        pendingReimbursements: 3000,
        cash: 8000,
      },
    });
    expect(overview.availableGodFund).toBe(8000);
    expect(overview.moneyOutLines.find((line) => line.id === "reimbursements")?.amount).toBe(2000);
    expect(overview.pendingReimbursements).toBe(3000);
  });

  it("does not double-count Permanent Fund transfers as opening income", () => {
    const overview = buildFinancialOverview({
      summary: {
        ...EMPTY_GANESH_SUMMARY,
        openingFunds: 30000,
        receivedFromPermanentFund: 10000,
        chanda: 5000,
        cash: 35000,
      },
    });
    expect(overview.moneyIn).toBe(35000);
    expect(overview.moneyInLines.find((line) => line.id === "opening")?.amount).toBe(20000);
    expect(overview.moneyInLines.find((line) => line.id === "permanentIn")?.amount).toBe(10000);
    const lineSum = overview.moneyInLines.reduce((sum, line) => sum + line.amount, 0);
    expect(lineSum).toBe(overview.moneyIn);
  });

  it("classifies transfers out as money out, not as expenses", () => {
    const overview = buildFinancialOverview({
      summary: {
        ...EMPTY_GANESH_SUMMARY,
        openingFunds: 30000,
        transferredToPermanentFund: 10000,
        godFundExpenses: 5000,
        cash: 15000,
      },
    });
    expect(availableGodFund(overview.summary)).toBe(15000);
    expect(overview.moneyOutLines.find((line) => line.id === "permanentOut")?.amount).toBe(10000);
    expect(overview.moneyOut).toBe(15000);
  });

  it("splits cash sponsors out of other contributions without adding them twice", () => {
    const overview = buildFinancialOverview({
      summary: {
        ...EMPTY_GANESH_SUMMARY,
        otherCashContributions: 12000,
        cash: 12000,
      },
      sponsorships: [
        {
          id: "s1",
          sponsorId: "sp1",
          sponsoringType: "cash",
          purpose: "other",
          amount: 8000,
          estimatedValue: 0,
          status: "received",
          createdBy: "u1",
          updatedBy: "u1",
        },
      ],
    });
    expect(overview.sponsors.received).toBe(8000);
    expect(overview.moneyInLines.find((line) => line.id === "sponsors")?.amount).toBe(8000);
    expect(overview.moneyInLines.find((line) => line.id === "other")?.amount).toBe(4000);
    expect(overview.moneyIn).toBe(12000);
  });

  it("shows committee target / received / pending without treating pending as cash", () => {
    const overview = buildFinancialOverview({
      summary: {
        ...EMPTY_GANESH_SUMMARY,
        committeeContributions: 15000,
        cash: 15000,
      },
      festival: { contributionTargetAmount: 10000 },
      members: [
        {
          id: "a",
          userId: "a",
          displayName: "Ravi",
          role: "member",
          contributionTarget: 10000,
          contributionPaid: 10000,
          personalExpenses: 0,
          reimbursed: 0,
          pendingReimbursement: 0,
        },
        {
          id: "b",
          userId: "b",
          displayName: "Suresh",
          role: "member",
          contributionTarget: 10000,
          contributionPaid: 5000,
          personalExpenses: 2500,
          reimbursed: 0,
          pendingReimbursement: 2500,
        },
      ],
    });
    expect(overview.committee).toEqual({ target: 20000, received: 15000, pending: 5000 });
    expect(overview.pendingReimbursementMembers).toEqual([
      { memberId: "b", displayName: "Suresh", amount: 2500 },
    ]);
    expect(overview.availableGodFund).toBe(15000);
  });

  it("keeps Permanent Fund separate from festival God Fund", () => {
    const overview = buildFinancialOverview({
      summary: { ...EMPTY_GANESH_SUMMARY, openingFunds: 45500, cash: 18000, upi: 17500, bank: 10000 },
      permanentFund: { ...EMPTY_PERMANENT_FUND, total: 20000, cash: 12000, upi: 5000, bank: 3000 },
    });
    expect(overview.availableGodFund).toBe(45500);
    expect(overview.locations).toEqual({ cash: 18000, upi: 17500, bank: 10000, other: 0 });
    expect(overview.permanentFund.total).toBe(20000);
    expect(overview.locationInvariantHolds).toBe(true);
  });

  it("is a pure function of the stored summary for a closed festival", () => {
    const summary = {
      ...EMPTY_GANESH_SUMMARY,
      openingFunds: 20000,
      godFundExpenses: 8000,
      cash: 12000,
    };
    const first = buildFinancialOverview({ summary });
    const second = buildFinancialOverview({ summary });
    expect(first).toEqual(second);
    expect(first.availableGodFund).toBe(12000);
    expect(first.moneyOut).toBe(8000);
    expect(first.locations.cash).toBe(12000);
  });
});
