import { describe, expect, it } from "vitest";

import type { MerchantOverride, MerchantSourceText } from "../types/merchant";
import { resolveMerchant, resolveMerchants } from "./merchantResolve";

const source = (text: string, extra: Partial<MerchantSourceText> = {}): MerchantSourceText => ({
  refKey: "expense:e1",
  text,
  kind: "expense",
  ...extra,
});

const override = (value: Partial<MerchantOverride> & Pick<MerchantOverride, "kind" | "refKey">): MerchantOverride => ({
  id: `${value.kind}-${value.refKey}`,
  createdAtMs: 1,
  updatedAtMs: 1,
  ...value,
});

describe("merchant resolution", () => {
  it("resolves an exact registry alias with high confidence", () => {
    expect(resolveMerchant(source("UPI/DR/318291/SWIGGY/SBIN"))).toMatchObject({
      merchantId: "swiggy",
      displayName: "Swiggy",
      confidence: "high",
      method: "alias_exact",
      matchedBy: "swiggy",
      rail: "upi",
      normalized: "swiggy",
    });
  });

  it("uses the transaction override before every other layer", () => {
    const result = resolveMerchant(
      source("Swiggy", { refKey: "expense:e1" }),
      [override({ kind: "transaction", refKey: "expense:e1", customName: "Raju's Stall" })],
    );
    expect(result).toMatchObject({
      merchantId: "custom:raju-s-stall",
      displayName: "Raju's Stall",
      confidence: "high",
      method: "user_override",
      matchedBy: "expense:e1",
    });
  });

  it("uses an alias override before the registry", () => {
    const result = resolveMerchant(
      source("Swiggy"),
      [override({ kind: "alias", refKey: "swiggy", merchantId: "zomato" })],
    );
    expect(result).toMatchObject({ merchantId: "zomato", method: "user_alias", confidence: "high" });
  });

  it("applies deterministic VPA and descriptor rules at medium confidence", () => {
    expect(resolveMerchant(source("UPI/DR/123/SWIGGY@ICICI/Payment"))).toMatchObject({
      merchantId: "swiggy",
      method: "rule",
      confidence: "medium",
      matchedBy: "vpa-local:swiggy",
    });
    expect(resolveMerchant(source("XYZ *SWIGGY"))).toMatchObject({
      merchantId: "swiggy",
      method: "rule",
      confidence: "medium",
      matchedBy: "descriptor-detail:swiggy",
    });
  });

  it("uses the longest safe prefix and does not collapse look-alikes", () => {
    expect(resolveMerchant(source("SWIGGY FOOD"))).toMatchObject({ merchantId: "swiggy", method: "rule" });
    expect(resolveMerchant(source("RELIANCE DIGITAL"))).toMatchObject({ merchantId: "reliance-digital", confidence: "high" });
    expect(resolveMerchant(source("RELIANCE"))).toMatchObject({ merchantId: "reliance", confidence: "high" });
    expect(resolveMerchant(source("HP GAS"))).toMatchObject({ merchantId: "hp-gas", confidence: "high" });
    expect(resolveMerchant(source("HPCL"))).toMatchObject({ merchantId: "hpcl", confidence: "high" });
  });

  it("does not turn a person-to-person transfer into a merchant", () => {
    const result = resolveMerchant(source("UPI/CR/318291/RAJU KUMAR/SBIN/9876543210@ybl/Payment"));
    expect(result).toMatchObject({ merchantId: null, confidence: "unknown", method: "unresolved", displayName: "Raju Kumar" });
  });

  it("returns a low-confidence contextual guess only with a category hint", () => {
    const result = resolveMerchant(source("Lunch with Swiggy", { category: "Food & Groceries" }));
    expect(result).toMatchObject({ merchantId: "swiggy", confidence: "low", method: "context" });
    expect(result.displayName).toBe("Swiggy");
    expect(resolveMerchant(source("Lunch with Swiggy"))).toMatchObject({ merchantId: null, confidence: "unknown" });
  });

  it("keeps unknown and empty values transparent", () => {
    expect(resolveMerchant(source("Mystery corner shop"))).toMatchObject({
      merchantId: null,
      displayName: "Mystery corner shop",
      confidence: "unknown",
      method: "unresolved",
    });
    expect(resolveMerchant(source("ATM WDL/412345"))).toMatchObject({
      merchantId: null,
      displayName: "Unknown merchant",
      rail: "atm",
    });
  });

  it("is deterministic, versioned, and batch resolution reuses equivalent work", () => {
    const inputs = [source("Swiggy"), { ...source("Swiggy"), refKey: "expense:e2" }, source("Mystery")];
    const first = resolveMerchants(inputs);
    expect(first).toEqual(resolveMerchants(inputs));
    expect(first.every((result) => result.version === 1)).toBe(true);
  });

  it("does not mutate source data", () => {
    const input = source("Swiggy");
    const before = JSON.stringify(input);
    resolveMerchant(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});
