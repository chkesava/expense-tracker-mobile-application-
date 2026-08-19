/**
 * Phase 13 — notification title/body builders (pure; no expo-notifications).
 */

import type { SmsWriteReadyEntry } from "./smsAutoAdd";
import {
  formatRecurringCadence,
  type RecurringPattern,
} from "./smsRecurringDetector";
import { formatAmount } from "@/shared/utils/formatCurrency";

export type SmsNotificationKind = "detected" | "auto_added" | "recurring";

export type SmsNotificationCopy = {
  title: string;
  body: string;
  data: {
    source: "sms";
    kind: SmsNotificationKind;
    url: string;
  };
  /**
   * Stable per-transaction id, passed through as the OS notification
   * identifier. Re-presenting the same entry (e.g. a retry, or the
   * BroadcastReceiver redelivering the same SMS) replaces the existing
   * notification instead of stacking a duplicate.
   */
  identifier: string;
};

function rupee(amount: number): string {
  return formatAmount(amount, "INR");
}

function expenseMerchant(entry: SmsWriteReadyEntry): string {
  const name = entry.record.parsed?.merchant?.trim();
  return name || "Unknown";
}

function incomeSource(entry: SmsWriteReadyEntry): string {
  if (entry.write.collection === "incomes") {
    return entry.write.payload.source || entry.record.parsed?.incomeSource || "Income";
  }
  return "Income";
}

function categoryLine(entry: SmsWriteReadyEntry): string {
  if (entry.write.collection === "incomes") {
    return incomeSource(entry);
  }
  if (entry.write.collection === "expenses") {
    return (
      entry.write.payload.category ||
      entry.record.parsed?.category ||
      "Other"
    );
  }
  return "Other";
}

/** Review / detect: amount • merchant, then full category (Food & Dining). */
export function buildDetectedNotification(
  entry: SmsWriteReadyEntry
): SmsNotificationCopy {
  const amount = rupee(entry.write.payload.amount);
  const party =
    entry.write.collection === "incomes" ? "Income" : expenseMerchant(entry);
  return {
    title: "💰 Transaction detected",
    body: `${amount} • ${party}\n${categoryLine(entry)}`,
    data: {
      source: "sms",
      kind: "detected",
      url: "/sms-inbox",
    },
    identifier: `sms-detected:${entry.record.smsId || entry.record.fingerprint}`,
  };
}

/** Auto-add confirmation: ✅ ₹450 Swiggy expense added */
export function buildAutoAddedNotification(
  entry: SmsWriteReadyEntry
): SmsNotificationCopy {
  const amount = rupee(entry.write.payload.amount);
  const party =
    entry.write.collection === "incomes"
      ? incomeSource(entry)
      : expenseMerchant(entry);
  const kindWord =
    entry.write.collection === "incomes" ? "income" : "expense";
  return {
    title: `✅ ${amount} ${party} ${kindWord} added`,
    body: categoryLine(entry),
    data: {
      source: "sms",
      kind: "auto_added",
      url: "/dashboard",
    },
    identifier: `sms-auto-added:${entry.record.smsId || entry.record.fingerprint}`,
  };
}

/** Recurring pattern: 🔄 Recurring payment to review / Netflix · ₹649 / month */
export function buildRecurringDetectedNotification(
  pattern: RecurringPattern
): SmsNotificationCopy {
  const amount = rupee(pattern.amount);
  const cadence = formatRecurringCadence(pattern);
  return {
    title: "🔄 Recurring payment to review",
    body: `${pattern.merchant} · ${amount} / ${cadence}`,
    data: {
      source: "sms",
      kind: "recurring",
      url: "/ledger?tab=subscriptions",
    },
    identifier: `sms-recurring:${pattern.key}`,
  };
}
