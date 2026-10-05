import { describe, expect, it } from "vitest";

import { buildCashflowAdjustments, buildOneTimePurchase, validateCashflowChange, type WhatIfCashflowChange } from "./whatIfCashflow";

const provenance = { kind: "user" as const, source: "what-if-form", asOfDate: "2026-10-04" };
const monthly = { kind: "monthly" as const, firstDate: "2026-11-01", dayOfMonth: 1 };
const change = (overrides: Partial<WhatIfCashflowChange> = {}): WhatIfCashflowChange => ({
  id: "salary",
  label: "Salary",
  kind: "income",
  action: "add",
  amount: 5000,
  schedule: monthly,
  provenance,
  ...overrides,
});

describe("What-If income and expense scenarios", () => {
  it("models an income increase as a recurring inflow", () => {
    const [adjustment] = buildCashflowAdjustments(change());
    expect(adjustment).toMatchObject({ kind: "income", operation: "add", direction: "in", amount: 5000, schedule: monthly });
    expect(validateCashflowChange(change())).toEqual([]);
  });

  it("models an income decrease and expense decrease with the correct cash direction", () => {
    expect(buildCashflowAdjustments(change({ action: "decrease" }))[0]).toMatchObject({ direction: "out", amount: 5000 });
    expect(buildCashflowAdjustments(change({ id: "rent", kind: "expense", action: "decrease" }))[0]).toMatchObject({ direction: "in", amount: 5000 });
  });

  it("builds a one-time purchase that affects one date", () => {
    expect(buildOneTimePurchase({ id: "phone", label: "Phone", amount: 60000, date: "2026-12-15", provenance })).toMatchObject({
      kind: "expense", operation: "add", direction: "out", amount: 60000, schedule: { kind: "once", date: "2026-12-15" },
    });
  });

  it("removes and replaces only a referenced canonical source", () => {
    const sourceRef = { source: "subscription", refId: "sub-1" };
    expect(buildCashflowAdjustments(change({ id: "sub-1", kind: "expense", action: "remove", amount: 0, sourceRef }))[0]).toMatchObject({ operation: "remove", sourceRef });
    expect(buildCashflowAdjustments(change({ id: "sub-1", kind: "expense", action: "replace", amount: 800, sourceRef }))[0]).toMatchObject({ operation: "replace", amount: 800, sourceRef });
  });

  it("models delayed income as remove plus a new scheduled inflow", () => {
    const adjustments = buildCashflowAdjustments(change({ action: "delay", sourceRef: { source: "income", refId: "income-1" }, originalSchedule: monthly, schedule: { kind: "once", date: "2026-12-01" } }));
    expect(adjustments).toHaveLength(2);
    expect(adjustments[0]).toMatchObject({ operation: "remove", sourceRef: { source: "income", refId: "income-1" } });
    expect(adjustments[1]).toMatchObject({ operation: "add", direction: "in", schedule: { kind: "once", date: "2026-12-01" } });
    expect(adjustments[1]?.sourceRef).toBeUndefined();
  });

  it("rejects negative, zero and missing-reference actions", () => {
    expect(validateCashflowChange(change({ amount: -1 }))).toContain("amount must be zero or more");
    expect(validateCashflowChange(change({ amount: 0 }))).toContain("amount must be greater than zero for this action");
    expect(validateCashflowChange(change({ action: "remove", amount: 0 }))).toContain("remove requires sourceRef");
    expect(validateCashflowChange(change({ action: "delay", amount: 100, schedule: monthly }))).toContain("delay requires sourceRef");
  });
});
