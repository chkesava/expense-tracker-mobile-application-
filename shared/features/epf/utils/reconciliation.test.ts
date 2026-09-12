import { describe, expect, it } from "vitest";

import type { EpfReconciliation } from "@/shared/features/epf/types";
import {
  buildReconciliation,
  calculateVariance,
  latestReconciliation,
  normalizeReconciliation,
  reconciliationHasErrors,
  reconciliationHistory,
  totalAdjustments,
  validateReconciliation,
} from "@/shared/features/epf/utils/reconciliation";

function reconciliation(overrides: Partial<EpfReconciliation> = {}): EpfReconciliation {
  return {
    id: "r1",
    establishmentId: "est-a",
    date: "2026-09-12",
    actualBalance: 512000,
    calculatedBalance: 498500,
    adjustmentAmount: 13500,
    ...overrides,
  };
}

describe("calculateVariance", () => {
  it("is positive when EPFO holds more than Spendly computed", () => {
    expect(calculateVariance(512000, 498500)).toBe(13500);
  });

  it("is negative when Spendly is ahead", () => {
    expect(calculateVariance(490000, 498500)).toBe(-8500);
  });

  it("is zero when they agree", () => {
    expect(calculateVariance(498500, 498500)).toBe(0);
  });

  it("rounds to paise rather than carrying float noise", () => {
    expect(calculateVariance(0.1 + 0.2, 0)).toBe(0.3);
  });
});

describe("validateReconciliation", () => {
  const ctx = { knownEstablishmentIds: ["est-a"], todayKey: "2026-09-12" };
  const base = {
    establishmentId: "est-a",
    date: "2026-09-12",
    actualBalance: 512000,
    calculatedBalance: 498500,
  };

  it("accepts a well-formed observation", () => {
    expect(validateReconciliation(base, ctx)).toEqual([]);
  });

  it("accepts a zero balance — an empty account is a real observation", () => {
    expect(validateReconciliation({ ...base, actualBalance: 0 }, ctx)).toEqual([]);
  });

  it("rejects a negative balance", () => {
    const issues = validateReconciliation({ ...base, actualBalance: -1 }, ctx);
    expect(issues.some((issue) => issue.code === "negative_balance")).toBe(true);
  });

  it("rejects an establishment that is not the user's", () => {
    const issues = validateReconciliation({ ...base, establishmentId: "someone-else" }, ctx);
    expect(issues.some((issue) => issue.code === "missing_establishment")).toBe(true);
  });

  it("rejects a future date but allows today", () => {
    expect(
      validateReconciliation({ ...base, date: "2026-09-13" }, ctx).some(
        (issue) => issue.code === "future_date"
      )
    ).toBe(true);
    expect(validateReconciliation({ ...base, date: "2026-09-12" }, ctx)).toEqual([]);
  });

  it("rejects a malformed date", () => {
    const issues = validateReconciliation({ ...base, date: "12-09-2026" }, ctx);
    expect(issues.some((issue) => issue.code === "invalid_date")).toBe(true);
  });

  it("reports every problem at once", () => {
    const issues = validateReconciliation(
      { establishmentId: "", date: "nope", actualBalance: -5, calculatedBalance: 0 },
      ctx
    );
    expect(issues.length).toBeGreaterThanOrEqual(3);
    expect(reconciliationHasErrors(issues)).toBe(true);
  });
});

describe("buildReconciliation", () => {
  it("keeps both figures alongside the adjustment, so the correction stays explainable", () => {
    const row = buildReconciliation({
      establishmentId: "est-a",
      date: "2026-09-12",
      actualBalance: 512000,
      calculatedBalance: 498500,
      reference: "EPFO passbook",
    });

    expect(row.actualBalance).toBe(512000);
    expect(row.calculatedBalance).toBe(498500);
    expect(row.adjustmentAmount).toBe(13500);
    expect(row.reference).toBe("EPFO passbook");
  });

  it("produces a negative adjustment when Spendly was ahead", () => {
    const row = buildReconciliation({
      establishmentId: "est-a",
      date: "2026-09-12",
      actualBalance: 490000,
      calculatedBalance: 498500,
    });
    expect(row.adjustmentAmount).toBe(-8500);
  });

  it("drops empty optional fields rather than storing blanks", () => {
    const row = buildReconciliation({
      establishmentId: "est-a",
      date: "2026-09-12",
      actualBalance: 1,
      calculatedBalance: 1,
      reference: "",
      notes: "",
    });
    expect(row.reference).toBeUndefined();
    expect(row.notes).toBeUndefined();
  });
});

describe("reconciliationHistory", () => {
  it("preserves repeated observations, newest first", () => {
    const rows = [
      reconciliation({ id: "old", date: "2026-03-01" }),
      reconciliation({ id: "new", date: "2026-09-12" }),
      reconciliation({ id: "mid", date: "2026-06-01" }),
    ];
    expect(reconciliationHistory(rows, "est-a").map((row) => row.id)).toEqual([
      "new",
      "mid",
      "old",
    ]);
  });

  it("ignores another establishment's observations", () => {
    const rows = [reconciliation({ establishmentId: "est-b" })];
    expect(reconciliationHistory(rows, "est-a")).toEqual([]);
  });

  it("returns the most recent observation", () => {
    const rows = [
      reconciliation({ id: "old", date: "2026-03-01" }),
      reconciliation({ id: "new", date: "2026-09-12" }),
    ];
    expect(latestReconciliation(rows, "est-a")?.id).toBe("new");
    expect(latestReconciliation(rows, "est-z")).toBeNull();
  });
});

describe("totalAdjustments", () => {
  it("sums every adjustment for one establishment", () => {
    const rows = [
      reconciliation({ id: "a", adjustmentAmount: 1000 }),
      reconciliation({ id: "b", adjustmentAmount: -250 }),
      reconciliation({ id: "c", establishmentId: "est-b", adjustmentAmount: 9999 }),
    ];
    expect(totalAdjustments(rows, "est-a")).toBe(750);
  });

  it("is zero when nothing has been reconciled", () => {
    expect(totalAdjustments([], "est-a")).toBe(0);
  });
});

describe("normalizeReconciliation", () => {
  it("survives an empty or drifted document", () => {
    const row = normalizeReconciliation("r", {});
    expect(row.actualBalance).toBe(0);
    expect(row.adjustmentAmount).toBe(0);
    expect(row.establishmentId).toBe("");
  });

  it("treats a non-numeric amount as zero rather than NaN", () => {
    expect(normalizeReconciliation("r", { adjustmentAmount: "500" }).adjustmentAmount).toBe(0);
  });
});
