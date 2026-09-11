import { describe, expect, it } from "vitest";

import type { EpfEstablishment } from "@/shared/features/epf/types";
import {
  deriveEmploymentState,
  deriveEmploymentStatus,
  establishmentDurationMonths,
  findActiveEstablishment,
  formatUan,
  isValidUan,
  maskIdentifier,
  maskUan,
  normalizeEstablishment,
  normalizeUan,
  periodsOverlap,
  sortEstablishments,
  splitArchivedEstablishments,
  validateEstablishmentAgainstExisting,
} from "@/shared/features/epf/utils";

function makeEstablishment(overrides: Partial<EpfEstablishment> = {}): EpfEstablishment {
  return {
    id: "est-1",
    profileId: "main",
    employerName: "Acme Pvt Ltd",
    establishmentNumber: "MHBAN0012345000",
    memberId: "MHBAN00123450000012345",
    dateJoined: "2020-01-01",
    employmentStatus: "current",
    ...overrides,
  };
}

describe("UAN helpers", () => {
  it("strips spaces and hyphens when normalizing", () => {
    expect(normalizeUan("1001 2345 6789")).toBe("100123456789");
    expect(normalizeUan("1001-2345-6789")).toBe("100123456789");
  });

  it("accepts exactly 12 digits and rejects anything else", () => {
    expect(isValidUan("100123456789")).toBe(true);
    expect(isValidUan("1001 2345 6789")).toBe(true);
    expect(isValidUan("10012345678")).toBe(false);
    expect(isValidUan("1001234567890")).toBe(false);
    expect(isValidUan("10012345678A")).toBe(false);
    expect(isValidUan("")).toBe(false);
  });

  it("groups a valid UAN for the reveal view and masks all but the last four", () => {
    expect(formatUan("100123456789")).toBe("1001 2345 6789");
    expect(maskUan("100123456789")).toBe("•••• •••• 6789");
  });

  it("does not crash or over-reveal on a malformed UAN", () => {
    expect(formatUan("abc")).toBe("abc");
    expect(maskUan("123")).toBe("•••");
  });
});

describe("maskIdentifier", () => {
  it("keeps only the trailing characters", () => {
    expect(maskIdentifier("MHBAN0012345000")).toBe("•".repeat(11) + "5000");
  });

  it("fully masks values at or below the visible length", () => {
    expect(maskIdentifier("1234")).toBe("••••");
    expect(maskIdentifier("12")).toBe("••");
  });

  it("returns an empty string for missing values rather than throwing", () => {
    expect(maskIdentifier(undefined)).toBe("");
    expect(maskIdentifier(null)).toBe("");
    expect(maskIdentifier("   ")).toBe("");
  });
});

describe("deriveEmploymentStatus", () => {
  it("treats a missing, null or empty leaving date as current", () => {
    expect(deriveEmploymentStatus(undefined)).toBe("current");
    expect(deriveEmploymentStatus(null)).toBe("current");
    expect(deriveEmploymentStatus("")).toBe("current");
  });

  it("treats a present leaving date as previous", () => {
    expect(deriveEmploymentStatus("2024-03-31")).toBe("previous");
  });
});

describe("deriveEmploymentState", () => {
  const today = "2026-09-11";

  it("reads a future joining date as upcoming", () => {
    expect(deriveEmploymentState({ dateJoined: "2026-10-01" }, today)).toBe("upcoming");
  });

  it("reads joining today as current", () => {
    expect(deriveEmploymentState({ dateJoined: today }, today)).toBe("current");
  });

  it("reads any leaving date as previous, including today", () => {
    expect(deriveEmploymentState({ dateJoined: "2020-01-01", dateLeft: today }, today)).toBe(
      "previous"
    );
  });
});

describe("normalizeEstablishment", () => {
  it("recomputes a stored status that disagrees with the leaving date", () => {
    const result = normalizeEstablishment("est-9", {
      employerName: "Acme",
      dateJoined: "2020-01-01",
      dateLeft: "2022-06-30",
      employmentStatus: "current", // stale/wrong on the stored doc
    });
    expect(result.employmentStatus).toBe("previous");
  });

  it("treats an empty-string leaving date as still employed", () => {
    const result = normalizeEstablishment("est-9", {
      employerName: "Acme",
      dateJoined: "2020-01-01",
      dateLeft: "",
    });
    expect(result.dateLeft).toBeUndefined();
    expect(result.employmentStatus).toBe("current");
  });

  it("defaults profileId for documents written before the field existed", () => {
    expect(normalizeEstablishment("est-9", { dateJoined: "2020-01-01" }).profileId).toBe("main");
  });
});

