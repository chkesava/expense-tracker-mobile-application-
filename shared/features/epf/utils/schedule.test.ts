import { describe, expect, it } from "vitest";

import type { EpfContribution, EpfEstablishment } from "@/shared/features/epf/types";
import { contributionMonthsFor } from "@/shared/features/epf/utils/contributions";
import {
  backfillThroughMonth,
  buildExpectedContribution,
  canOverwriteWithSimulated,
  expectedCreditWindow,
  isSchedulable,
  monthKeyFromTimestamp,
  statutoryDueDate,
  monthsToGenerate,
  planScheduledContributions,
  scheduleStartMonth,
  selectEstablishmentForMonth,
  simulatedMonthsNeedingReview,
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

  it("without a recorded month or schedule marker, only generates the cut-off month", () => {
    // SPENDLY-19: dateJoined is not the floor. A 2019 joining date must not
    // mint every month through today at the current wage.
    expect(
      monthsToGenerate({
        establishment: current,
        allEstablishments: [current],
        existing: [],
        throughMonth: "2026-09",
      })
    ).toEqual(["2026-09"]);
  });

  it("starts at the first recorded month rather than dateJoined", () => {
    const longEmployment = establishment({ id: "A", dateJoined: "2019-01-01" });
    expect(
      monthsToGenerate({
        establishment: longEmployment,
        allEstablishments: [longEmployment],
        existing: [{ month: "2026-08" }],
        throughMonth: "2026-09",
      })
    ).toEqual(["2026-09"]);
  });

  it("honours an explicit scheduleFrom marker", () => {
    const marked = establishment({
      id: "A",
      dateJoined: "2019-01-01",
      scheduleFrom: "2026-08",
    });
    expect(
      monthsToGenerate({
        establishment: marked,
        allEstablishments: [marked],
        existing: [],
        throughMonth: "2026-09",
      })
    ).toEqual(["2026-08", "2026-09"]);
  });

  it("uses the establishment created month when nothing has been recorded", () => {
    const added = establishment({
      id: "A",
      dateJoined: "2019-01-01",
      createdAt: new Date("2026-06-15T12:00:00+05:30"),
    });
    expect(
      monthsToGenerate({
        establishment: added,
        allEstablishments: [added],
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

  it("does not regenerate an archived contribution month", () => {
    const existing = [{ month: "2026-09" }];
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
      scheduleFrom: "2026-06",
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
    expect(months).toEqual(["2026-07"]);
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

  it("plans only the current missing month, projected from the latest wage", () => {
    const rows = planScheduledContributions({
      establishment: current,
      allEstablishments: [current],
      existing: [contribution({ month: "2026-06", establishmentId: "A", wage: 25000 })],
      throughMonth: "2026-08",
    });
    expect(rows.map((row) => row.month)).toEqual(["2026-08"]);
    expect(rows[0].employeeShare).toBe(3000);
  });

  it("does not simulate the years between dateJoined and the first recorded month", () => {
    const longEmployment = establishment({ id: "A", dateJoined: "2019-01-01" });
    const rows = planScheduledContributions({
      establishment: longEmployment,
      allEstablishments: [longEmployment],
      existing: [
        contribution({
          month: "2026-08",
          establishmentId: "A",
          wage: 25000,
          source: "manualHistorical",
        }),
      ],
      throughMonth: "2026-09",
    });
    expect(rows.map((row) => row.month)).toEqual(["2026-09"]);
    expect(rows[0].source).toBe("simulated");
    expect(rows[0].status).toBe("expected");
  });

  it("refuses historical months even when createdAt is years ago", () => {
    const oldAdd = establishment({
      id: "A",
      dateJoined: "2019-01-01",
      createdAt: new Date("2019-03-01T12:00:00+05:30"),
    });
    const rows = planScheduledContributions({
      establishment: oldAdd,
      allEstablishments: [oldAdd],
      existing: [
        contribution({
          month: "2026-08",
          establishmentId: "A",
          wage: 25000,
          source: "manualHistorical",
        }),
      ],
      throughMonth: "2026-09",
    });
    expect(rows.map((row) => row.month)).toEqual(["2026-09"]);
  });

  it("leaves already-generated simulated history in place", () => {
    const existing = [
      contribution({
        id: "A_2020-01",
        month: "2020-01",
        establishmentId: "A",
        source: "simulated",
        status: "expected",
        wage: 25000,
      }),
      contribution({
        month: "2026-08",
        establishmentId: "A",
        wage: 25000,
        source: "manualHistorical",
      }),
    ];
    const rows = planScheduledContributions({
      establishment: establishment({ id: "A", dateJoined: "2019-01-01" }),
      allEstablishments: [establishment({ id: "A", dateJoined: "2019-01-01" })],
      existing,
      throughMonth: "2026-09",
    });
    expect(rows.map((row) => row.month)).toEqual(["2026-09"]);
    expect(existing.filter((row) => row.month === "2020-01")).toHaveLength(1);
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

describe("statutoryDueDate", () => {
  it("is the 15th of the month after the wage month", () => {
    // EPFO: remit within 15 days of the close of the month. September wages
    // are due 15 October — the date the ticket's acceptance criterion names.
    expect(statutoryDueDate("2026-09")).toBe("2026-10-15");
  });

  it("crosses the year boundary", () => {
    expect(statutoryDueDate("2026-12")).toBe("2027-01-15");
  });

  it("is the start of the credit window, not a second definition of it", () => {
    for (const month of ["2024-02", "2025-06", "2026-11"]) {
      expect(statutoryDueDate(month)).toBe(expectedCreditWindow(month).from);
    }
  });

  it("lands on the 15th whatever the length of the credit month", () => {
    // February is the short month the window clamp exists for; the 15th is
    // never affected by it, and this pins that it never starts to be.
    expect(statutoryDueDate("2027-01")).toBe("2027-02-15");
    expect(statutoryDueDate("2024-01")).toBe("2024-02-15");
  });
});

describe("backfillThroughMonth", () => {
  it("stops before the in-progress month while employment is live", () => {
    // The reported bug: Backfill reached September, so Save all stamped the
    // current month `confirmed` and it rendered "Manual" before any credit
    // could have landed.
    expect(backfillThroughMonth(establishment(), "2026-09")).toBe("2026-08");
  });

  it("crosses the year boundary correctly", () => {
    expect(backfillThroughMonth(establishment(), "2026-01")).toBe("2025-12");
  });

  it("never falls below the joining month", () => {
    // Someone who started this month has no closed month. Rendering nothing
    // would leave no way to enter a wage, so `wageForProjection` would stay at
    // 0 and the scheduler would never generate anything at all.
    const joinedThisMonth = establishment({ dateJoined: "2026-09-04" });
    expect(backfillThroughMonth(joinedThisMonth, "2026-09")).toBe("2026-09");
  });

  it("gives a new joiner exactly one month to seed a wage from", () => {
    const joinedThisMonth = establishment({ dateJoined: "2026-09-04" });
    expect(
      contributionMonthsFor(joinedThisMonth, backfillThroughMonth(joinedThisMonth, "2026-09"))
    ).toEqual(["2026-09"]);
  });

  it("still excludes the current month once one closed month exists", () => {
    const joinedLastMonth = establishment({ dateJoined: "2026-08-01" });
    expect(backfillThroughMonth(joinedLastMonth, "2026-09")).toBe("2026-08");
  });

  it("includes the current month once employment has ended", () => {
    // A final month is history the moment the person leaves, so it stays
    // backfillable even though it is the month we are in.
    const left = establishment({ dateLeft: "2026-09-20", employmentStatus: "previous" });
    expect(backfillThroughMonth(left, "2026-09")).toBe("2026-09");
  });

  it("leaves a long-closed employment alone — its range is capped by dateLeft", () => {
    const old = establishment({ dateLeft: "2024-03-31", employmentStatus: "previous" });
    expect(backfillThroughMonth(old, "2026-09")).toBe("2026-09");
    expect(contributionMonthsFor(old, backfillThroughMonth(old, "2026-09")).at(-1)).toBe(
      "2024-03"
    );
  });

  it("does not change what the scheduler generates", () => {
    // Only Backfill narrows. `monthsToGenerate` must still reach the current
    // month, or nothing would ever create the row Current is built around.
    const months = monthsToGenerate({
      establishment: establishment({ dateJoined: "2026-07-01" }),
      allEstablishments: [establishment({ dateJoined: "2026-07-01" })],
      existing: [],
      throughMonth: "2026-09",
    });
    expect(months).toContain("2026-09");
  });
});

describe("scheduleStartMonth", () => {
  it("falls back to the cut-off when the establishment has no app-side bound", () => {
    expect(
      scheduleStartMonth({
        establishment: establishment({ dateJoined: "2019-01-01" }),
        existing: [],
        throughMonth: "2026-09",
      })
    ).toBe("2026-09");
  });

  it("takes the later of first recorded, scheduleFrom, and created month", () => {
    expect(
      scheduleStartMonth({
        establishment: establishment({
          dateJoined: "2019-01-01",
          scheduleFrom: "2026-06",
          createdAt: new Date("2026-01-15T12:00:00+05:30"),
        }),
        existing: [{ month: "2026-08" }],
        throughMonth: "2026-09",
      })
    ).toBe("2026-08");
  });

  it("never starts before dateJoined", () => {
    expect(
      scheduleStartMonth({
        establishment: establishment({
          dateJoined: "2026-09-01",
          scheduleFrom: "2026-01",
        }),
        existing: [],
        throughMonth: "2026-09",
      })
    ).toBe("2026-09");
  });
});

describe("monthKeyFromTimestamp", () => {
  it("reads a Date in IST", () => {
    expect(monthKeyFromTimestamp(new Date("2026-06-15T12:00:00+05:30"))).toBe("2026-06");
  });

  it("reads a Firestore-style seconds payload", () => {
    const seconds = Math.floor(new Date("2026-06-15T12:00:00+05:30").getTime() / 1000);
    expect(monthKeyFromTimestamp({ seconds, nanoseconds: 0 })).toBe("2026-06");
  });

  it("returns undefined for unusable values", () => {
    expect(monthKeyFromTimestamp(undefined)).toBeUndefined();
    expect(monthKeyFromTimestamp("not-a-date")).toBeUndefined();
  });
});

describe("simulatedMonthsNeedingReview", () => {
  it("flags simulated months before the first manual month", () => {
    const flagged = simulatedMonthsNeedingReview(
      [
        { month: "2020-01", source: "simulated" },
        { month: "2026-08", source: "manualHistorical" },
        { month: "2026-09", source: "simulated" },
      ],
      "2026-09"
    );
    expect(flagged.map((row) => row.month)).toEqual(["2020-01"]);
  });

  it("flags past simulated months when nothing has been recorded by hand", () => {
    const flagged = simulatedMonthsNeedingReview(
      [
        { month: "2020-01", source: "simulated" },
        { month: "2026-09", source: "simulated" },
      ],
      "2026-09"
    );
    expect(flagged.map((row) => row.month)).toEqual(["2020-01"]);
  });

  it("does not invent a delete — the helper only lists", () => {
    const existing = [{ month: "2020-01", source: "simulated" as const }];
    simulatedMonthsNeedingReview(existing, "2026-09");
    expect(existing).toEqual([{ month: "2020-01", source: "simulated" }]);
  });
});
