import { describe, expect, it } from "vitest";
import { sipPlanFormSchema } from "./index";

describe("sipPlanFormSchema", () => {
  const valid = {
    assetType: "stock" as const,
    symbol: "RELIANCE",
    quoteKey: "RELIANCE.NS",
    assetName: "Reliance Industries",
    investmentAmount: 5000,
    currency: "INR",
    frequency: "monthly" as const,
    executionDay: 10,
    startDate: "2026-01-01",
    endDate: "",
  };

  it("accepts a valid monthly SIP", () => {
    const parsed = sipPlanFormSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("rejects non-positive amount", () => {
    const parsed = sipPlanFormSchema.safeParse({ ...valid, investmentAmount: 0 });
    expect(parsed.success).toBe(false);
  });

  it("rejects invalid weekly weekday", () => {
    const parsed = sipPlanFormSchema.safeParse({
      ...valid,
      frequency: "weekly",
      executionDay: 9,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects endDate before startDate", () => {
    const parsed = sipPlanFormSchema.safeParse({
      ...valid,
      endDate: "2025-12-01",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts last day of month (31)", () => {
    const parsed = sipPlanFormSchema.safeParse({
      ...valid,
      executionDay: 31,
    });
    expect(parsed.success).toBe(true);
  });
});
