import { describe, expect, it } from "vitest";

import {
  filterRelevantSms,
  isRelevantTransactionSms,
} from "@/services/sms/smsRelevanceFilter";
import type { RawSmsMessage } from "@/shared/types/smsTransaction";

function sms(partial: Partial<RawSmsMessage> & Pick<RawSmsMessage, "body">): RawSmsMessage {
  return {
    id: partial.id ?? "1",
    address: partial.address ?? "VK-HDFCBK",
    body: partial.body,
    receivedAtMs: partial.receivedAtMs ?? Date.now(),
    read: partial.read,
  };
}

describe("isRelevantTransactionSms", () => {
  it("accepts typical debit alerts", () => {
    expect(
      isRelevantTransactionSms(
        sms({
          body: "INR 1,250.00 debited from A/C XX1234 on 10-08-26. Avl Bal INR 9,000.00",
        })
      )
    ).toBe(true);
  });

  it("accepts UPI credit alerts", () => {
    expect(
      isRelevantTransactionSms(
        sms({
          address: "AX-PhonePe",
          body: "You received Rs.500 via UPI Ref 123456789012",
        })
      )
    ).toBe(true);
  });

  it("rejects OTPs and promo SMS", () => {
    expect(
      isRelevantTransactionSms(
        sms({
          address: "VK-HDFCBK",
          body: "Your OTP is 482913. Do not share with anyone.",
        })
      )
    ).toBe(false);
    expect(
      isRelevantTransactionSms(
        sms({
          address: "VK-PROMO",
          body: "Flash sale tonight! Shop now at our store.",
        })
      )
    ).toBe(false);
  });
});

describe("filterRelevantSms", () => {
  it("keeps only financial candidates", () => {
    const filtered = filterRelevantSms([
      sms({ id: "1", body: "OTP 111222 for login" }),
      sms({
        id: "2",
        body: "Rs.99 spent on Amazon using your card ending 4212",
      }),
    ]);
    expect(filtered.map((m) => m.id)).toEqual(["2"]);
  });
});
