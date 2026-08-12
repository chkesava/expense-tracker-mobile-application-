import { describe, expect, it } from "vitest";

import { routeWriteReady, isHighConfidenceForAutoAdd } from "@/services/sms/smsAutoAdd";
import { normalizeSmsAutomationPrefs } from "@/services/sms/smsAutomationPrefs";
import { processRawSmsMessages } from "@/services/sms/smsPipeline";
import type { RawSmsMessage } from "@/shared/types/smsTransaction";

const swiggy: RawSmsMessage = {
  id: "1",
  address: "VK-SBIINB",
  body:
    "Your A/c XX4521 has been debited for Rs.450 on 12-08-2026 towards Swiggy via UPI. Ref No 987654321012. -SBI",
  receivedAtMs: Date.parse("2026-08-12T10:00:00+05:30"),
};

const vagueDebit: RawSmsMessage = {
  id: "2",
  address: "VK-HDFCBK",
  body: "Your account has been debited ₹500",
  receivedAtMs: Date.parse("2026-08-10T10:00:00+05:30"),
};

describe("normalizeSmsAutomationPrefs", () => {
  it("defaults to review-before-adding", () => {
    const prefs = normalizeSmsAutomationPrefs({ enabled: true });
    expect(prefs.handlingMode).toBe("review");
    expect(prefs.reviewBeforeAdding).toBe(true);
    expect(prefs.autoAdd).toBe(false);
  });

  it("migrates legacy autoAdd flag", () => {
    expect(normalizeSmsAutomationPrefs({ enabled: true, autoAdd: true }).handlingMode).toBe(
      "auto"
    );
  });

  it("migrates both-false flags to manual", () => {
    expect(
      normalizeSmsAutomationPrefs({
        enabled: true,
        autoAdd: false,
        reviewBeforeAdding: false,
      }).handlingMode
    ).toBe("manual");
  });
});

describe("auto-add routing", () => {
  it("treats a parsed Swiggy debit as high confidence", () => {
    const result = processRawSmsMessages([swiggy]);
    expect(isHighConfidenceForAutoAdd(result.writeReady[0]?.record.parsed)).toBe(
      true
    );
  });

  it("sends a vague debit without merchant to review", () => {
    const result = processRawSmsMessages([vagueDebit]);
    expect(isHighConfidenceForAutoAdd(result.writeReady[0]?.record.parsed)).toBe(
      false
    );
    const routed = routeWriteReady(result.writeReady, "auto");
    expect(routed.toCommit).toHaveLength(0);
    expect(routed.toReview).toHaveLength(1);
  });

  it("auto mode commits high confidence and reviews the rest", () => {
    const result = processRawSmsMessages([swiggy, vagueDebit]);
    const routed = routeWriteReady(result.writeReady, "auto");
    expect(routed.toCommit).toHaveLength(1);
    expect(routed.toReview).toHaveLength(1);
    expect(routed.toCommit[0]?.record.parsed?.merchant).toBe("Swiggy");
  });

  it("review mode parks every candidate", () => {
    const result = processRawSmsMessages([swiggy, vagueDebit]);
    const routed = routeWriteReady(result.writeReady, "review");
    expect(routed.toCommit).toHaveLength(0);
    expect(routed.toReview).toHaveLength(2);
  });

  it("manual mode does not commit or queue live drafts", () => {
    const result = processRawSmsMessages([swiggy]);
    const routed = routeWriteReady(result.writeReady, "manual");
    expect(routed.toCommit).toHaveLength(0);
    expect(routed.toReview).toHaveLength(0);
  });
});
