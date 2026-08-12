import { describe, expect, it, beforeEach } from "vitest";

import { processRawSmsMessages } from "@/services/sms/smsPipeline";
import {
  addSmsReviewItem,
  enqueueWriteReadyForReview,
  ignoreSmsReviewItem,
  writeReadyToInboxItems,
} from "@/services/sms/smsReviewActions";
import {
  briefSmsCategoryLabel,
  formatDetectedCount,
  mergeReviewInboxItems,
  reviewItemMerchant,
  toReviewInboxItem,
} from "@/services/sms/smsReviewInbox";
import { resetSmsReviewInboxForTests } from "@/services/sms/smsReviewInboxStore";
import type { RawSmsMessage } from "@/shared/types/smsTransaction";

const swiggy: RawSmsMessage = {
  id: "1",
  address: "VK-SBIINB",
  body:
    "Your A/c XX4521 has been debited for Rs.450 on 12-08-2026 towards Swiggy via UPI. Ref No 987654321012. -SBI",
  receivedAtMs: Date.parse("2026-08-12T10:00:00+05:30"),
};

const amazon: RawSmsMessage = {
  id: "2",
  address: "VK-SBIINB",
  body:
    "Your A/c XX4521 has been debited for Rs.1299 on 12-08-2026 towards Amazon via UPI. Ref No 111222333444. -SBI",
  receivedAtMs: Date.parse("2026-08-12T11:00:00+05:30"),
};

describe("review inbox helpers", () => {
  it("formats the detected count", () => {
    expect(formatDetectedCount(0)).toBe("0 transactions detected");
    expect(formatDetectedCount(1)).toBe("1 transaction detected");
    expect(formatDetectedCount(3)).toBe("3 transactions detected");
  });

  it("shows amount merchant and brief category for Swiggy / Amazon", () => {
    const result = processRawSmsMessages([swiggy, amazon]);
    const items = writeReadyToInboxItems(result.writeReady);
    expect(items).toHaveLength(2);
    expect(items[0]?.write.payload.amount).toBe(450);
    expect(reviewItemMerchant(items[0]!)).toBe("Swiggy");
    expect(briefSmsCategoryLabel(items[0]!)).toBe("Food");
    expect(items[1]?.write.payload.amount).toBe(1299);
    expect(reviewItemMerchant(items[1]!)).toBe("Amazon");
    expect(briefSmsCategoryLabel(items[1]!)).toBe("Shopping");
  });

  it("does not enqueue the same id twice", () => {
    const item = toReviewInboxItem({
      smsId: "1",
      fingerprint: "fp",
      parsed: { kind: "expense", confidence: 0.9, merchant: "Swiggy" },
      write: {
        collection: "expenses",
        payload: {
          amount: 450,
          category: "Food & Dining",
          subcategory: "Food Delivery",
          date: "2026-08-12",
          month: "2026-08",
          accountId: null,
          note: "Swiggy",
          tags: ["sms"],
        },
      },
    });
    const first = mergeReviewInboxItems([], [item]);
    const second = mergeReviewInboxItems(first.items, [item]);
    expect(first.added).toBe(1);
    expect(second.added).toBe(0);
    expect(second.items).toHaveLength(1);
  });
});

describe("review inbox Add / Ignore", () => {
  beforeEach(() => {
    resetSmsReviewInboxForTests();
  });

  it("Ignore removes the row without writing", async () => {
    const result = processRawSmsMessages([swiggy]);
    const added = await enqueueWriteReadyForReview(result.writeReady);
    expect(added).toBe(1);
    const { loadSmsReviewInbox } = await import(
      "@/services/sms/smsReviewInboxStore"
    );
    const queued = await loadSmsReviewInbox();
    expect(queued[0]?.id).toBeTruthy();
    await ignoreSmsReviewItem(queued[0]!.id);
    expect(await loadSmsReviewInbox()).toHaveLength(0);
  });

  it("Add writes then removes the row", async () => {
    const result = processRawSmsMessages([swiggy]);
    await enqueueWriteReadyForReview(result.writeReady);
    const { loadSmsReviewInbox } = await import(
      "@/services/sms/smsReviewInboxStore"
    );
    const queued = await loadSmsReviewInbox();
    const writes: unknown[] = [];
    await addSmsReviewItem(queued[0]!.id, "user-1", async (_uid, write) => {
      writes.push(write);
      return { collection: write.collection, id: "doc-1" };
    });
    expect(writes).toHaveLength(1);
    expect(await loadSmsReviewInbox()).toHaveLength(0);
  });
});
