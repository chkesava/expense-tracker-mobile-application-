import { describe, expect, it } from "vitest";

import type { EpfContribution, EpfEstablishment } from "@/shared/features/epf/types";
import {
  backfillProgress,
  buildBackfillRows,
  computeEpfContribution,
  contributionDocId,
  contributionMonthsFor,
  contributionTotals,
  contributionStatusMeta,
  deriveEpsEligibility,
  findDuplicateMonths,
  findMissingMonths,
  groupContributionsByFinancialYear,
  isEligibleForAutomatedProcessing,
  isPartialMonth,
  normalizeEpfContribution,
  proratedWageForMonth,
  summarizeContributions,
  validateBackfillBatch,
  validateEpfContribution,
} from "@/shared/features/epf/utils/contributions";

const EST: Pick<EpfEstablishment, "id" | "dateJoined" | "dateLeft"> = {
  id: "est-1",
  dateJoined: "2021-06-01",
  dateLeft: "2024-08-31",
};

function contribution(overrides: Partial<EpfContribution> = {}): EpfContribution {
  return {
    id: "est-1_2021-06",
    establishmentId: "est-1",
    month: "2021-06",
    wage: 25000,
    employeeShare: 3000,
    employerShare: 3000,
    epsShare: 1250,
    employerEpfShare: 1750,
    totalContribution: 6000,
    epfCredit: 4750,
    status: "confirmed",
    source: "manualHistorical",
    epsEligible: true,
    ...overrides,
  };
}

describe("computeEpfContribution", () => {
  it("caps EPS at the ceiling for a wage above it", () => {
    const result = computeEpfContribution({
      wage: 50000,
      month: "2024-08",
      epsEligible: true,
    });
    expect(result.employeeShare).toBe(6000);
    expect(result.employerShare).toBe(6000);
    expect(result.epsShare).toBe(1250); // the canonical capped figure
    expect(result.employerEpfShare).toBe(4750);
    expect(result.totalContribution).toBe(12000);
    expect(result.epfCredit).toBe(10750);
  });

  it("employer contribution differs from what reaches the fund", () => {
    const result = computeEpfContribution({
      wage: 50000,
      month: "2024-08",
      epsEligible: true,
    });
    expect(result.epfCredit).not.toBe(result.totalContribution);
    expect(result.employerEpfShare).toBeLessThan(result.employerShare);
  });

  it("computes EPS on the full wage when it is below the ceiling", () => {
    const result = computeEpfContribution({
      wage: 12000,
      month: "2021-06",
      epsEligible: true,
    });
    expect(result.epsShare).toBe(1000);
    expect(result.employerEpfShare).toBe(440);
    expect(result.epfCredit).toBe(1880);
  });

  it("sends the whole employer share to EPF when the member is not in EPS", () => {
    const result = computeEpfContribution({
      wage: 50000,
      month: "2024-08",
      epsEligible: false,
    });
    expect(result.epsShare).toBe(0);
    expect(result.employerEpfShare).toBe(6000);
    expect(result.epfCredit).toBe(12000);
  });

  it("uses the pre-2014 ceiling for an older month", () => {
    const result = computeEpfContribution({
      wage: 20000,
      month: "2013-05",
      epsEligible: true,
    });
    expect(result.epsShare).toBe(541); // 8.33% of 6,500, the statutory figure
    expect(result.employerEpfShare).toBe(1859);
    expect(result.rulesVersion).toBe("2001-06");
  });

  it("handles a zero wage without producing NaN", () => {
    const result = computeEpfContribution({ wage: 0, month: "2021-06", epsEligible: true });
    expect(result.employeeShare).toBe(0);
    expect(result.epfCredit).toBe(0);
  });

  it("treats a negative wage as zero rather than inverting the split", () => {
    expect(
      computeEpfContribution({ wage: -5000, month: "2021-06", epsEligible: true })
        .employeeShare
    ).toBe(0);
  });
});

