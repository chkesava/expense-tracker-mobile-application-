import { describe, expect, it } from "vitest";
import { generateUpiLink, isMobile } from "./upi";

describe("upi", () => {
  it("returns empty string without a UPI id", () => {
    expect(generateUpiLink("", "Ada", 10)).toBe("");
  });

  it("builds an encoded UPI deep link with INR currency", () => {
    const link = generateUpiLink("user@upi", "Ada Lovelace", 125.5, "Dinner & tips");
    expect(link).toBe(
      "upi://pay?pa=user@upi&pn=Ada%20Lovelace&am=125.50&tn=Dinner%20%26%20tips&cu=INR"
    );
  });

  it("detects mobile capability from navigator presence / UA", () => {
    // Vitest/node may expose a non-mobile navigator — document actual contract
    if (typeof navigator === "undefined") {
      expect(isMobile()).toBe(true);
    } else {
      expect(typeof isMobile()).toBe("boolean");
      expect(isMobile()).toBe(
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent ?? ""
        )
      );
    }
  });
});
