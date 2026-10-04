import { describe, expect, it } from "vitest";

import { MERCHANT_NORMALIZE_VERSION, normalizeMerchantText } from "./merchantNormalize";

/** Representative Indian narrations (synthetic — no real account data). */
const FIXTURES: { raw: string; rail: string; display: string; normalized: string }[] = [
  // UPI, SBI-style, merchant QR
  { raw: "UPI/DR/318291/ANANDA BHA/paytmqr6w@/FOOD", rail: "upi_qr", display: "Ananda Bha", normalized: "anandabha" },
  // UPI, HDFC-style dash format
  { raw: "UPI-SWIGGY-SWIGGY@ICICI-ICIC0DC0099-318291234567-PAYMENT", rail: "upi", display: "Swiggy", normalized: "swiggy" },
  // UPI, no name segment: the VPA hint is used for matching only
  { raw: "UPI/318291234567/Payment from Ph/swiggy@icici/ICICI Bank", rail: "upi", display: "", normalized: "swiggy" },
  // UPI P2P with a phone-number VPA
  { raw: "UPI/CR/318291/RAJU KUMAR/SBIN/9876543210@ybl/Payment", rail: "upi", display: "Raju Kumar", normalized: "rajukumar" },
  { raw: "BY TRANSFER-UPI/CR/318291/RAJU/SBIN/raju.k@okaxis/NA", rail: "upi", display: "Raju", normalized: "raju" },
  { raw: "UPI/P2M/318291234567/Swiggy Limited", rail: "upi", display: "Swiggy", normalized: "swiggy" },
  // PhonePe merchant QR
  { raw: "UPI/DR/412345/KIRANA STORE/q123456789@ybl/UPI", rail: "upi_qr", display: "Kirana Store", normalized: "kiranastore" },
  // Card descriptors
  { raw: "POS 412345XXXXXX1234 SWIGGY BANGALORE IN", rail: "card", display: "Swiggy", normalized: "swiggy" },
  { raw: "ECOM PUR/RAZORPAY*ZOMATO/BANGALORE", rail: "card", display: "Zomato", normalized: "zomato" },
  { raw: "POS 4123XXXX9876 DMART STORE 123 PUNE IN", rail: "card", display: "Dmart", normalized: "dmart" },
  { raw: "POS 4123XXXX9876 STARBUCKS #1234 NEW DELHI IN", rail: "card", display: "Starbucks", normalized: "starbucks" },
  // Gateways
  { raw: "PYU*SWIGGY", rail: "gateway", display: "Swiggy", normalized: "swiggy" },
  { raw: "RAZORPAY_ACME FOODS", rail: "gateway", display: "Acme Foods", normalized: "acmefoods" },
  // Descriptor detail and domains
  { raw: "UBER *TRIP", rail: "other", display: "Uber", normalized: "uber" },
  { raw: "WWW.SWIGGY.COM", rail: "other", display: "Swiggy", normalized: "swiggy" },
  { raw: "AMAZON.IN", rail: "other", display: "Amazon", normalized: "amazon" },
  // Bank transfers
  { raw: "NEFT-HDFC0000001-ACME TECHNOLOGIES PVT LTD-SALARY OCT", rail: "neft", display: "Acme Technologies", normalized: "acmetechnologies" },
  { raw: "NEFT CR-N123456789012-ACME CORP", rail: "neft", display: "Acme", normalized: "acme" },
  { raw: "IMPS/P2A/318291234567/RAJU/SBIN", rail: "imps", display: "Raju", normalized: "raju" },
  { raw: "RTGS-UTIBR52026100300001-ACME CORPORATION", rail: "rtgs", display: "Acme", normalized: "acme" },
  // ATM: no merchant name
  { raw: "ATM WDL/MG ROAD BANGALORE/412345", rail: "atm", display: "", normalized: "" },
  // SMS-imported notes: first segment is the merchant, the rest gives the rail
  { raw: "Swiggy · UPI · HDFC Bank · A/c 1234 · Ref 318291234567", rail: "upi", display: "Swiggy", normalized: "swiggy" },
  { raw: "Zomato · CARD · ICICI Bank", rail: "card", display: "Zomato", normalized: "zomato" },
  // Legal suffixes
  { raw: "ACME TECHNOLOGIES PRIVATE LIMITED", rail: "other", display: "Acme Technologies", normalized: "acmetechnologies" },
  { raw: "TATA & CO", rail: "other", display: "Tata", normalized: "tata" },
  // Manual notes keep their own casing
  { raw: "Lunch at Ananda Bhavan", rail: "other", display: "Lunch at Ananda Bhavan", normalized: "lunchatanandabhavan" },
];

