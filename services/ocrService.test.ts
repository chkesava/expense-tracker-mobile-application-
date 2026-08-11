import { afterEach, describe, expect, it, vi } from "vitest";
import { parseReceiptOcrText } from "./ocrService";

describe("ocrService.parseReceiptOcrText", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns zero confidence for empty text", () => {
    expect(parseReceiptOcrText("")).toEqual({ confidence: 0 });
    expect(parseReceiptOcrText("   ")).toEqual({ confidence: 0 });
  });

  it("extracts merchant, keyword total, tax, and ISO date", () => {
    const result = parseReceiptOcrText(
      [
        "Big Bazaar Market",
        "Item A 40",
        "GST: 18",
        "Date: 2026-08-05",
        "Grand Total: Rs. 499.50",
      ].join("\n")
    );

    expect(result.merchant).toBe("Big Bazaar Market");
    expect(result.total).toBe(499.5);
    expect(result.tax).toBe(18);
    expect(result.date).toBe("2026-08-05");
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.suggestedCategory).toBeTruthy();
  });

  it("parses DD/MM/YYYY dates", () => {
    const result = parseReceiptOcrText("Shop\n11/08/2026\nTotal: 100");
    expect(result.date).toBe("2026-08-11");
    expect(result.total).toBe(100);
  });

  it("prefers day-first when both parts can be months (INR)", () => {
    // 08/11/2026 → 8 Nov 2026, not 11 Aug
    expect(parseReceiptOcrText("Shop\n08/11/2026\nTotal: 10").date).toBe(
      "2026-11-08"
    );
  });

  it("treats first part as month when second > 12", () => {
    expect(parseReceiptOcrText("Shop\n08/25/2026\nTotal: 10").date).toBe(
      "2026-08-25"
    );
  });

  it("falls back to largest bottom-half number when total keyword missing", () => {
    const result = parseReceiptOcrText(
      ["Corner Store", "Line item 12", "99", "250"].join("\n")
    );
    expect(result.total).toBe(250);
  });

  it("defaults missing date to local calendar day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 11, 12, 0, 0));
    const result = parseReceiptOcrText("Corner Store\nTotal: 50");
    expect(result.date).toBe("2026-08-11");
  });
});
