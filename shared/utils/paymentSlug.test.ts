import { afterEach, describe, expect, it, vi } from "vitest";
import { generatePaymentSlug } from "./paymentSlug";

describe("generatePaymentSlug", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a lowercase alphanumeric string of the requested length", () => {
    const slug = generatePaymentSlug(10);
    expect(slug).toMatch(/^[a-z0-9]{10}$/);
  });

  it("still works when Web Crypto is missing (Hermes / older RN)", () => {
    vi.stubGlobal("crypto", undefined);
    const slug = generatePaymentSlug(8);
    expect(slug).toMatch(/^[a-z0-9]{8}$/);
  });

  it("still works when crypto exists but getRandomValues does not", () => {
    vi.stubGlobal("crypto", {});
    const slug = generatePaymentSlug(8);
    expect(slug).toMatch(/^[a-z0-9]{8}$/);
  });
});
