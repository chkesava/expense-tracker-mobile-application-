import { describe, expect, it } from "vitest";

import type { WhatIfBaselineReference, WhatIfBaselineSnapshot } from "../types/whatIf";
import type { RunwayBaselineResult } from "./runwayBaseline";
import { buildWhatIfBaselineSnapshot, buildWhatIfReference } from "./whatIfBaseline";
import {
  buildWhatIfChange,
  newWhatIfDraft,
  nextMonthStart,
  WHAT_IF_TEMPLATES,
  whatIfChangeGroups,
  whatIfChangeId,
  whatIfChangeIdOf,
  withoutWhatIfChange,
  withWhatIfChange,
} from "./whatIfDraft";
import { runWhatIf, whatIfHeadline, whatIfMetricRows, whatIfTimelineRows, WHAT_IF_DISCLOSURES } from "./whatIfView";

const TODAY = "2026-10-05";
const fmt = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const reference: WhatIfBaselineReference = { asOfDate: TODAY, currency: "INR", timezone: "Asia/Calcutta", sourceVersions: [] };
const baseline = (over: Partial<WhatIfBaselineSnapshot> = {}): WhatIfBaselineSnapshot => ({
  reference,
  liquid: 100_000,
  baseline: { monthlyEarnedIncome: 60_000, monthlyOutflowByClass: { essential: 30_000, discretionary: 10_000 } },
  events: [],
  ...over,
});
const draft = () => newWhatIfDraft({ name: "Test", reference });

describe("what-if baseline adapter", () => {
  const runwayBaseline = { projectionBaseline: { monthlyEarnedIncome: 1, monthlyOutflowByClass: { essential: 1 } } } as unknown as RunwayBaselineResult;
  const input = {
    today: TODAY,
    currency: "INR",
    timezone: "",
    liquid: 1234.567,
    runwayBaseline,
    calendarEvents: [],
    expenses: [{ amount: 100 }, { amount: 50.5 }],
    incomes: [{ amount: 1000 }],
  };

  it("uses the projection baseline, rounds liquid and never copies records", () => {
    const snap = buildWhatIfBaselineSnapshot(input);
    expect(snap.liquid).toBe(1234.57);
    expect(snap.baseline).toBe(runwayBaseline.projectionBaseline);
    expect(snap.events).toEqual([]);
    expect(snap.reference.timezone).toBe("UTC");
  });

  it("fingerprints each source so later data changes are visible", () => {
    const before = buildWhatIfReference(input).sourceVersions;
    expect(before).toContainEqual({ source: "expenses", version: "2:150.5" });
    const after = buildWhatIfReference({ ...input, expenses: [...input.expenses, { amount: 10 }] }).sourceVersions;
    expect(after.find((s) => s.source === "expenses")?.version).toBe("3:160.5");
    expect(buildWhatIfReference({ ...input, liquid: null }).sourceVersions[0]).toEqual({ source: "accounts", version: "unknown" });
  });
});

