import { describe, expect, it } from "vitest";

import { processIncomingSmsMessages } from "@/services/sms/smsTransactionProcessor";

describe("processIncomingSmsMessages", () => {
  it("rejects empty batches without touching storage", async () => {
    const result = await processIncomingSmsMessages([]);
    expect(result).toEqual({
      accepted: false,
      reason: "empty",
      relevantCount: 0,
      skippedCount: 0,
      writeReadyCount: 0,
    });
  });

  it("respects blockImport (duress)", async () => {
    const result = await processIncomingSmsMessages(
      [
        {
          id: "1",
          address: "VK-HDFCBK",
          body: "INR 100 debited",
          receivedAtMs: Date.now(),
        },
      ],
      { blockImport: true }
    );
    expect(result.reason).toBe("disabled");
    expect(result.accepted).toBe(false);
  });
});
