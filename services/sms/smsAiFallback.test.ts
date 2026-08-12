import { describe, expect, it } from "vitest";

import { isHighConfidenceForAutoAdd } from "@/services/sms/smsAutoAdd";
import { parseBankSms } from "@/services/sms/smsParser";
import { processRawSmsMessages } from "@/services/sms/smsPipeline";
import type { RawSmsMessage } from "@/shared/types/smsTransaction";

const swiggy: RawSmsMessage = {
  id: "1",
  address: "VK-SBIINB",
  body:
    "Your A/c XX4521 has been debited for Rs.450 on 12-08-2026 towards Swiggy via UPI. Ref No 987654321012. -SBI",
  receivedAtMs: Date.parse("2026-08-12T10:00:00+05:30"),
};

const netflixDeducted: RawSmsMessage = {
  id: "2",
  address: "VK-HDFCBK",
  body: "Rs 649 deducted. Netflix subscription auto-pay.",
  receivedAtMs: Date.parse("2026-08-12T10:00:00+05:30"),
};

const vagueDebit: RawSmsMessage = {
  id: "3",
  address: "VK-HDFCBK",
  body: "Your account has been debited ₹500",
  receivedAtMs: Date.parse("2026-08-10T10:00:00+05:30"),
};

describe("SMS AI fallback", () => {
  it("does not run on a high-confidence Swiggy debit", () => {
    const parsed = parseBankSms(swiggy);
    expect(parsed.merchant).toBe("Swiggy");
    expect(parsed.parseReasons?.some((r) => r.startsWith("ai_fallback"))).toBe(
      false
    );
    expect(isHighConfidenceForAutoAdd(parsed)).toBe(true);
  });

  it("recovers Netflix from a low-confidence deducted SMS", () => {
    const parsed = parseBankSms(netflixDeducted);
    expect(parsed.kind).toBe("expense");
    expect(parsed.merchant).toBe("Netflix");
    expect(parsed.amount).toBe(649);
    expect(parsed.category).toBe("Entertainment");
    expect(parsed.parseReasons).toContain("ai_fallback");
    expect(isHighConfidenceForAutoAdd(parsed)).toBe(true);

    const pipeline = processRawSmsMessages([netflixDeducted]);
    expect(pipeline.writeReady).toHaveLength(1);
    expect(pipeline.writeReady[0]?.write.collection).toBe("expenses");
  });

  it("leaves a vague debit in review when nothing can be recovered", () => {
    const parsed = parseBankSms(vagueDebit);
    expect(parsed.kind).toBe("expense");
    expect(parsed.merchant).toBeUndefined();
    expect(isHighConfidenceForAutoAdd(parsed)).toBe(false);
  });
});