describe("periodsOverlap", () => {
  it("detects a fully contained period", () => {
    expect(
      periodsOverlap(
        { dateJoined: "2020-01-01", dateLeft: "2024-01-01" },
        { dateJoined: "2021-01-01", dateLeft: "2022-01-01" }
      )
    ).toBe(true);
  });

  it("detects a partial overlap", () => {
    expect(
      periodsOverlap(
        { dateJoined: "2020-01-01", dateLeft: "2022-01-01" },
        { dateJoined: "2021-06-01", dateLeft: "2023-01-01" }
      )
    ).toBe(true);
  });

  it("does not flag disjoint periods", () => {
    expect(
      periodsOverlap(
        { dateJoined: "2020-01-01", dateLeft: "2021-01-01" },
        { dateJoined: "2022-01-01", dateLeft: "2023-01-01" }
      )
    ).toBe(false);
  });

  it("allows a same-day handover", () => {
    expect(
      periodsOverlap(
        { dateJoined: "2020-01-01", dateLeft: "2024-03-31" },
        { dateJoined: "2024-03-31" }
      )
    ).toBe(false);
  });

  it("flags two open-ended periods", () => {
    expect(periodsOverlap({ dateJoined: "2020-01-01" }, { dateJoined: "2023-01-01" })).toBe(true);
  });

  it("flags an open-ended period swallowing a later closed one", () => {
    expect(
      periodsOverlap(
        { dateJoined: "2020-01-01" },
        { dateJoined: "2023-01-01", dateLeft: "2024-01-01" }
      )
    ).toBe(true);
  });
});