describe("contributionMonthsFor", () => {
  it("generates every month from joining through leaving, inclusive", () => {
    const months = contributionMonthsFor(EST, "2026-09");
    expect(months).toHaveLength(39);
    expect(months[0]).toBe("2021-06");
    expect(months[38]).toBe("2024-08");
  });

  it("returns a single month when joining and leaving in the same month", () => {
    expect(
      contributionMonthsFor(
        { dateJoined: "2023-05-02", dateLeft: "2023-05-30" },
        "2026-09"
      )
    ).toEqual(["2023-05"]);
  });

  it("clamps an open-ended employment at the current month", () => {
    const months = contributionMonthsFor({ dateJoined: "2026-06-01" }, "2026-09");
    expect(months).toEqual(["2026-06", "2026-07", "2026-08", "2026-09"]);
  });

  it("returns nothing when the leaving date precedes joining", () => {
    expect(
      contributionMonthsFor({ dateJoined: "2024-01-01", dateLeft: "2023-01-01" }, "2026-09")
    ).toEqual([]);
  });
});

describe("buildBackfillRows", () => {
  it("computes every generated month from the supplied wage", () => {
    const rows = buildBackfillRows({
      establishment: EST,
      currentMonth: "2026-09",
      existing: [],
      wage: 25000,
      epsEligible: true,
      prorateEdgeMonths: false,
    });
    expect(rows).toHaveLength(39);
    expect(rows[0].employeeShare).toBe(3000);
    expect(rows[0].epsShare).toBe(1250);
    expect(rows.every((row) => !row.persisted)).toBe(true);
  });

  it("merges existing documents in by month without duplicating them", () => {
    const rows = buildBackfillRows({
      establishment: EST,
      currentMonth: "2026-09",
      existing: [contribution({ month: "2021-07", status: "confirmed" })],
      wage: 25000,
      epsEligible: true,
      prorateEdgeMonths: false,
    });
    expect(rows).toHaveLength(39);
    expect(rows.filter((row) => row.month === "2021-07")).toHaveLength(1);
    expect(rows.find((row) => row.month === "2021-07")?.persisted).toBe(true);
  });

  it("does not recompute a row the user has overridden", () => {
    const rows = buildBackfillRows({
      establishment: EST,
      currentMonth: "2026-09",
      existing: [
        contribution({ month: "2021-08", employeeShare: 9999, overridden: true }),
      ],
      wage: 25000,
      epsEligible: true,
      prorateEdgeMonths: false,
    });
    expect(rows.find((row) => row.month === "2021-08")?.employeeShare).toBe(9999);
  });

  it("pro-rates the joining month when asked", () => {
    const rows = buildBackfillRows({
      establishment: { id: "e", dateJoined: "2021-06-16", dateLeft: "2021-07-31" },
      currentMonth: "2026-09",
      existing: [],
      wage: 30000,
      epsEligible: true,
      prorateEdgeMonths: true,
    });
    expect(rows[0].partialMonth).toBe(true);
    expect(rows[0].wage).toBeLessThan(30000);
    expect(rows[1].wage).toBe(30000);
  });
});

describe("proratedWageForMonth and isPartialMonth", () => {
  it("halves a wage for a mid-month join", () => {
    expect(proratedWageForMonth(30000, "2021-06", "2021-06-16")).toBe(15000);
  });

  it("leaves a full month untouched", () => {
    expect(proratedWageForMonth(30000, "2021-07", "2021-06-16", "2021-08-31")).toBe(30000);
  });

  it("flags only the genuinely partial months", () => {
    expect(isPartialMonth("2021-06", "2021-06-16")).toBe(true);
    expect(isPartialMonth("2021-06", "2021-06-01")).toBe(false);
    expect(isPartialMonth("2024-08", "2021-06-01", "2024-08-31")).toBe(false);
    expect(isPartialMonth("2024-08", "2021-06-01", "2024-08-15")).toBe(true);
  });
});

