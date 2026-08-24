import { describe, expect, it } from "vitest";

import {
  buildAutoAddedNotification,
  buildDetectedNotification,
  buildRecurringDetectedNotification,
} from "@/services/sms/smsNotificationCopy";
import { processRawSmsMessages } from "@/services/sms/smsPipeline";
import type { RawSmsMessage } from "@/shared/types/smsTransaction";

const swiggy: RawSmsMessage = {
  id: "1",
  address: "VK-SBIINB",
  body:
    "Your A/c XX4521 has been debited for Rs.450 on 12-08-2026 towards Swiggy via UPI. Ref No 987654321012. -SBI",
  receivedAtMs: Date.parse("2026-08-12T10:00:00+05:30"),
};

const salary: RawSmsMessage = {
  id: "2",
  address: "VK-SBIINB",
  body: "₹35,000 credited to your account",
  receivedAtMs: Date.parse("2026-08-12T10:00:00+05:30"),
};

describe("SMS notification copy", () => {
  it("formats a detected Swiggy expense", () => {
    const entry = processRawSmsMessages([swiggy]).writeReady[0];
    expect(entry).toBeDefined();
    const copy = buildDetectedNotification(entry!);
    expect(copy.title).toBe("💰 Transaction detected");
    expect(copy.body).toBe("₹450 • Swiggy\nFood");
    expect(copy.data).toEqual({
      source: "sms",
      kind: "detected",
      url: "/sms-inbox",
    });
  });

  it("formats an auto-added Swiggy expense", () => {
    const entry = processRawSmsMessages([swiggy]).writeReady[0];
    const copy = buildAutoAddedNotification(entry!);
    expect(copy.title).toBe("✅ ₹450 Swiggy expense added");
    expect(copy.body).toBe("Food");
    expect(copy.data.kind).toBe("auto_added");
    expect(copy.data.url).toBe("/dashboard");
  });

  it("gives detected and auto-added notifications a stable, distinct identifier from the SMS id", () => {
    const entry = processRawSmsMessages([swiggy]).writeReady[0]!;
    const detected = buildDetectedNotification(entry);
    const autoAdded = buildAutoAddedNotification(entry);
    // Re-presenting the same entry must resolve to the same identifier
    // (so the OS replaces rather than duplicates), and the two notification
    // kinds must not collide with each other.
    expect(detected.identifier).toBe(buildDetectedNotification(entry).identifier);
    expect(detected.identifier).toContain(entry.record.smsId);
    expect(detected.identifier).not.toBe(autoAdded.identifier);
  });

  it("formats a detected salary credit", () => {
    const entry = processRawSmsMessages([salary]).writeReady[0];
    expect(entry?.write.collection).toBe("incomes");
    const copy = buildDetectedNotification(entry!);
    expect(copy.title).toBe("💰 Transaction detected");
    expect(copy.body).toBe("₹35,000 • Income\nSalary");
  });

  it("formats an auto-added salary credit", () => {
    const entry = processRawSmsMessages([salary]).writeReady[0];
    const copy = buildAutoAddedNotification(entry!);
    expect(copy.title).toBe("✅ ₹35,000 Salary income added");
    expect(copy.body).toBe("Salary");
  });

  it("formats a recurring Netflix detection", () => {
    const copy = buildRecurringDetectedNotification({
      merchant: "Netflix",
      amount: 649,
      category: "Entertainment",
      occurrences: 4,
      dates: ["2026-05-12", "2026-06-12", "2026-07-12", "2026-08-12"],
      dayOfMonth: 12,
      frequency: "monthly",
      key: "netflix|649.00",
    });
    expect(copy.title).toBe("🔄 Recurring payment to review");
    expect(copy.body).toBe("Netflix · ₹649 / month");
    expect(copy.data.url).toBe("/ledger?tab=subscriptions");
  });

  it("formats an every-N-days chicken detection", () => {
    const copy = buildRecurringDetectedNotification({
      merchant: "Chicken",
      amount: 200,
      category: "Food",
      occurrences: 8,
      dates: ["2026-08-01", "2026-08-03", "2026-08-05"],
      dayOfMonth: 3,
      frequency: "every_n_days",
      intervalDays: 2,
      key: "chicken|200.00",
    });
    expect(copy.title).toBe("🔄 Recurring payment to review");
    expect(copy.body).toBe("Chicken · ₹200 / every 2 days");
  });
});
