import { describe, expect, it } from "vitest";

import type { Expense, Income } from "../types/expense";
import { MERCHANT_CONFIDENCES, MERCHANT_METHODS, MERCHANT_RAILS } from "../types/merchant";
import {
  customMerchantId,
  expenseSourceText,
  foldKey,
  incomeSourceText,
  isCustomMerchantId,
  merchantOverrideId,
  merchantSlug,
  transactionRefKey,
  validateMerchantOverride,
} from "./merchantModel";

describe("merchant model", () => {
  it("documents rails, confidences and methods", () => {
    expect(MERCHANT_RAILS).toContain("upi_qr");
    expect(MERCHANT_CONFIDENCES).toEqual(["high", "medium", "low", "unknown"]);
    expect(MERCHANT_METHODS[0]).toBe("user_override");
  });

  it("builds stable keys and ids", () => {
    expect(foldKey("Adyar Ananda-Bhavan!")).toBe("adyaranandabhavan");
    expect(merchantSlug("  Adyar Ananda Bhavan ")).toBe("adyar-ananda-bhavan");
    expect(customMerchantId("Raju's Tea Stall")).toBe("custom:raju-s-tea-stall");
    expect(isCustomMerchantId("custom:x")).toBe(true);
    expect(transactionRefKey("expense", "e1")).toBe("expense:e1");
    expect(merchantOverrideId("alias", "upi/dr/swiggy")).toBe("alias__upi_dr_swiggy");
  });

  it("validates corrections", () => {
    const base = { kind: "transaction" as const, refKey: "expense:e1" };
    expect(validateMerchantOverride({ ...base, merchantId: "swiggy" })).toEqual([]);
    expect(validateMerchantOverride({ ...base, rejected: true })).toEqual([]);
    expect(validateMerchantOverride({ ...base })).toEqual(["Choose one merchant or type a name."]);
    expect(validateMerchantOverride({ ...base, merchantId: "swiggy", customName: "x" })).toEqual(["Choose one merchant or type a name."]);
    expect(validateMerchantOverride({ ...base, rejected: true, merchantId: "swiggy" })).toEqual(["A rejected match can't also name a merchant."]);
    expect(validateMerchantOverride({ ...base, customName: "x".repeat(61) })).toHaveLength(1);
    expect(validateMerchantOverride({ ...base, merchantId: "a", subcategory: "Restaurants & Dining" })).toEqual(["A subcategory needs a category."]);
  });

  it("reads transactions without changing them", () => {
    const e = { id: "e1", amount: 450, note: "UPI/DR/318291/ANANDA BHA/paytmqr6w@/FOOD", category: "Food & Groceries", date: "2026-10-01", month: "2026-10", createdAt: 1 } as Expense & { id: string };
    const before = JSON.stringify(e);
    expect(expenseSourceText(e)).toEqual({ refKey: "expense:e1", text: e.note, kind: "expense", category: "Food & Groceries" });
    expect(JSON.stringify(e)).toBe(before);
    const i = { id: "i1", amount: 10, note: "", source: "Salary", date: "2026-10-01", month: "2026-10", createdAt: 1 } as Income & { id: string };
    expect(incomeSourceText(i)).toEqual({ refKey: "income:i1", text: "", kind: "income" });
  });
});
