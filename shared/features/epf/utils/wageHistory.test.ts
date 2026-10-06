import { describe, expect, it } from "vitest";

import type { EpfWageHistoryEntry } from "@/shared/features/epf/types";
import {
  isWageChangeOverridden,
  normalizeWageHistoryEntry,
  previewWageChange,
  sortWageHistoryByEffectiveFrom,
  validateWageChange,
  wageChangeNeedsConfirmation,
  wageForMonth,
  wageHistoryEntryForMonth,
  wageHistoryWritePayload,
} from "@/shared/features/epf/utils/wageHistory";

function entry(overrides: Partial<EpfWageHistoryEntry> = {}): EpfWageHistoryEntry {
  return {
    id: "wh-1",
    establishmentId: "est-a",
    effectiveFromMonth: "2026-09",
    wage: 25000,
    epsEligible: true,
    createdAtMs: 1,
    updatedAtMs: 1,
    ...overrides,
  };
}

describe("wageForMonth", () => {
  it("falls back when no entry applies yet", () => {
    expect(wageForMonth([entry({ effectiveFromMonth: "2027-01" })], "2026-08", 20000)).toBe(20000);
  });

  it("picks the entry whose effective month is in force", () => {
    expect(wageForMonth([entry({ effectiveFromMonth: "2026-09", wage: 25000 })], "2026-10", 20000)).toBe(
      25000
    );
  });

  it("picks the newest entry at or before the month across multiple changes", () => {
    const history = [
      entry({ effectiveFromMonth: "2026-09", wage: 25000 }),
      entry({ effectiveFromMonth: "2027-01", wage: 30000 }),
    ];
    expect(wageForMonth(history, "2026-12", 20000)).toBe(25000);
    expect(wageForMonth(history, "2027-01", 20000)).toBe(30000);
    expect(wageForMonth(history, "2027-06", 20000)).toBe(30000);
  });

  it("does not apply a future effective month early", () => {
    expect(wageForMonth([entry({ effectiveFromMonth: "2026-09" })], "2026-08", 20000)).toBe(20000);
  });
});

describe("wageHistoryEntryForMonth", () => {
  it("returns null when nothing applies yet", () => {
    expect(wageHistoryEntryForMonth([entry({ effectiveFromMonth: "2027-01" })], "2026-08")).toBeNull();
  });

  it("returns the entry in force for the month", () => {
    const sept = entry({ id: "sept", effectiveFromMonth: "2026-09" });
    expect(wageHistoryEntryForMonth([sept], "2026-10")?.id).toBe("sept");
  });
});

describe("validateWageChange", () => {
  it("accepts a well-formed new entry", () => {
    expect(validateWageChange(entry(), [])).toEqual([]);
  });

  it("rejects an invalid month", () => {
    const issues = validateWageChange(entry({ effectiveFromMonth: "2026-13" }), []);
    expect(issues.some((issue) => issue.code === "invalid_month")).toBe(true);
  });

  it("rejects a duplicate effective month", () => {
    const issues = validateWageChange(entry(), [{ effectiveFromMonth: "2026-09" }]);
    expect(issues.some((issue) => issue.code === "duplicate_effective_month")).toBe(true);
  });

  it("rejects a negative wage", () => {
    const issues = validateWageChange(entry({ wage: -1 }), []);
    expect(issues.some((issue) => issue.code === "negative_amount")).toBe(true);
  });

  it("rejects an EPS override exceeding the employer override", () => {
    const issues = validateWageChange(
      entry({ employerShareOverride: 1000, epsShareOverride: 2000 }),
      []
    );
    expect(issues.some((issue) => issue.code === "eps_exceeds_employer")).toBe(true);
  });
});

describe("previewWageChange", () => {
  it("uses computeEpfContribution for the statutory split", () => {
    const preview = previewWageChange({ wage: 25000, effectiveFromMonth: "2026-09", epsEligible: true });
    expect(preview.employeeShare).toBe(3000);
    expect(preview.employerShare).toBe(3000);
    expect(preview.epsShare).toBe(1250);
    expect(preview.employerEpfShare).toBe(1750);
  });
});

describe("isWageChangeOverridden", () => {
  const computed = previewWageChange({ wage: 25000, effectiveFromMonth: "2026-09", epsEligible: true });

  it("is false with no overrides", () => {
    expect(isWageChangeOverridden(entry(), computed)).toBe(false);
  });

  it("is true when an override diverges from the computed split", () => {
    expect(
      isWageChangeOverridden(entry({ employeeShareOverride: 2900 }), computed)
    ).toBe(true);
  });
});

describe("wageChangeNeedsConfirmation", () => {
  it("is false when no contribution exists for the effective month yet", () => {
    expect(wageChangeNeedsConfirmation(undefined)).toBe(false);
  });

  it("is false for a still-simulated draft/expected row", () => {
    expect(wageChangeNeedsConfirmation({ source: "simulated", status: "draft" })).toBe(false);
    expect(wageChangeNeedsConfirmation({ source: "simulated", status: "expected" })).toBe(false);
  });

  it("is true for a hand-entered historical row", () => {
    expect(wageChangeNeedsConfirmation({ source: "manualHistorical", status: "confirmed" })).toBe(true);
  });

  it("is true for a confirmed or credited simulated row", () => {
    expect(wageChangeNeedsConfirmation({ source: "simulated", status: "credited" })).toBe(true);
    expect(wageChangeNeedsConfirmation({ source: "manualCurrent", status: "confirmed" })).toBe(true);
  });
});

describe("sortWageHistoryByEffectiveFrom", () => {
  it("sorts oldest first", () => {
    const sorted = sortWageHistoryByEffectiveFrom([
      entry({ id: "b", effectiveFromMonth: "2027-01" }),
      entry({ id: "a", effectiveFromMonth: "2026-09" }),
    ]);
    expect(sorted.map((row) => row.id)).toEqual(["a", "b"]);
  });
});

describe("wageHistoryWritePayload / normalizeWageHistoryEntry", () => {
  it("round-trips through the write payload and the tolerant reader", () => {
    const payload = wageHistoryWritePayload(entry({ notes: "Annual increment" }));
    const normalized = normalizeWageHistoryEntry("wh-2", {
      ...payload,
      createdAtMs: 5,
      updatedAtMs: 5,
    });
    expect(normalized.establishmentId).toBe("est-a");
    expect(normalized.effectiveFromMonth).toBe("2026-09");
    expect(normalized.wage).toBe(25000);
    expect(normalized.notes).toBe("Annual increment");
  });

  it("degrades a malformed document to safe defaults", () => {
    const normalized = normalizeWageHistoryEntry("wh-3", {});
    expect(normalized.establishmentId).toBe("");
    expect(normalized.wage).toBe(0);
    expect(normalized.epsEligible).toBe(true);
    expect(normalized.createdAtMs).toBe(0);
  });
});
