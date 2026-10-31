import { describe, expect, it } from "vitest";

import type {
  EpfContribution,
  EpfEstablishment,
  EpfInterestEntry,
  EpfTransfer,
} from "@/shared/features/epf/types";
import { applyActualCredit } from "@/shared/features/epf/utils/lifecycle";
import { epfPortfolioSummary } from "@/shared/features/epf/utils/portfolio";
import {
  EPF_SUMMARY_VERSION,
  decideEpfSummarySync,
  epfSummaryFields,
  epfSummaryNeedsWrite,
  type EpfSummarySources,
} from "@/shared/features/epf/utils/summarySync";
import { establishmentBalanceBreakdown } from "@/shared/features/epf/utils/transfers";

const establishment: EpfEstablishment = {
  id: "est-a",
  profileId: "main",
  employerName: "Employer",
  establishmentNumber: "MHBAN0012345000",
  memberId: "MHBAN00123450000012345",
  dateJoined: "2026-01-01",
  employmentStatus: "current",
};

/** epfCredit 2350 = employee 1800 + employerEpf 550; EPS 1250 is pension. */
function contribution(month: string, overrides: Partial<EpfContribution> = {}): EpfContribution {
  return {
    id: `est-a_${month}`,
    establishmentId: "est-a",
    month,
    wage: 15000,
    employeeShare: 1800,
    employerShare: 1800,
    epsShare: 1250,
    employerEpfShare: 550,
    totalContribution: 3600,
    epfCredit: 2350,
    status: "credited",
    source: "simulated",
    epsEligible: true,
    ...overrides,
  };
}

const transferIn: EpfTransfer = {
  id: "t1",
  sourceEstablishmentId: "previous-employer",
  destinationEstablishmentId: "est-a",
  amount: 16722.61,
  date: "2026-03-01",
  status: "completed",
};

const interest: EpfInterestEntry = {
  id: "est-a_2026-27",
  establishmentId: "est-a",
  financialYear: "2026-27",
  rate: 0.0825,
  basis: "monthlyRunningBalance",
  openingBalance: 0,
  interest: 148.5,
  closingBalance: 148.5,
};

function sources(contributions: EpfContribution[], overrides: Partial<EpfSummarySources> = {}) {
  return {
    establishments: [establishment],
    contributions,
    transfers: [transferIn],
    interestEntries: [interest],
    adjustments: [],
    ...overrides,
  };
}

const august = contribution("2026-08");
const septemberExpected = contribution("2026-09", { status: "expected" });
// The SPENDLY-653 shape: September marked credited by hand with the amount the
// passbook showed, which is not the projection.
const septemberCredited = applyActualCredit(septemberExpected, {
  amount: 4720,
  date: "2026-10-15",
  reconciledAt: "2026-10-15T00:00:00.000Z",
});

describe("epfSummaryFields", () => {
  it("is the same total the Balance tab shows, transfers included", () => {
    const input = sources([august, septemberCredited]);
    const fields = epfSummaryFields(input);
    const balance = establishmentBalanceBreakdown({ ...input, establishmentId: "est-a" });

    expect(fields.currentBalance).toBeCloseTo(balance.total, 2);
    // 2350 + 4720 credited + 148.50 interest + 16,722.61 transferred in.
    expect(fields.currentBalance).toBeCloseTo(2350 + 4720 + 148.5 + 16722.61, 2);
  });

  it("splits a hand-entered credit by the actual amount, and the split sums to it", () => {
    const fields = epfSummaryFields(sources([septemberCredited]));
    const portfolio = epfPortfolioSummary(sources([septemberCredited]));

    expect(fields.employeeContributionTotal + fields.employerContributionTotal).toBeCloseTo(4720, 2);
    expect(fields.employeeContributionTotal).toBe(portfolio.employeeShare);
    expect(fields.employerContributionTotal).toBe(portfolio.employerEpfShare);
  });

  it("moves when a month is marked credited — the transition no longer goes missing", () => {
    const before = epfSummaryFields(sources([august, septemberExpected]));
    const after = epfSummaryFields(sources([august, septemberCredited]));

    expect(after.currentBalance - before.currentBalance).toBeCloseTo(4720, 2);
    expect(epfSummaryNeedsWrite({ ...before }, after)).toBe(true);
  });

  it("is idempotent: the same sources give the same document, so a retry cannot double-count", () => {
    const input = sources([august, septemberCredited]);
    const first = epfSummaryFields(input);
    const second = epfSummaryFields(input);

    expect(second).toEqual(first);
    expect(epfSummaryNeedsWrite(first, second)).toBe(false);
  });
});