describe("validateEstablishmentAgainstExisting", () => {
  it("accepts the first establishment", () => {
    expect(validateEstablishmentAgainstExisting([], { dateJoined: "2020-01-01" })).toEqual({
      ok: true,
    });
  });

  it("rejects a leaving date before the joining date", () => {
    const result = validateEstablishmentAgainstExisting([], {
      dateJoined: "2020-01-01",
      dateLeft: "2019-12-31",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("left_before_joined");
  });

  it("rejects a second open-ended employment and names the blocker", () => {
    const existing = [makeEstablishment({ id: "a", employerName: "Acme" })];
    const result = validateEstablishmentAgainstExisting(existing, {
      dateJoined: "2024-01-01",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("multiple_current");
      expect(result.conflictingId).toBe("a");
      expect(result.message).toContain("Acme");
    }
  });

  it("reports multiple_current ahead of overlapping_period", () => {
    // The open-ended existing record both overlaps AND is current; the user
    // needs the actionable message, not a generic overlap complaint.
    const existing = [makeEstablishment({ id: "a", dateJoined: "2020-01-01" })];
    const result = validateEstablishmentAgainstExisting(existing, {
      dateJoined: "2021-01-01",
    });
    if (!result.ok) expect(result.code).toBe("multiple_current");
  });

  it("rejects overlapping closed periods", () => {
    const existing = [
      makeEstablishment({
        id: "a",
        dateJoined: "2020-01-01",
        dateLeft: "2022-01-01",
        employmentStatus: "previous",
      }),
    ];
    const result = validateEstablishmentAgainstExisting(existing, {
      dateJoined: "2021-01-01",
      dateLeft: "2023-01-01",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("overlapping_period");
  });

  it("excludes the record being edited from its own conflict check", () => {
    const existing = [makeEstablishment({ id: "a" })];
    expect(
      validateEstablishmentAgainstExisting(existing, { id: "a", dateJoined: "2020-01-01" })
    ).toEqual({ ok: true });
  });

  it("allows a new current employment once the previous one is closed", () => {
    const existing = [
      makeEstablishment({
        id: "a",
        dateJoined: "2019-06-01",
        dateLeft: "2021-05-31",
        employmentStatus: "previous",
      }),
    ];
    expect(validateEstablishmentAgainstExisting(existing, { dateJoined: "2021-06-01" })).toEqual({
      ok: true,
    });
  });

  it("allows a same-day handover join", () => {
    const existing = [
      makeEstablishment({
        id: "a",
        dateJoined: "2019-06-01",
        dateLeft: "2021-05-31",
        employmentStatus: "previous",
      }),
    ];
    expect(validateEstablishmentAgainstExisting(existing, { dateJoined: "2021-05-31" })).toEqual({
      ok: true,
    });
  });
});

describe("findActiveEstablishment", () => {
  it("returns null when every employment is closed", () => {
    const list = [
      makeEstablishment({ id: "a", dateLeft: "2022-01-01", employmentStatus: "previous" }),
    ];
    expect(findActiveEstablishment(list)).toBeNull();
  });

  it("returns the open-ended establishment", () => {
    const list = [
      makeEstablishment({ id: "a", dateLeft: "2022-01-01", employmentStatus: "previous" }),
      makeEstablishment({ id: "b", dateJoined: "2022-01-01" }),
    ];
    expect(findActiveEstablishment(list)?.id).toBe("b");
  });
});

describe("sortEstablishments", () => {
  it("puts the current employment first, then most recently joined", () => {
    const list = [
      makeEstablishment({
        id: "old",
        dateJoined: "2015-01-01",
        dateLeft: "2018-01-01",
        employmentStatus: "previous",
      }),
      makeEstablishment({ id: "current", dateJoined: "2021-01-01" }),
      makeEstablishment({
        id: "mid",
        dateJoined: "2018-01-01",
        dateLeft: "2021-01-01",
        employmentStatus: "previous",
      }),
    ];
    expect(sortEstablishments(list).map((item) => item.id)).toEqual(["current", "mid", "old"]);
  });

  it("does not mutate the input array", () => {
    const list = [
      makeEstablishment({ id: "a", dateLeft: "2022-01-01", employmentStatus: "previous" }),
      makeEstablishment({ id: "b" }),
    ];
    sortEstablishments(list);
    expect(list.map((item) => item.id)).toEqual(["a", "b"]);
  });
});

describe("archiving", () => {
  it("reports archived ahead of every other state", () => {
    const archivedCurrent = makeEstablishment({ archived: true });
    expect(deriveEmploymentState(archivedCurrent, "2026-09-11")).toBe("archived");

    const archivedPrevious = makeEstablishment({
      archived: true,
      dateLeft: "2022-01-01",
      employmentStatus: "previous",
    });
    expect(deriveEmploymentState(archivedPrevious, "2026-09-11")).toBe("archived");
  });

  it("does not treat an archived open-ended record as the active employment", () => {
    const list = [makeEstablishment({ id: "a", archived: true })];
    expect(findActiveEstablishment(list)).toBeNull();
  });

  it("lets a new current employment be added alongside an archived open-ended one", () => {
    const existing = [makeEstablishment({ id: "a", archived: true })];
    expect(validateEstablishmentAgainstExisting(existing, { dateJoined: "2024-01-01" })).toEqual({
      ok: true,
    });
  });

  it("does not flag an overlap against an archived period", () => {
    const existing = [
      makeEstablishment({
        id: "a",
        archived: true,
        dateJoined: "2020-01-01",
        dateLeft: "2024-01-01",
        employmentStatus: "previous",
      }),
    ];
    expect(
      validateEstablishmentAgainstExisting(existing, {
        dateJoined: "2021-01-01",
        dateLeft: "2022-01-01",
      })
    ).toEqual({ ok: true });
  });

  it("still blocks a second live current employment when an archived one exists", () => {
    const existing = [
      makeEstablishment({ id: "archived", archived: true }),
      makeEstablishment({ id: "live", employerName: "Live Co", dateJoined: "2023-01-01" }),
    ];
    const result = validateEstablishmentAgainstExisting(existing, { dateJoined: "2024-01-01" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.conflictingId).toBe("live");
  });

  it("reads archived only from an explicit true", () => {
    expect(normalizeEstablishment("x", { dateJoined: "2020-01-01" }).archived).toBeUndefined();
    expect(
      normalizeEstablishment("x", { dateJoined: "2020-01-01", archived: false }).archived
    ).toBeUndefined();
    expect(
      normalizeEstablishment("x", { dateJoined: "2020-01-01", archived: true }).archived
    ).toBe(true);
  });

  it("sorts archived records last, below even previous employments", () => {
    const list = [
      makeEstablishment({ id: "archived", archived: true, dateJoined: "2025-01-01" }),
      makeEstablishment({
        id: "previous",
        dateJoined: "2018-01-01",
        dateLeft: "2021-01-01",
        employmentStatus: "previous",
      }),
      makeEstablishment({ id: "current", dateJoined: "2021-01-01" }),
    ];
    expect(sortEstablishments(list).map((item) => item.id)).toEqual([
      "current",
      "previous",
      "archived",
    ]);
  });

  it("splits live from archived while preserving order", () => {
    const list = [
      makeEstablishment({ id: "a" }),
      makeEstablishment({ id: "b", archived: true }),
      makeEstablishment({ id: "c" }),
    ];
    const { live, archived } = splitArchivedEstablishments(list);
    expect(live.map((item) => item.id)).toEqual(["a", "c"]);
    expect(archived.map((item) => item.id)).toEqual(["b"]);
  });
});

describe("establishmentDurationMonths", () => {
  it("counts whole months for a closed period", () => {
    expect(
      establishmentDurationMonths(
        { dateJoined: "2020-01-01", dateLeft: "2021-01-01" },
        "2026-09-11"
      )
    ).toBe(12);
  });

  it("does not count a partial trailing month", () => {
    expect(
      establishmentDurationMonths(
        { dateJoined: "2020-01-15", dateLeft: "2020-03-10" },
        "2026-09-11"
      )
    ).toBe(1);
  });

  it("measures an open period against today", () => {
    expect(establishmentDurationMonths({ dateJoined: "2026-03-11" }, "2026-09-11")).toBe(6);
  });

  it("never returns a negative duration", () => {
    expect(
      establishmentDurationMonths(
        { dateJoined: "2026-01-01", dateLeft: "2025-01-01" },
        "2026-09-11"
      )
    ).toBe(0);
  });
});
