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
  it("skips unknown templates from Phase 0 stub parser", () => {
    const result = processRawSmsMessages([
      {
        id: "1",
        address: "VK-HDFCBK",
        body: "INR 500 debited",
        receivedAtMs: Date.now(),
      },
    ]);
    expect(result.writeReady).toHaveLength(0);
    expect(result.records[0]?.status).toBe("skipped");
  });
});