describe("epfSummaryNeedsWrite", () => {
  const fields = epfSummaryFields(sources([august, septemberCredited]));

  it("repairs a stale increment()-built document", () => {
    // Shape of the reported drift: contributions over-counted, September and
    // transfers missing, interest applied more than once.
    const stale = {
      currentBalance: 45671.11,
      employeeContributionTotal: 22460,
      employerContributionTotal: 22460,
      interestTotal: 751.11,
      adjustmentsTotal: 0,
      lastCreditPeriod: "2026-09",
      summaryVersion: 1,
    };
    expect(epfSummaryNeedsWrite(stale, fields)).toBe(true);
  });

  it("treats a missing total as a difference (SPENDLY-544 docs)", () => {
    const { interestTotal: _omit, ...partial } = fields;
    expect(epfSummaryNeedsWrite(partial, fields)).toBe(true);
  });

  it("ignores sub-paisa float noise", () => {
    expect(
      epfSummaryNeedsWrite({ ...fields, currentBalance: fields.currentBalance + 0.001 }, fields)
    ).toBe(false);
  });

  it("rewrites a document from the old version even when the numbers agree", () => {
    expect(epfSummaryNeedsWrite({ ...fields, summaryVersion: 1 }, fields)).toBe(true);
    expect(fields.summaryVersion).toBe(EPF_SUMMARY_VERSION);
  });
});

describe("decideEpfSummarySync", () => {
  const input = sources([august, septemberCredited]);

  it("never writes while a source is still loading or failed", () => {
    expect(decideEpfSummarySync({ ready: false, stored: null, sources: input })).toEqual({
      write: false,
      reason: "not-ready",
    });
  });

  it("writes the absolute document when the stored one is stale", () => {
    const decision = decideEpfSummarySync({
      ready: true,
      stored: { currentBalance: 1, summaryVersion: 1 },
      sources: input,
    });
    expect(decision.write).toBe(true);
    if (decision.write) expect(decision.fields).toEqual(epfSummaryFields(input));
  });

  it("does nothing once in sync — a reload or a second device converges, not accumulates", () => {
    const stored = epfSummaryFields(input);
    expect(decideEpfSummarySync({ ready: true, stored, sources: input })).toEqual({
      write: false,
      reason: "in-sync",
    });
  });

  it("refuses to zero a stored balance from empty collections (offline cold start)", () => {
    const empty = sources([], { transfers: [], interestEntries: [] });
    expect(
      decideEpfSummarySync({ ready: true, stored: { currentBalance: 50391.11 }, sources: empty })
    ).toEqual({ write: false, reason: "empty-sources" });
  });

  it("still writes zeros for a genuinely empty profile with nothing stored", () => {
    const empty = sources([], { transfers: [], interestEntries: [] });
    const decision = decideEpfSummarySync({ ready: true, stored: null, sources: empty });
    expect(decision.write).toBe(true);
  });

  it("writes the drop to zero when money rows still exist but no longer bear a balance", () => {
    const reversed = sources([{ ...august, status: "reversed" }], { transfers: [], interestEntries: [] });
    const decision = decideEpfSummarySync({
      ready: true,
      stored: { currentBalance: 2350, summaryVersion: EPF_SUMMARY_VERSION },
      sources: reversed,
    });
    expect(decision.write).toBe(true);
    if (decision.write) expect(decision.fields.currentBalance).toBe(0);
  });
});
