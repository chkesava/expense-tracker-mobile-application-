import { describe, expect, it } from "vitest";

import type { EpfContribution, EpfTransfer } from "@/shared/features/epf/types";
import {
  activeFinancialYears,
  buildInterestEntry,
  creditableYears,
  interestEntryId,
  interestForFinancialYear,
  interestSchedule,
  monthlyClosingBalances,
  normalizeInterestEntry,
  summariseInterest,
} from "@/shared/features/epf/utils/interest";

/** A month that credited exactly `amount` to `est-a`. */
function contribution(month: string, amount: number, overrides: Partial<EpfContribution> = {}): EpfContribution {
  return {
    id: `est-a_${month}`,
    establishmentId: "est-a",
    month,
    wage: 25000,
    employeeShare: amount / 2,
    employerShare: amount / 2,
    epsShare: 0,
    employerEpfShare: amount / 2,
    totalContribution: amount,
    epfCredit: amount,
    status: "credited",
    source: "simulated",
    epsEligible: true,
    ...overrides,
  };
}

function transfer(overrides: Partial<EpfTransfer> = {}): EpfTransfer {
  return {
    id: "t1",
    sourceEstablishmentId: "est-x",
    destinationEstablishmentId: "est-a",
    amount: 5000,
    date: "2023-06-10",
    status: "completed",
    ...overrides,
  };
}

describe("monthlyClosingBalances", () => {
  it("runs April through March, carrying the opening balance", () => {
    const balances = monthlyClosingBalances({
      financialYear: "2023-24",
      openingBalance: 1000,
      contributions: [contribution("2023-04", 500)],
      transfers: [],
      establishmentId: "est-a",
    });

    expect(Object.keys(balances)).toHaveLength(12);
    expect(balances["2023-04"]).toBe(1500);
    expect(balances["2024-03"]).toBe(1500);
    expect(balances["2023-03"]).toBeUndefined(); // previous financial year
  });

  it("adds a completed transfer in the month it is dated", () => {
    const balances = monthlyClosingBalances({
      financialYear: "2023-24",
      openingBalance: 0,
      contributions: [],
      transfers: [transfer()],
      establishmentId: "est-a",
    });
    expect(balances["2023-05"]).toBe(0);
    expect(balances["2023-06"]).toBe(5000);
    expect(balances["2024-03"]).toBe(5000);
  });

  it("ignores transfers that never settled", () => {
    const balances = monthlyClosingBalances({
      financialYear: "2023-24",
      openingBalance: 0,
      contributions: [],
      transfers: [transfer({ status: "initiated" })],
      establishmentId: "est-a",
    });
    expect(balances["2024-03"]).toBe(0);
  });
});

