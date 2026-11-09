import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SPENDLY-738 guard (epic SPENDLY-735). Local bill reminders are re-planned
 * only when their inputs change, and planning writes nothing to Firestore.
 * Before: every app focus re-planned every bill, and with no notification
 * permission (always, on web) wrote one creditCardBillReminderLogs doc per
 * eligible bill. The provider imports React Native, so this pins its source.
 */
const provider = readFileSync(path.resolve(__dirname, "..", "providers/CreditCardBillsProvider.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("bill reminders: no Firestore writes from planning, re-plan only on change (SPENDLY-738)", () => {
  it("the provider writes no reminder logs", () => {
    expect(provider).not.toContain("creditCardBillReminderLogs");
    expect(provider).not.toContain("writeReminderLog");
  });

  it("a pass is skipped when the plan key is unchanged, unless forced", () => {
    expect(provider).toContain("const plan = billReminderPlanKey({");
    expect(provider).toContain("if (!opts.force && plan === appliedReminderPlan.current) return;");
  });

  it("the context's refresh always runs (a caller asking gets a pass)", () => {
    expect(provider).toContain("refreshReminderSchedules: forceRefreshReminderSchedules,");
  });
});
