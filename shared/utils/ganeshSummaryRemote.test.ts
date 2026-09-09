import { describe, expect, it } from "vitest";

import {
  canRequestFestivalSummary,
  festivalSummaryNeedsRebuild,
  ganeshSummaryFunctionUrl,
  parseSummaryRemoteMode,
} from "@/shared/utils/ganeshSummaryRemote";

describe("ganeshSummaryFunctionUrl", () => {
  it("points at the Netlify function on the share origin", () => {
    expect(ganeshSummaryFunctionUrl("https://spendly-share.netlify.app")).toBe(
      "https://spendly-share.netlify.app/.netlify/functions/ganesh-summary"
    );
    expect(ganeshSummaryFunctionUrl("https://spendly-share.netlify.app/")).toBe(
      "https://spendly-share.netlify.app/.netlify/functions/ganesh-summary"
    );
    expect(ganeshSummaryFunctionUrl("")).toBe("");
  });
});

describe("canRequestFestivalSummary", () => {
  const collector = { status: "active", role: "collector", permissions: ["collections.create"] };
  const admin = { status: "active", role: "admin", permissions: ["festival.update", "festival.create"] };
  const treasurerLegacy = { status: "active", role: "treasurer" };

  it("lets any active member ask for a ledger rebuild", () => {
    expect(canRequestFestivalSummary("rebuild", collector)).toBe(true);
    expect(canRequestFestivalSummary("rebuild", { status: "suspended", role: "admin" })).toBe(
      false
    );
  });

  it("limits seed and recompute to festival managers", () => {
    expect(canRequestFestivalSummary("seed", collector)).toBe(false);
    expect(canRequestFestivalSummary("seed", admin)).toBe(true);
    expect(canRequestFestivalSummary("recompute", collector)).toBe(false);
    expect(canRequestFestivalSummary("recompute", admin)).toBe(true);
    expect(canRequestFestivalSummary("recompute", treasurerLegacy)).toBe(true);
  });
});

describe("parseSummaryRemoteMode", () => {
  it("accepts only the three modes the function serves", () => {
    expect(parseSummaryRemoteMode("rebuild")).toBe("rebuild");
    expect(parseSummaryRemoteMode("wipe")).toBeNull();
  });
});

describe("festivalSummaryNeedsRebuild", () => {
  const emptyLedger = {
    collectionCount: 0,
    receivedMoneyContributionCount: 0,
    expenseCount: 0,
    fundTransferCount: 0,
    openingFundCount: 0,
  };
  const emptySummary = {
    openingFunds: 0,
    chanda: 0,
    committeeContributions: 0,
    otherCashContributions: 0,
    godFundExpenses: 0,
    reimbursements: 0,
    collectionCount: 0,
    expenseCount: 0,
    receivedFromPermanentFund: 0,
    transferredToPermanentFund: 0,
  };

  it("is false when both the summary and the ledger are empty", () => {
    expect(festivalSummaryNeedsRebuild(emptySummary, emptyLedger)).toBe(false);
  });

  it("is true when collections exist but totals are still zero", () => {
    expect(
      festivalSummaryNeedsRebuild(emptySummary, { ...emptyLedger, collectionCount: 2 })
    ).toBe(true);
  });

  it("is true for a received contribution or Permanent Fund transfer with empty totals", () => {
    expect(
      festivalSummaryNeedsRebuild(emptySummary, {
        ...emptyLedger,
        receivedMoneyContributionCount: 1,
      })
    ).toBe(true);
    expect(
      festivalSummaryNeedsRebuild(emptySummary, { ...emptyLedger, fundTransferCount: 1 })
    ).toBe(true);
  });

  it("is false once the summary already has the money", () => {
    expect(
      festivalSummaryNeedsRebuild(
        { ...emptySummary, chanda: 24411, collectionCount: 2 },
        { ...emptyLedger, collectionCount: 2 }
      )
    ).toBe(false);
  });
});
