import { describe, expect, it } from "vitest";

import { GROUP_FUND_LIMITS } from "../types/groupFund";
import {
  cleanGroupFundText,
  isGroupFundEventKind,
  isSafeKey,
  parseGroupFundAmount,
  validateFundName,
  validateGroupFundAmount,
  validateMembers,
  validatePeriod,
  validatePurposes,
} from "./groupFundModel";

const purpose = (id: string, name: string, extra = {}) => ({ id, name, cadence: "monthly" as const, ...extra });

describe("groupFundModel", () => {
  it("parses typed amounts", () => {
    expect(parseGroupFundAmount("6,000")).toBe(6000);
    expect(parseGroupFundAmount("₹ 100.50")).toBe(100.5);
    expect(parseGroupFundAmount("abc")).toBeNaN();
  });

  it("validates amounts", () => {
    expect(validateGroupFundAmount(6000)).toEqual([]);
    expect(validateGroupFundAmount(0)).toEqual(["amount_not_positive"]);
    expect(validateGroupFundAmount(-1)).toEqual(["amount_not_positive"]);
    expect(validateGroupFundAmount(1.234)).toEqual(["amount_too_precise"]);
    expect(validateGroupFundAmount(Number.NaN)).toEqual(["amount_invalid"]);
    expect(validateGroupFundAmount(GROUP_FUND_LIMITS.maxAmount + 1)).toEqual(["amount_too_large"]);
  });

  it("cleans and validates names", () => {
    expect(cleanGroupFundText("  Dokra   pool ")).toBe("Dokra pool");
    expect(validateFundName("   ")).toEqual(["name_required"]);
    expect(validateFundName("x".repeat(GROUP_FUND_LIMITS.nameMax + 1))).toEqual(["name_too_long"]);
    expect(validateFundName("Dokra")).toEqual([]);
  });

  it("only accepts ids that are safe as field-path keys", () => {
    expect(isSafeKey("abc_DEF-123")).toBe(true);
    expect(isSafeKey("a.b")).toBe(false);
    expect(isSafeKey("a/b")).toBe(false);
    expect(isSafeKey("")).toBe(false);
    expect(isSafeKey(undefined)).toBe(false);
  });

  it("validates periods", () => {
    expect(validatePeriod(undefined)).toEqual([]);
    expect(validatePeriod("2026-11")).toEqual([]);
    expect(validatePeriod("2026-13")).toEqual(["period_invalid"]);
  });

  it("requires at least one active, uniquely named purpose", () => {
    expect(validatePurposes([])).toEqual(["purposes_required"]);
    expect(validatePurposes([purpose("p1", "Appu", { archived: true })])).toEqual(["purposes_required"]);
    expect(validatePurposes([purpose("p1", "Appu"), purpose("p2", " appu ")])).toEqual(["purpose_duplicate"]);
    expect(validatePurposes([purpose("p1", "Appu"), purpose("p1", "Podupu")])).toEqual(["purpose_duplicate"]);
    expect(validatePurposes([purpose("p.1", "Appu")])).toEqual(["purpose_invalid"]);
    expect(validatePurposes([purpose("p1", "Appu", { expectedPerMember: 0 })])).toEqual(["purpose_invalid"]);
    expect(validatePurposes([{ id: "p1", name: "Appu", cadence: "weekly" as never }])).toEqual(["purpose_invalid"]);
    expect(validatePurposes([purpose("p1", "Appu", { expectedPerMember: 6000 }), purpose("p2", "Podupu")])).toEqual([]);
  });

  it("validates members", () => {
    expect(validateMembers([])).toEqual([]);
    expect(validateMembers([{ id: "m1", name: "Ravi" }, { id: "m2", name: "RAVI" }])).toEqual(["member_duplicate"]);
    expect(validateMembers([{ id: "m1", name: "" }])).toEqual(["member_invalid"]);
    const many = Array.from({ length: GROUP_FUND_LIMITS.maxMembers + 1 }, (_, i) => ({ id: `m${i}`, name: `M ${i}` }));
    expect(validateMembers(many)).toEqual(["too_many_members"]);
  });

  it("guards event kinds", () => {
    expect(isGroupFundEventKind("contribution")).toBe(true);
    expect(isGroupFundEventKind("expense")).toBe(false);
  });
});