describe("interestForFinancialYear", () => {
  // Hand-checkable: money present for all twelve months earns exactly the
  // annual rate. 10,000 at 8.25% for FY 2023-24 = 825.
  it("credits the full annual rate on money present all year", () => {
    const year = interestForFinancialYear({
      financialYear: "2023-24",
      openingBalance: 10000,
      contributions: [],
      transfers: [],
      establishmentId: "est-a",
    });
    expect(year.rate).toBe(0.0825);
    expect(year.interest).toBe(825);
    expect(year.closingBalance).toBe(10825);
  });

  // Money arriving in the final month earns exactly one twelfth.
  it("credits one twelfth for money that arrives in March", () => {
    const year = interestForFinancialYear({
      financialYear: "2023-24",
      openingBalance: 0,
      contributions: [contribution("2024-03", 12000)],
      transfers: [],
      establishmentId: "est-a",
    });
    expect(year.interest).toBe(82.5); // 12000 × 8.25% ÷ 12
    expect(year.closingBalance).toBe(12082.5);
  });

  it("earns nothing on a zero balance", () => {
    const year = interestForFinancialYear({
      financialYear: "2023-24",
      openingBalance: 0,
      contributions: [],
      transfers: [],
      establishmentId: "est-a",
    });
    expect(year.interest).toBe(0);
    expect(year.closingBalance).toBe(0);
  });

  it("never charges interest on a negative balance", () => {
    const year = interestForFinancialYear({
      financialYear: "2023-24",
      openingBalance: -5000,
      contributions: [],
      transfers: [],
      establishmentId: "est-a",
    });
    expect(year.interest).toBe(0);
  });

  it("flags a year EPFO has not declared a rate for, rather than showing zero", () => {
    const year = interestForFinancialYear({
      financialYear: "2030-31",
      openingBalance: 100000,
      contributions: [],
      transfers: [],
      establishmentId: "est-a",
    });
    expect(year.rateMissing).toBe(true);
    expect(year.rate).toBeNull();
    expect(year.interest).toBe(0);
    // The balance still carries forward — only the interest is unknown.
    expect(year.closingBalance).toBe(100000);
  });

  it("uses each year's own declared rate", () => {
    const a = interestForFinancialYear({
      financialYear: "2021-22", // 8.10%
      openingBalance: 100000,
      contributions: [],
      transfers: [],
      establishmentId: "est-a",
    });
    const b = interestForFinancialYear({
      financialYear: "2022-23", // 8.15%
      openingBalance: 100000,
      contributions: [],
      transfers: [],
      establishmentId: "est-a",
    });
    expect(a.interest).toBe(8100);
    expect(b.interest).toBe(8150);
  });
});

describe("financial year boundaries", () => {
  it("puts a March contribution in the earlier year and April in the later one", () => {
    const march = interestForFinancialYear({
      financialYear: "2023-24",
      openingBalance: 0,
      contributions: [contribution("2024-03", 12000)],
      transfers: [],
      establishmentId: "est-a",
    });
    const april = interestForFinancialYear({
      financialYear: "2024-25",
      openingBalance: 0,
      contributions: [contribution("2024-04", 12000)],
      transfers: [],
      establishmentId: "est-a",
    });

    expect(march.monthlyBalances["2024-03"]).toBe(12000);
    expect(march.monthlyBalances["2024-04"]).toBeUndefined();
    expect(april.monthlyBalances["2024-04"]).toBe(12000);
  });
});

describe("interestSchedule", () => {
  it("chains each year's opening balance from the previous close, including interest", () => {
    const schedule = interestSchedule({
      contributions: [contribution("2023-04", 10000)],
      transfers: [],
      establishmentId: "est-a",
      throughFinancialYear: "2024-25",
    });

    expect(schedule.map((year) => year.financialYear)).toEqual(["2023-24", "2024-25"]);

    const [first, second] = schedule;
    expect(first.interest).toBe(825);
    expect(first.closingBalance).toBe(10825);

    // The second year opens on the first year's close, so interest compounds.
    expect(second.openingBalance).toBe(10825);
    expect(second.interest).toBe(893.06); // 10825 × 8.25%
    expect(second.closingBalance).toBe(11718.06);
  });

  it("does not skip a year with no contributions — the balance still earns", () => {
    const schedule = interestSchedule({
      contributions: [contribution("2021-04", 10000)],
      transfers: [],
      establishmentId: "est-a",
      throughFinancialYear: "2023-24",
    });
    expect(schedule.map((year) => year.financialYear)).toEqual([
      "2021-22",
      "2022-23",
      "2023-24",
    ]);
    expect(schedule[1].interest).toBeGreaterThan(0);
  });

  it("is deterministic — the same inputs always produce the same schedule", () => {
    const args = {
      contributions: [contribution("2023-04", 10000), contribution("2023-09", 5000)],
      transfers: [],
      establishmentId: "est-a",
      throughFinancialYear: "2024-25",
    };
    expect(interestSchedule(args)).toEqual(interestSchedule(args));
  });

  it("returns nothing when the establishment has no activity at all", () => {
    expect(
      interestSchedule({
        contributions: [],
        transfers: [],
        establishmentId: "est-a",
        throughFinancialYear: "2024-25",
      })
    ).toEqual([]);
  });

  it("ignores another establishment's contributions", () => {
    expect(
      interestSchedule({
        contributions: [contribution("2023-04", 10000, { establishmentId: "est-b" })],
        transfers: [],
        establishmentId: "est-a",
        throughFinancialYear: "2024-25",
      })
    ).toEqual([]);
  });
});

