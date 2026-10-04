import type { MerchantOverride, MerchantSourceText } from "../types/merchant";
import { merchantCategorySuggestion } from "./merchantCategory";
import { resolveMerchants } from "./merchantResolve";

export interface MerchantQaFixture {
  id: string;
  source: MerchantSourceText;
  expectedMerchantId?: string;
  expectedCategory?: string;
  corrected?: boolean;
}

export interface MerchantQaMetrics {
  fixtureCount: number;
  resolvedCount: number;
  highConfidenceCount: number;
  correctedCount: number;
  falsePositiveCount: number;
  unknownCount: number;
  categorySuggestionCount: number;
  categorySuggestionCorrectCount: number;
  fragmentedMerchantCount: number;
  coverageRate: number;
  highConfidenceRate: number;
  falsePositiveRate: number;
  unknownRate: number;
  categoryAccuracy: number | null;
}

/** Privacy-safe, synthetic coverage fixture. These are not production samples. */
export const MERCHANT_QA_FIXTURES: readonly MerchantQaFixture[] = [
  { id: "upi-swiggy", source: { refKey: "expense:qa-upi-1", kind: "expense", text: "UPI/DR/SWIGGY/ORDER/1234", category: "Food & Groceries" }, expectedMerchantId: "swiggy", expectedCategory: "Food & Groceries" },
  { id: "card-swiggy", source: { refKey: "expense:qa-card-1", kind: "expense", text: "HDFC CARD SWIGGY BENGALURU", category: "Food & Groceries" }, expectedMerchantId: "swiggy", expectedCategory: "Food & Groceries" },
  { id: "gateway-amazon", source: { refKey: "expense:qa-gateway-1", kind: "expense", text: "RAZORPAY AMAZON SELLER SERVICES", category: "Shopping & Clothing" }, expectedMerchantId: "amazon", expectedCategory: "Shopping & Clothing" },
  { id: "bank-reliance-digital", source: { refKey: "expense:qa-bank-1", kind: "expense", text: "NEFT RELIANCE DIGITAL STORE HYDERABAD", category: "Shopping & Clothing" }, expectedMerchantId: "reliance-digital", expectedCategory: "Shopping & Clothing" },
  { id: "hp-gas", source: { refKey: "expense:qa-hpgas-1", kind: "expense", text: "HP GAS BOOKING", category: "Home & Household" }, expectedMerchantId: "hp-gas", expectedCategory: "Home & Household" },
  { id: "hpcl-lookalike", source: { refKey: "expense:qa-hpcl-1", kind: "expense", text: "HPCL FUEL STATION", category: "Transport & Vehicles" }, expectedMerchantId: "hpcl", expectedCategory: "Transport & Vehicles" },
  { id: "p2p-person", source: { refKey: "expense:qa-p2p-1", kind: "expense", text: "UPI/RAVI KUMAR/123456", category: "Food & Groceries" } },
  { id: "unknown-store", source: { refKey: "expense:qa-unknown-1", kind: "expense", text: "NEFT LOCAL STORE 7788" } },
  { id: "corrected-alias", source: { refKey: "expense:qa-corrected-1", kind: "expense", text: "UPI/LOCAL CAFE/55", category: "Food & Groceries" }, expectedMerchantId: "custom:my-cafe", corrected: true },
];

export function runMerchantQa(
  fixtures: readonly MerchantQaFixture[] = MERCHANT_QA_FIXTURES,
  overrides: readonly MerchantOverride[] = [],
): MerchantQaMetrics {
  const resolutions = resolveMerchants(fixtures.map((fixture) => fixture.source), overrides);
  const groups = new Map<string, Set<string>>();
  let resolvedCount = 0;
  let highConfidenceCount = 0;
  let correctedCount = 0;
  let falsePositiveCount = 0;
  let unknownCount = 0;
  let categorySuggestionCount = 0;
  let categorySuggestionCorrectCount = 0;
  fixtures.forEach((fixture, index) => {
    const resolution = resolutions[index]!;
    if (resolution.merchantId) {
      resolvedCount += 1;
      const members = groups.get(resolution.merchantId) ?? new Set<string>();
      members.add(resolution.normalized);
      groups.set(resolution.merchantId, members);
    } else unknownCount += 1;
    if (resolution.confidence === "high") highConfidenceCount += 1;
    if (fixture.corrected && resolution.method.startsWith("user_")) correctedCount += 1;
    if (!fixture.expectedMerchantId && resolution.merchantId) falsePositiveCount += 1;
    const suggestion = merchantCategorySuggestion(resolution);
    if (suggestion) {
      categorySuggestionCount += 1;
      if (suggestion.category === fixture.expectedCategory) categorySuggestionCorrectCount += 1;
    }
  });
  const fixtureCount = fixtures.length;
  const expected = fixtures.filter((fixture) => fixture.expectedCategory).length;
  return {
    fixtureCount,
    resolvedCount,
    highConfidenceCount,
    correctedCount,
    falsePositiveCount,
    unknownCount,
    categorySuggestionCount,
    categorySuggestionCorrectCount,
    fragmentedMerchantCount: [...groups.values()].filter((keys) => keys.size > 1).length,
    coverageRate: fixtureCount ? resolvedCount / fixtureCount : 0,
    highConfidenceRate: fixtureCount ? highConfidenceCount / fixtureCount : 0,
    falsePositiveRate: fixtureCount ? falsePositiveCount / fixtureCount : 0,
    unknownRate: fixtureCount ? unknownCount / fixtureCount : 0,
    categoryAccuracy: categorySuggestionCount && expected ? categorySuggestionCorrectCount / categorySuggestionCount : null,
  };
}
