import { describe, expect, it } from "vitest";

import type { Expense, Income } from "../types/expense";
import { buildRunwayModel } from "./runwayModel";
import { DEFAULT_RUNWAY_SETTINGS, normalizeRunwaySettings, runwaySettingsDoc, thresholdFromSettings } from "./runwaySettings";
import type { RunwaySources } from "./runwaySources";
import { formatRunwayMonths, methodologyLines, monthLabel, runwayHeadline, timelineRows } from "./runwayView";

const exp = (date: string, amount: number, over: Partial<Expense> = {}): Expense => ({
  id: `${date}-${amount}`,
  amount,
  category: "Food & Groceries",
  subcategory: "Groceries / Kirana",
  note: "",
  date,
  month: date.slice(0, 7),
  createdAt: 1,
  ...over,
});
const inc = (date: string, amount: number): Income => ({ id: `i${date}`, amount, source: "Salary", note: "", date, month: date.slice(0, 7), createdAt: 1 });

const sources = (liquid: number): RunwaySources => {
  const r = {
    kind: "bank" as const,
    refId: "a",
    label: "HDFC",
    amount: liquid,
    liquidity: "liquid" as const,
    included: true,
    overridable: true,
    reasons: ["liquid_by_default" as const],
    provenance: { source: "accounts", asOf: "2026-10-15", certainty: "actual" as const },
  };
  return { resources: [r], counted: [r], notCounted: [], obligations: [], liquidTotal: liquid };
};

const model = (over: Partial<typeof DEFAULT_RUNWAY_SETTINGS> = {}, liquid = 120000) =>
  buildRunwayModel({
    sources: sources(liquid),
    expenses: [exp("2026-07-05", 30000), exp("2026-08-05", 30000), exp("2026-09-05", 30000)],
    incomes: [inc("2026-07-01", 10000), inc("2026-08-01", 10000), inc("2026-09-01", 10000)],
    subscriptions: [],
    bills: [],
    calendarEvents: [],
    today: "2026-10-15",
    displayCurrency: "INR",
    settings: { ...DEFAULT_RUNWAY_SETTINGS, windowMonths: 3, ...over },
  });

describe("settings", () => {
  it("normalises anything stored into valid settings", () => {
    expect(normalizeRunwaySettings(undefined)).toEqual(DEFAULT_RUNWAY_SETTINGS);
    expect(normalizeRunwaySettings({ mode: "bogus", windowMonths: 5, thresholdAmount: -3, projectionMonths: 2.5, method: "median" })).toEqual({
      ...DEFAULT_RUNWAY_SETTINGS,
      method: "median",
    });
  });

  it("maps to the engine threshold", () => {
    expect(thresholdFromSettings({ ...DEFAULT_RUNWAY_SETTINGS, thresholdKind: "amount", thresholdAmount: 10000 })).toEqual({ kind: "amount", amount: 10000 });
    expect(thresholdFromSettings({ ...DEFAULT_RUNWAY_SETTINGS, thresholdKind: "essential_months", thresholdMonths: 2 })).toEqual({ kind: "essential_months", months: 2 });
    expect(thresholdFromSettings(DEFAULT_RUNWAY_SETTINGS)).toEqual({ kind: "none" });
  });

  it("writes exactly the settings fields plus a timestamp", () => {
    expect(Object.keys(runwaySettingsDoc(DEFAULT_RUNWAY_SETTINGS, 5)).sort()).toEqual(
      ["includeUnusual", "method", "mode", "projectionMonths", "thresholdAmount", "thresholdKind", "thresholdMonths", "updatedAtMs", "windowMonths"].sort()
    );
  });
});

describe("model pipeline", () => {
  it("runs sources → baseline → engine for each mode", () => {
    expect(model({ mode: "net_burn" }).output.result).toMatchObject({ state: "finite", months: 6 });
    expect(model({ mode: "gross_burn" }).output.result).toMatchObject({ state: "finite", months: 4 });
    expect(model().output.result.state).toBe("finite");
  });

  it("grades confidence from history", () => {
    expect(model().confidence).toBe("medium");
    expect(model().assumptions).toEqual([]);
  });
});

describe("headline", () => {
  it("labels every state in words", () => {
    expect(runwayHeadline(model({ mode: "net_burn" }).output, 12, "")).toMatchObject({ title: "About 6 months", badge: "Estimate" });
    expect(runwayHeadline(model({ thresholdKind: "amount", thresholdAmount: 500000 }).output, 12, "₹5,00,000")).toMatchObject({
      title: "Below your reserve now",
      badge: "Below reserve",
    });
    const empty = buildRunwayModel({ sources: sources(1000), expenses: [], incomes: [], subscriptions: [], bills: [], calendarEvents: [], today: "2026-10-15", displayCurrency: "INR", settings: DEFAULT_RUNWAY_SETTINGS });
    expect(runwayHeadline(empty.output, 12, "")).toMatchObject({ title: "Not enough data yet", badge: "Not enough data" });
  });

  it("formats months in plain words", () => {
    expect(formatRunwayMonths(0.4)).toBe("Under a month");
    expect(formatRunwayMonths(1)).toBe("About 1 month");
    expect(formatRunwayMonths(5.3)).toBe("About 5½ months");
    expect(formatRunwayMonths(5.8)).toBe("About 6 months");
  });
});

describe("timeline", () => {
  it("keeps actual and projected months apart and labels them for screen readers", () => {
    const m = model();
    const rows = timelineRows(m.baseline, m.output, (n) => `₹${n}`);
    expect(rows.filter((r) => r.kind === "actual").map((r) => r.month)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(rows[0]).toMatchObject({ net: -20000, closing: null, accessibilityLabel: "Jul 26, actual: deficit of ₹20000" });
    const projected = rows.filter((r) => r.kind === "projected");
    expect(projected[0].month).toBe("2026-10");
    expect(projected.some((r) => r.belowFloor)).toBe(true);
    expect(projected.find((r) => r.belowFloor)!.accessibilityLabel).toContain("below your reserve");
  });

  it("labels months", () => {
    expect(monthLabel("2027-02")).toBe("Feb 27");
  });
});

describe("methodology", () => {
  it("explains the mode, the window and that it's an estimate", () => {
    const m = model();
    const lines = methodologyLines("commitment_projection", m.baseline, ["short_history"]);
    expect(lines[0]).toMatch(/^Mode: Commitment-aware projection/);
    expect(lines[1]).toContain("average of 3 complete months between Jul 26 and Sep 26");
    expect(lines.some((l) => l.includes("counted twice"))).toBe(true);
    expect(lines.at(-1)).toContain("planning estimate");
  });
});
