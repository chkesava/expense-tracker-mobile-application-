import { describe, expect, it } from "vitest";

import { effectiveBalanceAsOfDate, isAccidentalBalanceBaseline } from "./accountBaseline";

describe("effectiveBalanceAsOfDate", () => {
  it("keeps a past snapshot date even when older ledger rows exist", () => {
    expect(
      effectiveBalanceAsOfDate("2026-08-01", ["2026-07-31", "2026-08-02"], "2026-08-21")
    ).toBe("2026-08-01");
  });

  it("ignores a today baseline that would hide yesterday's transactions", () => {
    expect(
      effectiveBalanceAsOfDate("2026-08-21", ["2026-08-20", "2026-08-21"], "2026-08-21")
    ).toBeUndefined();
  });

  it("ignores today's baseline even when no older rows are in memory yet", () => {
    expect(effectiveBalanceAsOfDate("2026-08-21", [], "2026-08-21")).toBeUndefined();
    expect(effectiveBalanceAsOfDate("2026-08-21", ["2026-08-21"], "2026-08-21")).toBeUndefined();
  });

  it("treats a blank baseline as unset", () => {
    expect(effectiveBalanceAsOfDate("", ["2026-08-01"], "2026-08-21")).toBeUndefined();
    expect(effectiveBalanceAsOfDate(null, ["2026-08-01"], "2026-08-21")).toBeUndefined();
  });

  it("flags today or future dates as accidental baselines", () => {
    expect(isAccidentalBalanceBaseline("2026-08-21", "2026-08-21")).toBe(true);
    expect(isAccidentalBalanceBaseline("2026-08-22", "2026-08-21")).toBe(true);
    expect(isAccidentalBalanceBaseline("2026-08-01", "2026-08-21")).toBe(false);
  });
});