describe("contributionDocId and duplicate prevention", () => {
  it("is stable for the same establishment and month", () => {
    expect(contributionDocId("est-1", "2021-06")).toBe(contributionDocId("est-1", "2021-06"));
  });

  it("differs across establishments for the same month", () => {
    expect(contributionDocId("est-1", "2021-06")).not.toBe(
      contributionDocId("est-2", "2021-06")
    );
  });

  it("detects a duplicated month within one establishment", () => {
    expect(
      findDuplicateMonths([
        { establishmentId: "est-1", month: "2021-06" },
        { establishmentId: "est-1", month: "2021-06" },
      ])
    ).toEqual(["2021-06"]);
  });

  it("does not flag the same month across different establishments", () => {
    expect(
      findDuplicateMonths([
        { establishmentId: "est-1", month: "2021-06" },
        { establishmentId: "est-2", month: "2021-06" },
      ])
    ).toEqual([]);
  });
});

describe("validateEpfContribution", () => {
  const ctx = { establishment: EST, currentDateKey: "2026-09-11" };

  const base = {
    month: "2021-06",
    employeeShare: 3000,
    employerShare: 3000,
    epsShare: 1250,
    employerEpfShare: 1750,
  };

  it("accepts a well-formed row", () => {
    expect(validateEpfContribution(base, ctx)).toEqual([]);
  });

  it("rejects negative amounts", () => {
    const issues = validateEpfContribution({ ...base, employeeShare: -1 }, ctx);
    expect(issues.some((issue) => issue.code === "negative_amount")).toBe(true);
  });

  it("rejects a month before joining or after leaving", () => {
    expect(
      validateEpfContribution({ ...base, month: "2021-05" }, ctx).some(
        (issue) => issue.code === "month_outside_employment"
      )
    ).toBe(true);
    expect(
      validateEpfContribution({ ...base, month: "2024-09" }, ctx).some(
        (issue) => issue.code === "month_outside_employment"
      )
    ).toBe(true);
  });

  it("allows an out-of-period month when explicitly permitted", () => {
    expect(
      validateEpfContribution({ ...base, month: "2021-05" }, {
        ...ctx,
        allowOutsidePeriod: true,
      })
    ).toEqual([]);
  });

  it("rejects a pension share larger than the employer contribution", () => {
    const issues = validateEpfContribution(
      { ...base, epsShare: 4000, employerEpfShare: -1000 },
      ctx
    );
    expect(issues.some((issue) => issue.code === "eps_exceeds_employer")).toBe(true);
  });

  it("rejects an employer split that does not add up", () => {
    const issues = validateEpfContribution({ ...base, employerEpfShare: 100 }, ctx);
    expect(issues.some((issue) => issue.code === "employer_split_mismatch")).toBe(true);
  });

  it("requires a reason for a fully zero month", () => {
    const zero = {
      month: "2021-06",
      employeeShare: 0,
      employerShare: 0,
      epsShare: 0,
      employerEpfShare: 0,
    };
    expect(
      validateEpfContribution(zero, ctx).some((issue) => issue.code === "zero_without_reason")
    ).toBe(true);
    expect(
      validateEpfContribution({ ...zero, zeroReason: "Loss of pay" }, ctx)
    ).toEqual([]);
  });

  it("rejects a credit date before the contribution month", () => {
    const issues = validateEpfContribution({ ...base, creditDate: "2021-05-20" }, ctx);
    expect(issues.some((issue) => issue.code === "credit_date_before_month")).toBe(true);
  });

  it("warns rather than errors on a future credit date", () => {
    const issues = validateEpfContribution({ ...base, creditDate: "2027-01-01" }, ctx);
    expect(issues[0].code).toBe("credit_date_in_future");
    expect(issues[0].severity).toBe("warning");
  });
});

describe("validateBackfillBatch", () => {
  const ctx = { establishment: EST, currentDateKey: "2026-09-11" };

  it("collects issues instead of stopping at the first bad row", () => {
    const rows = buildBackfillRows({
      establishment: EST,
      currentMonth: "2026-09",
      existing: [],
      wage: 25000,
      epsEligible: true,
      prorateEdgeMonths: false,
    });
    rows[0].employeeShare = -1;
    rows[5].epsShare = 99999;

    const result = validateBackfillBatch(rows, ctx);
    expect(Object.keys(result.issuesByMonth)).toHaveLength(2);
    expect(result.errorCount).toBeGreaterThanOrEqual(2);
    expect(result.valid).toHaveLength(rows.length - 2);
  });

  it("keeps rows whose only issue is a warning", () => {
    const rows = buildBackfillRows({
      establishment: EST,
      currentMonth: "2026-09",
      existing: [],
      wage: 25000,
      epsEligible: true,
      prorateEdgeMonths: false,
    });
    rows[0].creditDate = "2027-01-01";

    const result = validateBackfillBatch(rows, ctx);
    expect(result.warningCount).toBe(1);
    expect(result.errorCount).toBe(0);
    expect(result.valid).toHaveLength(rows.length);
  });
});