describe("normalizeMerchantText", () => {
  it.each(FIXTURES)("$raw", ({ raw, rail, display, normalized }) => {
    const n = normalizeMerchantText(raw);
    expect(n.rail).toBe(rail);
    expect(n.display).toBe(display);
    expect(n.normalized).toBe(normalized);
    expect(n.raw).toBe(raw);
  });

  it("converges casing, punctuation, card, domain and gateway variants", () => {
    const variants = [
      "SWIGGY",
      "Swiggy",
      "  swiggy ",
      "Swiggy!",
      "WWW.SWIGGY.COM",
      "POS 4123XXXX9876 SWIGGY BANGALORE IN",
      "PYU*SWIGGY",
      "UPI-SWIGGY-SWIGGY@ICICI-ICIC0DC0099-318291234567-PAYMENT",
      "SWIGGY LIMITED",
    ];
    expect(new Set(variants.map((v) => normalizeMerchantText(v).normalized))).toEqual(new Set(["swiggy"]));
  });

  it("keeps semantic words and different merchants apart (no false merges)", () => {
    const n = (s: string) => normalizeMerchantText(s);
    expect(n("AIR INDIA").display).toBe("Air India");
    expect(n("FOOD PLAZA").display).toBe("Food Plaza");
    expect(n("BIG BAZAAR STORE").display).toBe("Big Bazaar Store");
    // A trailing city is only noise in a card descriptor, and at most one is removed.
    expect(n("TASTE OF BOMBAY").display).toBe("Taste of Bombay");
    expect(n("POS 4123XXXX9876 TASTE OF BOMBAY MUMBAI IN").display).toBe("Taste of Bombay");
    expect(n("Lunch Chennai").display).toBe("Lunch Chennai");
    expect(n("POS 4123XXXX9876 CHENNAI").display).toBe("Chennai");
    // Never reduced to nothing by legal-suffix stripping.
    expect(n("LIMITED").display).toBe("Limited");
    // "PAYTM" without a separator is a name, not a gateway prefix.
    expect(n("PAYTM MALL")).toMatchObject({ display: "Paytm Mall", rail: "other" });
    expect(n("PAYTM MALL").gateway).toBeUndefined();
    const distinct = ["RELIANCE DIGITAL", "RELIANCE RETAIL", "HP GAS", "HPCL", "AIR INDIA", "INDIAN OIL"].map((s) => n(s).normalized);
    expect(new Set(distinct).size).toBe(distinct.length);
  });

  it("records the gateway, descriptor detail and VPA hint", () => {
    expect(normalizeMerchantText("PYU*SWIGGY").gateway).toBe("PayU");
    expect(normalizeMerchantText("ECOM PUR/RAZORPAY*ZOMATO/BANGALORE").gateway).toBe("Razorpay");
    expect(normalizeMerchantText("UBER *TRIP").detail).toBe("trip");
    const upi = normalizeMerchantText("UPI-SWIGGY-SWIGGY@ICICI-ICIC0DC0099-318291234567-PAYMENT");
    expect(upi.vpa).toEqual({ handle: "icici", local: "swiggy" });
    expect(upi.candidates).toEqual(["swiggy"]);
    const google = normalizeMerchantText("GOOGLE *YOUTUBEPREMIUM");
    expect(google.candidates).toEqual(["google", "youtubepremium"]);
  });

  it("never exposes VPAs, phone numbers, accounts or references in the name", () => {
    for (const { raw } of FIXTURES) {
      const n = normalizeMerchantText(raw);
      expect(n.display).not.toMatch(/@/);
      expect(n.display).not.toMatch(/\d{5,}/);
      expect(n.tokens.join(" ")).not.toMatch(/\d{5,}/);
    }
    // A phone-number VPA is not kept, even as a matching hint.
    const p2p = normalizeMerchantText("UPI/CR/318291/RAJU KUMAR/SBIN/9876543210@ybl/Payment");
    expect(p2p.vpa).toEqual({ handle: "ybl" });
    expect(p2p.candidates).toEqual(["rajukumar"]);
    // QR VPAs carry no merchant hint.
    expect(normalizeMerchantText("UPI/DR/412345/KIRANA STORE/q123456789@ybl/UPI").vpa?.local).toBeUndefined();
  });

  it("keeps non-Latin notes", () => {
    const n = normalizeMerchantText("किराना स्टोर");
    expect(n.display).toBe("किराना स्टोर");
    expect(n.normalized.length).toBeGreaterThan(0);
  });

  it("handles empty input", () => {
    for (const raw of ["", "   ", null, undefined]) {
      expect(normalizeMerchantText(raw)).toMatchObject({ rail: "other", display: "", normalized: "", candidates: [] });
    }
  });

  it("is deterministic, leaves its input alone and is versioned", () => {
    for (const { raw } of FIXTURES) {
      expect(normalizeMerchantText(raw)).toEqual(normalizeMerchantText(raw));
    }
    expect(MERCHANT_NORMALIZE_VERSION).toBe(1);
  });

  it("is fast enough for batch processing", () => {
    const inputs = Array.from({ length: 20_000 }, (_, i) => `${FIXTURES[i % FIXTURES.length].raw} ${i}`);
    const start = performance.now();
    for (const raw of inputs) normalizeMerchantText(raw);
    expect(performance.now() - start).toBeLessThan(2000);
  });
});
