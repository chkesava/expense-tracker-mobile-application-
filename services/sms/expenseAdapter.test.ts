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
      category: "Food",
      subcategory: "Delivery",
      confidence: 0.9,
    };

    const write = adaptParsedSmsToWritePayload(parsed, { tags: ["sms"] });
    expect(write).toEqual({
      collection: "expenses",
      payload: {
        amount: 249.5,
        category: "Food",
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

  it("attaches an exact accountId only when the resolver auto-matches", () => {
    const result = processRawSmsMessages(
      [
        {
          id: "sm-1",
          address: "VM-SUPER",
          body: "INR 899 spent on Super Card ending 4521",
          receivedAtMs: Date.parse("2026-08-10T10:00:00+05:30"),
        },
      ],
      {
        accounts: [
          {
            id: "acc-super-cc",
            name: "Super Money Credit Card",
            typeId: "type-cc",
            displayName: "Super Money Credit Card",
            institutionId: "super_money",
            accountTypeId: "credit_card",
            last4: "4521",
            smsMatchingEnabled: true,
          },
        ],
      }
    );
    expect(result.writeReady[0]?.write.payload.accountId).toBe("acc-super-cc");
  });

  it("leaves accountId null when no user account is an exact match", () => {
    const result = processRawSmsMessages([
      {
        id: "1",
        address: "VK-HDFCBK",
        body: "Your account has been debited ₹500",
        receivedAtMs: Date.parse("2026-08-10T10:00:00+05:30"),
      },
    ]);
    expect(result.writeReady[0]?.write.payload.accountId).toBeNull();
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
