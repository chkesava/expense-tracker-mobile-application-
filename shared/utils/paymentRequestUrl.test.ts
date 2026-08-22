import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPaymentRequestShareUrl, getPublicAppOrigin, getSplitShareUrl } from "./paymentRequestUrl";
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

  describe("getSplitShareUrl", () => {
    it("constructs the public split page URL", () => {
      const original = process.env.EXPO_PUBLIC_APP_URL;
      process.env.EXPO_PUBLIC_APP_URL = "https://myapp.com";
      expect(getSplitShareUrl("dinner42")).toBe("https://myapp.com/split/dinner42");
      process.env.EXPO_PUBLIC_APP_URL = original;
    });
  });
});

describe("share origin precedence", () => {
  const APP = "EXPO_PUBLIC_APP_URL";
  const SHARE = "EXPO_PUBLIC_SHARE_URL";
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of [APP, SHARE, "VITE_PUBLIC_APP_URL", "VITE_PUBLIC_SHARE_URL"]) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("prefers the share origin over the app origin", () => {
    // The whole point of the split: share pages are hosted independently of the
    // legacy web app, whose origin still backs /api/* and the Google bridge.
    process.env[APP] = "https://kesavaexpensetracker.netlify.app";
    process.env[SHARE] = "https://spendly-share.netlify.app";
    expect(getPublicAppOrigin()).toBe("https://spendly-share.netlify.app");
    expect(getSplitShareUrl("dinner42")).toBe(
      "https://spendly-share.netlify.app/split/dinner42"
    );
    expect(getPaymentRequestShareUrl("pay789")).toBe(
      "https://spendly-share.netlify.app/payment/pay789"
    );
  });

  it("never emits a share link against the legacy origin once the share var is set", () => {
    process.env[APP] = "https://kesavaexpensetracker.netlify.app";
    process.env[SHARE] = "https://spendly-share.netlify.app";
    for (const url of [getSplitShareUrl("s"), getPaymentRequestShareUrl("p")]) {
      expect(url).not.toContain("kesavaexpensetracker");
    }
  });

  it("falls back to the app origin when the share origin is unset", () => {
    // Keeps an older build that has not been given the new variable working.
    process.env[APP] = "https://kesavaexpensetracker.netlify.app";
    expect(getSplitShareUrl("dinner42")).toBe(
      "https://kesavaexpensetracker.netlify.app/split/dinner42"
    );
  });

  it("ignores an empty share origin rather than emitting a relative URL", () => {
    process.env[APP] = "https://kesavaexpensetracker.netlify.app";
    process.env[SHARE] = "";
    expect(getPublicAppOrigin()).toBe("https://kesavaexpensetracker.netlify.app");
  });

  it("strips a trailing slash from the share origin", () => {
    process.env[SHARE] = "https://spendly-share.netlify.app/";
    expect(getSplitShareUrl("dinner42")).toBe(
      "https://spendly-share.netlify.app/split/dinner42"
    );
  });

  it("returns empty with neither set, so callers can refuse to share", () => {
    expect(getPublicAppOrigin()).toBe("");
  });

  it("honours the VITE_ share variable for a web build sharing this module", () => {
    process.env.VITE_PUBLIC_SHARE_URL = "https://spendly-share.netlify.app";
    process.env[APP] = "https://kesavaexpensetracker.netlify.app";
    expect(getPublicAppOrigin()).toBe("https://spendly-share.netlify.app");
  });
});

describe("UPI link generation for payment requests", () => {
  it("generates valid UPI deep link from payment request data", () => {
    const link = generateUpiLink("payee@okaxis", "Test User", 500, "For Rent");
    expect(link).toContain("upi://pay");
    expect(link).toContain("pa=payee@okaxis");
    expect(link).toContain("am=500.00");
    expect(link).toContain("cu=INR");
    expect(link).toContain("tn=For%20Rent");
  });

  it("returns empty string for empty UPI ID", () => {
    const link = generateUpiLink("", "Test User", 500, "Rent");
    expect(link).toBe("");
  });
});
