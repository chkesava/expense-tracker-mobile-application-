import { describe, expect, it } from "vitest";

import {
  buildSmsDedupeKeys,
  findDuplicateSmsKey,
  normalizeSmsReferenceId,
} from "@/services/sms/smsDedupe";
import { parseBankSms } from "@/services/sms/smsParser";
import { processRawSmsMessages } from "@/services/sms/smsPipeline";
import type { RawSmsMessage } from "@/shared/types/smsTransaction";

const debitWithRef = (id: string, receivedAtMs: number): RawSmsMessage => ({
  id,
  address: "VK-SBIINB",
  body:
    "Your A/c XX4521 has been debited for Rs.450 on 12-08-2026 towards Swiggy via UPI. Ref No 987654321012. -SBI",
  receivedAtMs,
});

describe("normalizeSmsReferenceId", () => {
  it("folds case and separators", () => {
    expect(normalizeSmsReferenceId("987654321012")).toBe("987654321012");
    expect(normalizeSmsReferenceId(" 98-7654 321012 ")).toBe("987654321012");
  });
});

describe("duplicate detection", () => {
  it("treats the same reference ID as already existing", () => {
    const first = parseBankSms(debitWithRef("a", 1_000));
    const second = parseBankSms(debitWithRef("b", 2_000));
    const known = new Set(buildSmsDedupeKeys(debitWithRef("a", 1_000), first));
    expect(findDuplicateSmsKey(buildSmsDedupeKeys(debitWithRef("b", 2_000), second), known)).toMatch(
      /^ref:/
    );
  });

  it("ignores the second SMS with the same UTR in the pipeline", () => {
    const result = processRawSmsMessages([
      debitWithRef("1", Date.parse("2026-08-12T10:00:00+05:30")),
      debitWithRef("2", Date.parse("2026-08-12T10:05:00+05:30")),
    ]);
    expect(result.writeReady).toHaveLength(1);
    expect(result.records[1]?.skipReason).toBe("duplicate");
  });

  it("lets a different reference ID continue", () => {
    const result = processRawSmsMessages([
      debitWithRef("1", Date.parse("2026-08-12T10:00:00+05:30")),
      {
        id: "2",
        address: "VK-SBIINB",
        body:
          "Your A/c XX4521 has been debited for Rs.450 on 12-08-2026 towards Swiggy via UPI. Ref No 111222333444. -SBI",
        receivedAtMs: Date.parse("2026-08-12T11:00:00+05:30"),
      },
    ]);
    expect(result.writeReady).toHaveLength(2);
  });

  it("falls back to amount+date+merchant when no reference ID exists", () => {
    const noRef = (id: string, receivedAtMs: number): RawSmsMessage => ({
      id,
      address: "VK-SBIINB",
      body:
        "Your A/c XX4521 has been debited for Rs.450 on 12-08-2026 towards Swiggy via UPI. -SBI",
      receivedAtMs,
    });
    const result = processRawSmsMessages([
      noRef("1", Date.parse("2026-08-12T10:00:00+05:30")),
      noRef("2", Date.parse("2026-08-12T10:05:00+05:30")),
    ]);
    expect(result.writeReady).toHaveLength(1);
    expect(result.records[1]?.skipReason).toBe("duplicate");
  });
});