describe("summarizeContributions", () => {
  it("sums the parts and keeps the two totals distinct", () => {
    const totals = summarizeContributions([contribution(), contribution()]);
    expect(totals.employee).toBe(6000);
    expect(totals.employer).toBe(6000);
    expect(totals.eps).toBe(2500);
    expect(totals.total).toBe(12000);
    expect(totals.epfCredit).toBe(9500);
    expect(totals.count).toBe(2);
  });

  it("returns zeroes for an empty list", () => {
    expect(summarizeContributions([]).epfCredit).toBe(0);
  });
});

describe("groupContributionsByFinancialYear", () => {
  it("buckets across the March/April boundary, newest year first", () => {
    const groups = groupContributionsByFinancialYear([
      contribution({ month: "2022-03" }),
      contribution({ month: "2022-04" }),
    ]);
    expect(groups.map((group) => group.financialYear)).toEqual(["2022-23", "2021-22"]);
  });

  it("per-year totals sum to the grand total", () => {
    const rows = [
      contribution({ month: "2021-06" }),
      contribution({ month: "2022-05" }),
      contribution({ month: "2023-05" }),
    ];
    const groups = groupContributionsByFinancialYear(rows);
    const summed = groups.reduce((acc, group) => acc + group.totals.epfCredit, 0);
    expect(summed).toBe(summarizeContributions(rows).epfCredit);
  });

  it("reports the months still missing in each year", () => {
    const groups = groupContributionsByFinancialYear(
      [contribution({ month: "2021-06" })],
      ["2021-06", "2021-07"]
    );
    expect(groups[0].missingMonths).toEqual(["2021-07"]);
    expect(groups[0].expectedCount).toBe(2);
  });
});

describe("findMissingMonths and backfillProgress", () => {
  it("lists the unrecorded months", () => {
    expect(findMissingMonths(["2021-06", "2021-07"], [{ month: "2021-06" }])).toEqual([
      "2021-07",
    ]);
  });

  it("reports progress as a percentage", () => {
    expect(backfillProgress(["2021-06", "2021-07"], [{ month: "2021-06" }])).toEqual({
      filled: 1,
      expected: 2,
      pct: 50,
    });
  });

  it("does not divide by zero for an empty range", () => {
    expect(backfillProgress([], []).pct).toBe(0);
  });
});

describe("normalizeEpfContribution", () => {
  it("recomputes totals that disagree with the stored parts", () => {
    const row = normalizeEpfContribution("est-1_2021-06", {
      establishmentId: "est-1",
      month: "2021-06",
      employeeShare: 3000,
      employerShare: 3000,
      epsShare: 1250,
      totalContribution: 999999, // stale
      epfCredit: 999999, // stale
    });
    expect(row.totalContribution).toBe(6000);
    expect(row.epfCredit).toBe(4750);
    expect(row.employerEpfShare).toBe(1750);
  });

  it("defaults missing fields rather than producing NaN", () => {
    const row = normalizeEpfContribution("x", {});
    expect(row.employeeShare).toBe(0);
    expect(row.epfCredit).toBe(0);
    expect(row.source).toBe("manualHistorical");
    expect(row.epsEligible).toBe(true);
  });

  it("treats a non-numeric amount as zero", () => {
    expect(normalizeEpfContribution("x", { employeeShare: "3000" }).employeeShare).toBe(0);
  });
});

