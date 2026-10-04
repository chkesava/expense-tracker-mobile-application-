import { describe, expect, it } from "vitest";

import { FEE_TYPE_IDS } from "../types/fee";
import { CATEGORY_TAXONOMY } from "./categoryTaxonomy";
import {
  FEE_TAXONOMY,
  feeSubtypeLabel,
  feeTypeDef,
  feeTypeLabel,
  isFeeTypeId,
  isValidFeeSubtype,
} from "./feeTaxonomy";

const SUBCATEGORY_KEYS = new Set(
  CATEGORY_TAXONOMY.flatMap((node) => node.subcategories.map((s) => s.key))
);

describe("fee taxonomy", () => {
  it("defines exactly one entry per fee type id, in id order", () => {
    expect(FEE_TAXONOMY.map((d) => d.id)).toEqual([...FEE_TYPE_IDS]);
  });

  it("covers every family named in the SPENDLY-312 scope", () => {
    for (const id of [
      "atm_cash", "bank_service", "min_balance", "debit_card", "credit_card",
      "late_payment", "cash_advance", "emi_conversion", "forex", "payment_upi",
      "cheque", "transfer_remittance", "investment", "loan", "other",
    ]) {
      expect(isFeeTypeId(id)).toBe(true);
    }
  });

  it("keeps subtype ids unique, snake_case and within the rules' 40-char cap", () => {
    for (const def of FEE_TAXONOMY) {
      const ids = def.subtypes.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) {
        expect(id).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(id.length).toBeLessThanOrEqual(40);
      }
    }
  });

  it("links only to subcategory keys that exist in the category taxonomy", () => {
    for (const def of FEE_TAXONOMY) {
      expect(def.categoryKeys.length).toBeGreaterThan(0);
      for (const key of def.categoryKeys) expect(SUBCATEGORY_KEYS.has(key)).toBe(true);
    }
  });

  it("never links a fee type to principal-spend categories", () => {
    const principal = ["credit_card_payment", "school_fees", "college_fees", "interest", "gst_other_tax"];
    for (const def of FEE_TAXONOMY) {
      for (const key of principal) expect(def.categoryKeys).not.toContain(key);
    }
  });

  it("validates subtypes against their own type only", () => {
    expect(isValidFeeSubtype("credit_card", "annual_fee")).toBe(true);
    expect(isValidFeeSubtype("credit_card", "bounce")).toBe(false);
    expect(isValidFeeSubtype("cheque", "bounce")).toBe(true);
    expect(isValidFeeSubtype("other", undefined)).toBe(true);
    expect(isValidFeeSubtype("other", "")).toBe(true);
  });

  it("resolves labels and rejects unknown ids", () => {
    expect(feeTypeLabel("atm_cash")).toBe("ATM / cash withdrawal");
    expect(feeSubtypeLabel("loan", "foreclosure")).toBe("Foreclosure");
    expect(feeSubtypeLabel("loan", "nope")).toBeUndefined();
    expect(isFeeTypeId("gst")).toBe(false);
    expect(() => feeTypeDef("gst" as never)).toThrow();
  });
});