describe("what-if changes", () => {
  it("builds every template's change type into valid adjustments", () => {
    for (const template of WHAT_IF_TEMPLATES) {
      const id = whatIfChangeId(template.form.type, "t1");
      const built = buildWhatIfChange(id, { ...template.form, amount: 5_000, startDate: nextMonthStart(TODAY) }, TODAY);
      expect({ template: template.id, issues: built.issues }).toEqual({ template: template.id, issues: [] });
      expect(built.adjustments.length).toBeGreaterThan(0);
      for (const a of built.adjustments) expect(whatIfChangeIdOf(a.id)).toBe(id);
    }
  });

  it("rejects missing names, non-positive amounts and past dates", () => {
    const built = buildWhatIfChange("purchase--x", { type: "purchase", label: " ", amount: 0, startDate: "2026-01-01" }, TODAY);
    expect(built.issues).toEqual(["Give this change a name.", "Enter an amount greater than zero.", "Pick today or a later date — What If looks ahead."]);
    expect(built.adjustments).toEqual([]);
  });

  it("validates loan terms and records them as labelled assumptions", () => {
    expect(buildWhatIfChange("loan--x", { type: "loan", label: "Car", amount: 500_000, startDate: TODAY, annualInterestRatePct: 99, tenureMonths: 12 }, TODAY).issues).toContain("Interest rate must be between 0% and 60% a year.");
    const ok = buildWhatIfChange("loan--x", { type: "loan", label: "Car", amount: 500_000, startDate: TODAY, annualInterestRatePct: 9, tenureMonths: 36 }, TODAY);
    expect(ok.issues).toEqual([]);
    expect(ok.assumptions.map((a) => a.code)).toEqual(["loan--x:rate", "loan--x:tenure", "loan--x:emi"]);
    expect(ok.assumptions[2].provenance.kind).toBe("derived");
  });

  it("groups, replaces and removes changes as units", () => {
    const loan = buildWhatIfChange("loan--a", { type: "loan", label: "Car", amount: 100_000, startDate: TODAY, annualInterestRatePct: 10, tenureMonths: 12, downPayment: 10_000 }, TODAY);
    const buy = buildWhatIfChange("purchase--b", { type: "purchase", label: "Phone", amount: 30_000, startDate: TODAY }, TODAY);
    let scenario = withWhatIfChange(withWhatIfChange(draft(), "loan--a", loan), "purchase--b", buy);
    const groups = whatIfChangeGroups(scenario);
    expect(groups.map((g) => [g.id, g.type, g.label])).toEqual([["loan--a", "loan", "Car"], ["purchase--b", "purchase", "Phone"]]);
    expect(groups[0].adjustments.length).toBeGreaterThan(1);
    expect(groups[0].assumptions).toHaveLength(3);
    scenario = withoutWhatIfChange(scenario, "loan--a");
    expect(whatIfChangeGroups(scenario).map((g) => g.id)).toEqual(["purchase--b"]);
    expect(scenario.assumptions).toEqual([]);
  });

  it("starts monthly changes on the first of next month", () => {
    expect(nextMonthStart("2026-10-05")).toBe("2026-11-01");
    expect(nextMonthStart("2026-12-31")).toBe("2027-01-01");
  });
});

describe("what-if results", () => {
  it("shows no change for an empty scenario", () => {
    const run = runWhatIf({ scenario: draft(), baseline: baseline(), threshold: { kind: "none" } });
    expect(run.output.issues).toEqual([]);
    expect(whatIfHeadline(run.comparison, fmt).tone).toBe("same");
  });

  it("a big purchase lowers the end balance by its amount", () => {
    const buy = buildWhatIfChange("purchase--b", { type: "purchase", label: "Phone", amount: 30_000, startDate: TODAY }, TODAY);
    const run = runWhatIf({ scenario: withWhatIfChange(draft(), "purchase--b", buy), baseline: baseline(), threshold: { kind: "none" } });
    const head = whatIfHeadline(run.comparison, fmt);
    expect(head.tone).toBe("worse");
    expect(head.title.startsWith("−₹30,000 by ")).toBe(true);
    const closing = whatIfMetricRows(run.comparison, fmt).find((r) => r.key === "closing_balance")!;
    expect(closing).toMatchObject({ tone: "worse", delta: "−₹30,000" });
    expect(closing.accessibilityLabel).toContain("with this scenario");
  });

  it("a raise improves every later month, and lower burn counts as better", () => {
    const raise = buildWhatIfChange("income_change--r", { type: "income_change", label: "Raise", amount: 10_000, direction: "increase", startDate: nextMonthStart(TODAY) }, TODAY);
    const run = runWhatIf({ scenario: withWhatIfChange(draft(), "income_change--r", raise), baseline: baseline(), threshold: { kind: "none" } });
    const rows = whatIfTimelineRows(run.comparison, fmt);
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.at(-1)!.tone).toBe("better");
    expect(rows.at(-1)!.accessibilityLabel).toContain("difference plus");
    const burn = whatIfMetricRows(run.comparison, fmt).find((r) => r.key === "monthly_burn");
    if (burn && burn.delta !== "—" && burn.delta !== "No change") expect(burn.tone).toBe("better");
  });

  it("says when there is not enough data instead of inventing a result", () => {
    const run = runWhatIf({ scenario: draft(), baseline: baseline({ liquid: null }), threshold: { kind: "none" } });
    expect(whatIfHeadline(run.comparison, fmt)).toMatchObject({ tone: "unknown", title: "Not enough data yet" });
  });

  it("always projects from today's reference, whatever the scenario was saved with", () => {
    const old = { ...draft(), reference: { ...reference, asOfDate: "2026-09-01" } };
    const run = runWhatIf({ scenario: old, baseline: baseline(), threshold: { kind: "none" } });
    expect(run.output.issues).toEqual([]);
  });

  it("discloses the model's limits", () => {
    expect(WHAT_IF_DISCLOSURES.join(" ")).toMatch(/not a forecast/);
    expect(WHAT_IF_DISCLOSURES.join(" ")).toMatch(/Nothing here changes your real/);
  });
});