describe("activeFinancialYears", () => {
  it("fills the gap between the first activity and the cut-off", () => {
    const years = activeFinancialYears({
      contributions: [contribution("2021-06", 1000)],
      transfers: [],
      establishmentId: "est-a",
      throughFinancialYear: "2024-25",
    });
    expect(years).toEqual(["2021-22", "2022-23", "2023-24", "2024-25"]);
  });

  it("counts a completed transfer as activity", () => {
    const years = activeFinancialYears({
      contributions: [],
      transfers: [transfer({ date: "2023-06-10" })],
      establishmentId: "est-a",
      throughFinancialYear: "2023-24",
    });
    expect(years).toEqual(["2023-24"]);
  });
});

describe("interestEntryId", () => {
  it("is stable for the same establishment and year", () => {
    expect(interestEntryId("est-a", "2023-24")).toBe(interestEntryId("est-a", "2023-24"));
  });

  it("does not collide across establishments or years", () => {
    expect(interestEntryId("est-a", "2023-24")).not.toBe(interestEntryId("est-b", "2023-24"));
    expect(interestEntryId("est-a", "2023-24")).not.toBe(interestEntryId("est-a", "2024-25"));
  });
});

describe("creditableYears and buildInterestEntry", () => {
  it("writes only years with a declared rate and real interest", () => {
    const schedule = [
      { financialYear: "2023-24", rate: 0.0825, openingBalance: 0, monthlyBalances: {}, interest: 825, closingBalance: 10825, rateMissing: false },
      { financialYear: "2030-31", rate: null, openingBalance: 0, monthlyBalances: {}, interest: 0, closingBalance: 0, rateMissing: true },
      { financialYear: "2024-25", rate: 0.0825, openingBalance: 0, monthlyBalances: {}, interest: 0, closingBalance: 0, rateMissing: false },
    ];
    expect(creditableYears(schedule).map((year) => year.financialYear)).toEqual(["2023-24"]);
  });

  it("stores the rate actually used, so a later table correction stays visible", () => {
    const entry = buildInterestEntry("est-a", {
      financialYear: "2023-24",
      rate: 0.0825,
      openingBalance: 0,
      monthlyBalances: {},
      interest: 825,
      closingBalance: 10825,
      rateMissing: false,
    });
    expect(entry.rate).toBe(0.0825);
    expect(entry.basis).toBe("monthlyRunningBalance");
    expect(entry.establishmentId).toBe("est-a");
  });
});

describe("summariseInterest", () => {
  it("totals interest and names the years still awaiting a rate", () => {
    const summary = summariseInterest([
      { financialYear: "2023-24", rate: 0.0825, openingBalance: 0, monthlyBalances: {}, interest: 825, closingBalance: 0, rateMissing: false },
      { financialYear: "2030-31", rate: null, openingBalance: 0, monthlyBalances: {}, interest: 0, closingBalance: 0, rateMissing: true },
    ]);
    expect(summary.totalInterest).toBe(825);
    expect(summary.yearCount).toBe(1);
    expect(summary.missingRateYears).toEqual(["2030-31"]);
  });
});

describe("normalizeInterestEntry", () => {
  it("survives a drifted or empty document", () => {
    const entry = normalizeInterestEntry("est-a_2023-24", {});
    expect(entry.interest).toBe(0);
    expect(entry.rate).toBe(0);
    expect(entry.basis).toBe("monthlyRunningBalance");
  });

  it("treats a non-numeric amount as zero", () => {
    expect(normalizeInterestEntry("x", { interest: "825" }).interest).toBe(0);
  });
});