describe("isEligibleForAutomatedProcessing", () => {
  it("rejects every row KAN-66 is capable of writing", () => {
    const rows: EpfContribution[] = [
      contribution({ status: "draft", month: "2026-09" }),
      contribution({ status: "confirmed", month: "2026-09" }),
      contribution({ status: "confirmed", month: "2021-06" }),
    ];
    for (const row of rows) {
      expect(isEligibleForAutomatedProcessing(row, "2026-09")).toBe(false);
    }
  });

  it("rejects a past month even for a simulated row", () => {
    expect(
      isEligibleForAutomatedProcessing(
        contribution({ source: "simulated", status: "expected", month: "2021-06" }),
        "2026-09"
      )
    ).toBe(false);
  });

  it("accepts a current-month simulated row", () => {
    expect(
      isEligibleForAutomatedProcessing(
        contribution({ source: "simulated", status: "expected", month: "2026-09" }),
        "2026-09"
      )
    ).toBe(true);
  });
});

describe("deriveEpsEligibility", () => {
  it("treats a pre-2014 member as an EPS member regardless of wage", () => {
    expect(
      deriveEpsEligibility({ firstEverJoinDate: "2010-01-01", wage: 90000, month: "2021-06" })
    ).toBe(true);
  });

  it("excludes a post-2014 joiner earning above the ceiling", () => {
    expect(
      deriveEpsEligibility({ firstEverJoinDate: "2015-01-01", wage: 50000, month: "2021-06" })
    ).toBe(false);
  });

  it("includes a post-2014 joiner earning below the ceiling", () => {
    expect(
      deriveEpsEligibility({ firstEverJoinDate: "2015-01-01", wage: 12000, month: "2021-06" })
    ).toBe(true);
  });

  it("defaults to eligible when the first joining date is unknown", () => {
    expect(deriveEpsEligibility({ wage: 50000, month: "2021-06" })).toBe(true);
  });
});

describe("contributionStatusMeta", () => {
  it("marks manual historical rows as neither simulated nor draft", () => {
    const meta = contributionStatusMeta("confirmed", "manualHistorical");
    expect(meta.label).toBe("Manual");
    expect(meta.simulated).toBe(false);
  });

  it("marks drafts distinctly", () => {
    expect(contributionStatusMeta("draft", "manualHistorical").label).toBe("Draft");
  });

  it("marks a simulated row as projected whatever its status", () => {
    expect(contributionStatusMeta("confirmed", "simulated").simulated).toBe(true);
  });
});

describe("contributionTotals — KAN-73", () => {
  it("separates what was paid from what reaches the balance", () => {
    // EPS is pension. It is part of the employer's payment and never part of
    // the PF credit; conflating them overstates the balance every month.
    const totals = contributionTotals({
      employeeShare: 1800,
      employerShare: 1800,
      employerEpfShare: 550,
    });

    expect(totals.totalContribution).toBe(3600);
    expect(totals.epfCredit).toBe(2350);
    expect(totals.epfCredit).toBeLessThan(totals.totalContribution);
  });

  it("rounds, which the EpfContributionEditSheet copy did not", () => {
    // The defect: raw `+` in the component stored 3600.3000000000002 where
    // every generated month stored 3600.3.
    const totals = contributionTotals({
      employeeShare: 1800.1,
      employerShare: 1800.2,
      employerEpfShare: 1250.2,
    });

    expect(totals.totalContribution).toBe(3600.3);
    expect(totals.epfCredit).toBe(3050.3);
  });

  it("equals epfCredit when there is no EPS slice", () => {
    const totals = contributionTotals({
      employeeShare: 1800,
      employerShare: 1800,
      employerEpfShare: 1800,
    });
    expect(totals.epfCredit).toBe(totals.totalContribution);
  });

  it("agrees with computeEpfContribution for the same shares", () => {
    // The two must never drift apart again.
    const computed = computeEpfContribution({
      wage: 15000,
      month: "2026-04",
      epsEligible: true,
    });
    const totals = contributionTotals(computed);

    expect(totals.totalContribution).toBe(computed.totalContribution);
    expect(totals.epfCredit).toBe(computed.epfCredit);
  });

  it("handles all zeroes", () => {
    expect(contributionTotals({ employeeShare: 0, employerShare: 0, employerEpfShare: 0 })).toEqual(
      { totalContribution: 0, epfCredit: 0 }
    );
  });
});
