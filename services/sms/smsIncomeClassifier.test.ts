import { describe, expect, it } from "vitest";

import { classifySmsIncomeSource } from "@/services/sms/smsIncomeClassifier";
import { adaptParsedSmsToWritePayload } from "@/services/sms/expenseAdapter";
import { parseBankSms } from "@/services/sms/smsParser";
import { processRawSmsMessages } from "@/services/sms/smsPipeline";
import { briefSmsCategoryLabel, reviewItemMerchant } from "@/services/sms/smsReviewInbox";
import { writeReadyToInboxItems } from "@/services/sms/smsReviewActions";

describe("classifySmsIncomeSource", () => {
  it("maps a large generic credit to Salary", () => {
    expect(classifySmsIncomeSource("₹35,000 credited", 35000)).toBe("Salary");
  });

  it("detects refunds, cashback, interest, and UPI received", () => {
    expect(classifySmsIncomeSource("Refund of Rs.200 credited to A/c", 200)).toBe(
      "Refund"
    );
    expect(classifySmsIncomeSource("Rs.50 cashback credited", 50)).toBe("Cashback");
    expect(
      classifySmsIncomeSource("Interest of Rs.120 credited to your FD", 120)
    ).toBe("Interest");
    expect(
      classifySmsIncomeSource("Rs.800 received via UPI from AMIT", 800)
    ).toBe("UPI Received");
  });

  it("uses Bank Credit for smaller unnamed deposits", () => {
    expect(classifySmsIncomeSource("Rs.2,000 has been credited to your A/c", 2000)).toBe(
      "Bank Credit"
    );
  });
});

describe("income SMS pipeline", () => {
  it("parses ₹35,000 credited as Income → Salary", () => {
    const parsed = parseBankSms({
      id: "inc-1",
      address: "VK-SBIINB",
      body: "₹35,000 credited to your account",
      receivedAtMs: Date.parse("2026-08-12T10:00:00+05:30"),
    });
    expect(parsed.kind).toBe("income");
    expect(parsed.amount).toBe(35000);
    expect(parsed.incomeSource).toBe("Salary");

    const write = adaptParsedSmsToWritePayload(parsed);
    expect(write?.collection).toBe("incomes");
    if (write?.collection === "incomes") {
      expect(write.payload.source).toBe("Salary");
    }
  });

  it("shows Income / Salary on the review card", () => {
    const result = processRawSmsMessages([
      {
        id: "inc-2",
        address: "VK-SBIINB",
        body: "₹35,000 credited to your account",
        receivedAtMs: Date.parse("2026-08-12T10:00:00+05:30"),
      },
    ]);
    const items = writeReadyToInboxItems(result.writeReady);
    expect(items).toHaveLength(1);
    expect(reviewItemMerchant(items[0]!)).toBe("Income");
    expect(briefSmsCategoryLabel(items[0]!)).toBe("Salary");
  });
});
