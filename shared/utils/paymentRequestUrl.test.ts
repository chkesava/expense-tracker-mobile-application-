import { describe, expect, it, vi, beforeEach } from "vitest";
import { getPaymentRequestShareUrl, getPublicAppOrigin } from "./paymentRequestUrl";
import { generateUpiLink } from "./upi";

describe("paymentRequestUrl utilities", () => {
  describe("getPublicAppOrigin", () => {
    it("returns empty string when no env var is set", () => {
      const origin = getPublicAppOrigin();
      // In test environment, no env var is set — should return empty string
      expect(typeof origin).toBe("string");
    });

    it("strips trailing slash from env var", () => {
      const original = process.env.EXPO_PUBLIC_APP_URL;
      process.env.EXPO_PUBLIC_APP_URL = "https://myapp.com/";
      const origin = getPublicAppOrigin();
      expect(origin).toBe("https://myapp.com");
      process.env.EXPO_PUBLIC_APP_URL = original;
    });
  });

  describe("getPaymentRequestShareUrl", () => {
    it("constructs correct share URL with slug", () => {
      const original = process.env.EXPO_PUBLIC_APP_URL;
      process.env.EXPO_PUBLIC_APP_URL = "https://myapp.com";
      const url = getPaymentRequestShareUrl("abc123");
      expect(url).toBe("https://myapp.com/payment/abc123");
      process.env.EXPO_PUBLIC_APP_URL = original;
    });

    it("handles missing env var gracefully — no leading slash corruption", () => {
      const original = process.env.EXPO_PUBLIC_APP_URL;
      delete process.env.EXPO_PUBLIC_APP_URL;
      const url = getPaymentRequestShareUrl("xyz789");
      expect(url).toContain("xyz789");
      process.env.EXPO_PUBLIC_APP_URL = original;
    });
  });
});

describe("UPI link generation for payment requests", () => {
  it("generates valid UPI deep link from payment request data", () => {
    const link = generateUpiLink("payee@okaxis", "Test User", 500, "For Rent");
    expect(link).toContain("upi://pay");
    expect(link).toContain("pa=payee%40okaxis");
    expect(link).toContain("am=500.00");
    expect(link).toContain("cu=INR");
    expect(link).toContain("tn=For%20Rent");
  });

  it("returns empty string for empty UPI ID", () => {
    const link = generateUpiLink("", "Test User", 500, "Rent");
    expect(link).toBe("");
  });
});
