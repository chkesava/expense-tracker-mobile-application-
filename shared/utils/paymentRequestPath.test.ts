import { describe, expect, it } from "vitest";
import { getPaymentSlugFromLocation, getSplitSlugFromLocation } from "./paymentRequestPath";

describe("paymentRequestPath", () => {
  it("prefers explicit param slug", () => {
    expect(getPaymentSlugFromLocation("/payment/ignored", "abc123")).toBe("abc123");
  });

  it("parses /payment/:slug and legacy /pay/:slug", () => {
    expect(getPaymentSlugFromLocation("/payment/hello-world")).toBe("hello-world");
    expect(getPaymentSlugFromLocation("/pay/legacy1")).toBe("legacy1");
    expect(getPaymentSlugFromLocation("/payment/a%2Fb")).toBe("a/b");
  });

  it("returns undefined for unrelated paths", () => {
    expect(getPaymentSlugFromLocation("/settings")).toBeUndefined();
    expect(getPaymentSlugFromLocation("/payment/")).toBeUndefined();
  });

  it("parses /split/:slug", () => {
    expect(getSplitSlugFromLocation("/split/abc123")).toBe("abc123");
    expect(getSplitSlugFromLocation("/split/ignored", "explicit")).toBe("explicit");
    expect(getSplitSlugFromLocation("/payment/abc")).toBeUndefined();
  });
});
