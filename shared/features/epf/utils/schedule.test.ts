import { describe, expect, it } from "vitest";

import type { EpfContribution, EpfEstablishment } from "@/shared/features/epf/types";
import {
  buildExpectedContribution,
  canOverwriteWithSimulated,
  expectedCreditWindow,
  isSchedulable,
  monthsToGenerate,
  planScheduledContributions,
  selectEstablishmentForMonth,
  wageForProjection,
} from "@/shared/features/epf/utils/schedule";

function establishment(overrides: Partial<EpfEstablishment> = {}): EpfEstablishment {
  return {
    id: "est-a",
    profileId: "main",
    employerName: "Acme",
    establishmentNumber: "MHBAN0012345000",
    memberId: "MHBAN00123450000012345",
    dateJoined: "2024-01-01",
    employmentStatus: "current",
    ...overrides,
  };
}

function contribution(overrides: Partial<EpfContribution> = {}): EpfContribution {
  return {
    id: "est-a_2026-08",
    establishmentId: "est-a",
    month: "2026-08",
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

describe("expectedCreditWindow", () => {
  it("places the window in the month after the contribution month", () => {
    expect(expectedCreditWindow("2026-08")).toEqual({
      from: "2026-09-15",
      to: "2026-09-25",
    });
  });

  it("rolls into the next year from December", () => {
    expect(expectedCreditWindow("2026-12")).toEqual({
      from: "2027-01-15",
      to: "2027-01-25",
    });
  });

  it("never produces a date the credit month does not have", () => {
    // January credits for a December contribution — 31 days, so no clamping;
    // the guard matters for any future rule with a day beyond 28.
    const window = expectedCreditWindow("2026-01");
    expect(Number(window.to.slice(8, 10))).toBeLessThanOrEqual(28 + 3);
  });
});

describe("selectEstablishmentForMonth — the job-change rule", () => {
  // The scenario stated in the ticket: A ends August 2026, B starts September.
  const a = establishment({
    id: "A",
    dateJoined: "2024-01-01",
    dateLeft: "2026-08-31",
    employmentStatus: "previous",
  });
  const b = establishment({ id: "B", dateJoined: "2026-09-01" });
  const both = [a, b];

  it("gives August to A", () => {
    expect(selectEstablishmentForMonth(both, "2026-08")?.id).toBe("A");
  });

  it("gives September to B, never to A", () => {
    expect(selectEstablishmentForMonth(both, "2026-09")?.id).toBe("B");
  });

  it("gives a month before either employment to nobody", () => {
    expect(selectEstablishmentForMonth(both, "2023-12")).toBeNull();
  });

  it("ignores archived establishments entirely", () => {
    const archived = [establishment({ id: "A", archived: true })];
    expect(selectEstablishmentForMonth(archived, "2026-08")).toBeNull();
  });

  it("prefers the later-joined employment when two overlap", () => {
    const overlapping = [
      establishment({ id: "old", dateJoined: "2020-01-01" }),
      establishment({ id: "new", dateJoined: "2025-01-01" }),
    ];
    expect(selectEstablishmentForMonth(overlapping, "2026-08")?.id).toBe("new");
  });
});

describe("monthsToGenerate", () => {
  const current = establishment({ id: "A", dateJoined: "2026-06-01" });

  it("generates every month from joining through the cut-off", () => {
    expect(
      monthsToGenerate({
        establishment: current,
        allEstablishments: [current],
        existing: [],
        throughMonth: "2026-09",
      })
    ).toEqual(["2026-06", "2026-07", "2026-08", "2026-09"]);
  });

  it("skips months that already have a record — a repeat run writes nothing", () => {
    const existing = [
      { month: "2026-06" },
      { month: "2026-07" },
      { month: "2026-08" },
      { month: "2026-09" },
    ];
    expect(
      monthsToGenerate({
        establishment: current,
        allEstablishments: [current],
        existing,
        throughMonth: "2026-09",
      })
    ).toEqual([]);
  });

  it("never generates past the last working month", () => {
    const left = establishment({
      id: "A",
      dateJoined: "2026-06-01",
      dateLeft: "2026-08-31",
      employmentStatus: "previous",
    });
    const months = monthsToGenerate({
      establishment: left,
      allEstablishments: [left],
      existing: [],
      throughMonth: "2026-12",
    });
    expect(months).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(months).not.toContain("2026-09");
  });

  it("does not generate a month a later establishment owns", () => {
    const a = establishment({
      id: "A",
      dateJoined: "2026-06-01",
      dateLeft: "2026-08-31",
      employmentStatus: "previous",
    });
    const b = establishment({ id: "B", dateJoined: "2026-09-01" });

    expect(
      monthsToGenerate({
        establishment: a,
        allEstablishments: [a, b],
        existing: [],
        throughMonth: "2026-09",
      })
    ).not.toContain("2026-09");

    expect(
      monthsToGenerate({
        establishment: b,
        allEstablishments: [a, b],
        existing: [],
        throughMonth: "2026-09",
      })
    ).toEqual(["2026-09"]);
  });

  it("generates nothing for an archived establishment", () => {
    const archived = establishment({ id: "A", archived: true });
    expect(
      monthsToGenerate({
        establishment: archived,
        allEstablishments: [archived],
        existing: [],
        throughMonth: "2026-09",
      })
    ).toEqual([]);
  });

  it("never generates beyond the cut-off month", () => {
    const months = monthsToGenerate({
      establishment: current,
      allEstablishments: [current],
      existing: [],
      throughMonth: "2026-07",
    });
    expect(months).toEqual(["2026-06", "2026-07"]);
  });
});

describe("canOverwriteWithSimulated", () => {
  it("refuses to overwrite a hand-entered historical month", () => {
    expect(canOverwriteWithSimulated({ source: "manualHistorical" })).toBe(false);
  });

  it("refuses to overwrite imported data", () => {
    expect(canOverwriteWithSimulated({ source: "imported" })).toBe(false);
  });

  it("allows writing where nothing exists", () => {
    expect(canOverwriteWithSimulated(undefined)).toBe(true);
  });

  it("allows replacing an earlier simulated row", () => {
    expect(canOverwriteWithSimulated({ source: "simulated" })).toBe(true);
  });
});

describe("wageForProjection", () => {
  it("uses the most recently recorded wage", () => {
    expect(
      wageForProjection([
        { month: "2026-06", wage: 20000 },
        { month: "2026-08", wage: 30000 },
        { month: "2026-07", wage: 25000 },
      ])
    ).toBe(30000);
  });

  it("ignores months recorded with no wage", () => {
    expect(
      wageForProjection([
        { month: "2026-08", wage: 0 },
        { month: "2026-06", wage: 20000 },
      ])
    ).toBe(20000);
  });

  it("returns zero when there is nothing to project from", () => {
    expect(wageForProjection([])).toBe(0);
  });
});

describe("buildExpectedContribution", () => {
  it("produces an expected, simulated row with a following-month window", () => {
    const row = buildExpectedContribution({
      establishment: establishment({ id: "A" }),
      month: "2026-08",
      wage: 25000,
    });
    expect(row.status).toBe("expected");
    expect(row.source).toBe("simulated");
    expect(row.month).toBe("2026-08");
    expect(row.expectedCreditFrom).toBe("2026-09-15");
    expect(row.expectedCreditTo).toBe("2026-09-25");
    expect(row.persisted).toBe(false);
  });

  it("applies the KAN-66 statutory split, including the EPS cap", () => {
    const row = buildExpectedContribution({
      establishment: establishment(),
      month: "2026-08",
      wage: 50000,
    });
    expect(row.epsShare).toBe(1250);
    expect(row.employerEpfShare).toBe(4750);
    expect(row.epfCredit).toBe(10750);
  });

  it("honours a non-EPS establishment", () => {
    const row = buildExpectedContribution({
      establishment: establishment({ epsMember: false }),
      month: "2026-08",
      wage: 50000,
    });
    expect(row.epsShare).toBe(0);
    expect(row.epfCredit).toBe(12000);
  });
});

describe("planScheduledContributions", () => {
  const current = establishment({ id: "A", dateJoined: "2026-06-01" });

  it("plans only the missing months, projected from the latest wage", () => {
    const rows = planScheduledContributions({
      establishment: current,
      allEstablishments: [current],
      existing: [contribution({ month: "2026-06", establishmentId: "A", wage: 25000 })],
      throughMonth: "2026-08",
    });
    expect(rows.map((row) => row.month)).toEqual(["2026-07", "2026-08"]);
    expect(rows[0].employeeShare).toBe(3000);
  });

  it("writes nothing when there is no wage to project from", () => {
    expect(
      planScheduledContributions({
        establishment: current,
        allEstablishments: [current],
        existing: [],
        throughMonth: "2026-08",
      })
    ).toEqual([]);
  });

  it("is idempotent — a second run with the first run's output plans nothing", () => {
    const existing = [contribution({ month: "2026-06", establishmentId: "A" })];
    const first = planScheduledContributions({
      establishment: current,
      allEstablishments: [current],
      existing,
      throughMonth: "2026-08",
    });

    const afterFirstRun: EpfContribution[] = [
      ...existing,
      ...first.map((row) =>
        contribution({ ...row, id: `A_${row.month}`, establishmentId: "A", month: row.month })
      ),
    ];

    expect(
      planScheduledContributions({
        establishment: current,
        allEstablishments: [current],
        existing: afterFirstRun,
        throughMonth: "2026-08",
      })
    ).toEqual([]);
  });

  it("leaves a hand-entered month untouched", () => {
    const rows = planScheduledContributions({
      establishment: current,
      allEstablishments: [current],
      existing: [
        contribution({ month: "2026-06", establishmentId: "A", source: "manualHistorical" }),
        contribution({ month: "2026-07", establishmentId: "A", source: "manualHistorical" }),
      ],
      throughMonth: "2026-07",
    });
    expect(rows).toEqual([]);
  });
});

describe("isSchedulable", () => {
  it("accepts an open-ended, non-archived employment", () => {
    expect(isSchedulable(establishment())).toBe(true);
  });

  it("rejects a closed employment", () => {
    expect(
      isSchedulable(establishment({ dateLeft: "2026-08-31", employmentStatus: "previous" }))
    ).toBe(false);
  });

  it("rejects an archived employment", () => {
    expect(isSchedulable(establishment({ archived: true }))).toBe(false);
  });
});
