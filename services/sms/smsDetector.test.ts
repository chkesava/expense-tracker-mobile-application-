import { describe, expect, it } from "vitest";

import { detectSmsTransaction } from "@/services/sms/smsDetector";
import { parseBankSms } from "@/services/sms/smsParser";

describe("detectSmsTransaction", () => {
  it("classifies debit alerts as expense", () => {
    const result = detectSmsTransaction({
      address: "VK-HDFCBK",
      body: "Your account has been debited ₹500",
    });
    expect(result.kind).toBe("expense");
    expect(result.amount).toBe(500);
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it("classifies credit alerts as income", () => {
    const result = detectSmsTransaction({
      address: "VK-SBIINB",
      body: "₹35,000 credited to your account",
    });
    expect(result.kind).toBe("income");
    expect(result.amount).toBe(35000);
  });

  it("classifies fund transfers as transfer", () => {
    const result = detectSmsTransaction({
      address: "AX-AXISBK",
      body: "INR 2,000 transferred to A/c XX4521 via IMPS Ref 998877",
    });
    expect(result.kind).toBe("transfer");
    expect(result.amount).toBe(2000);
  });

  it("classifies OTP messages as otp", () => {
    const result = detectSmsTransaction({
      address: "VK-HDFCBK",
      body: "Your OTP is 482913. Do not share with anyone.",
    });
    expect(result.kind).toBe("otp");
  });

  it("classifies promo blasts as promotional", () => {
    const result = detectSmsTransaction({
      address: "VK-PROMO",
      body: "Flat 20% off! Limited period offer. Apply now.",
    });
    expect(result.kind).toBe("promotional");
  });

  it("classifies unrelated text as non_financial", () => {
    const result = detectSmsTransaction({
      address: "VK-ALERT",
      body: "Your statement is ready to view in net banking.",
    });
    expect(result.kind).toBe("non_financial");
  });
});

describe("parseBankSms", () => {
  it("maps detection into a parsed draft with date from SMS timestamp", () => {
    const parsed = parseBankSms({
      id: "9",
      address: "VK-HDFCBK",
      body: "Your account has been debited ₹500",
      receivedAtMs: Date.parse("2026-08-11T12:00:00+05:30"),
    });
    expect(parsed.kind).toBe("expense");
    expect(parsed.amount).toBe(500);
    expect(parsed.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(parsed.month).toBe(parsed.date?.slice(0, 7));
  });
});
