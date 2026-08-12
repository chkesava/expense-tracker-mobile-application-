import { describe, expect, it } from "vitest";
import { adaptParsedSmsToWritePayload } from "@/services/sms/expenseAdapter";
import { processRawSmsMessages } from "@/services/sms/smsPipeline";
import type { SmsParsedTransaction } from "@/shared/types/smsTransaction";

describe("adaptParsedSmsToWritePayload", () => {
  it("maps expense drafts to ExpenseForm-compatible payloads", () => {
    const parsed: SmsParsedTransaction = {
      kind: "expense",
      amount: 249.5,
      date: "2026-08-10",
      merchant: "Swiggy",
      category: "Food & Dining",
      subcategory: "Delivery",
      confidence: 0.9,
    };

    const write = adaptParsedSmsToWritePayload(parsed, { tags: ["sms"] });
    expect(write).toEqual({
      collection: "expenses",
      payload: {
        amount: 249.5,
        category: "Food & Dining",
        subcategory: "Delivery",
        date: "2026-08-10",
        month: "2026-08",
        accountId: null,
        note: "Swiggy",
        tags: ["sms"],
      },
    });
  });

  it("returns null when amount/date missing", () => {
    expect(
      adaptParsedSmsToWritePayload({
        kind: "expense",
        confidence: 0.9,
      })
    ).toBeNull();
  });
});

describe("processRawSmsMessages", () => {
  it("detects debit SMS as expense and prepares a local write payload", () => {
    const result = processRawSmsMessages([
      {
        id: "1",
        address: "VK-HDFCBK",
        body: "Your account has been debited ₹500",
        receivedAtMs: Date.parse("2026-08-10T10:00:00+05:30"),
      },
    ]);
    expect(result.records[0]?.parsed?.kind).toBe("expense");
    expect(result.records[0]?.parsed?.amount).toBe(500);
    expect(result.writeReady).toHaveLength(1);
    expect(result.writeReady[0]?.write.collection).toBe("expenses");
  });

  it("skips OTP messages", () => {
    const result = processRawSmsMessages([
      {
        id: "2",
        address: "VK-HDFCBK",
        body: "Your OTP is 482913. Do not share with anyone.",
        receivedAtMs: Date.now(),
      },
    ]);
    expect(result.records[0]?.parsed?.kind).toBe("otp");
    expect(result.records[0]?.skipReason).toBe("otp");
    expect(result.writeReady).toHaveLength(0);
  });
});
