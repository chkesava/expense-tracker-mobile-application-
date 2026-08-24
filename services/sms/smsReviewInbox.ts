import type {
  SmsParsedTransaction,
  SmsReviewInboxItem,
  SmsWritePayload,
} from "@/shared/types/smsTransaction";

export const SMS_REVIEW_INBOX_MAX = 200;

export function reviewInboxItemId(
  smsId: string,
  fingerprint: string
): string {
  return smsId || fingerprint;
}

export function toReviewInboxItem(input: {
  smsId: string;
  fingerprint: string;
  parsed: SmsParsedTransaction;
  write: SmsWritePayload;
  queuedAtMs?: number;
}): SmsReviewInboxItem {
  return {
    id: reviewInboxItemId(input.smsId, input.fingerprint),
    smsId: input.smsId,
    fingerprint: input.fingerprint,
    parsed: input.parsed,
    write: input.write,
    queuedAtMs: input.queuedAtMs ?? Date.now(),
  };
}

/** Keep existing rows; append new ids; cap at newest MAX. */
export function mergeReviewInboxItems(
  existing: SmsReviewInboxItem[],
  incoming: SmsReviewInboxItem[]
): { items: SmsReviewInboxItem[]; added: number } {
  const seen = new Set(existing.map((item) => item.id));
  const next = [...existing];
  let added = 0;
  for (const item of incoming) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    next.push(item);
    added += 1;
  }
  const trimmed =
    next.length > SMS_REVIEW_INBOX_MAX
      ? next.slice(next.length - SMS_REVIEW_INBOX_MAX)
      : next;
  return { items: trimmed, added };
}

export function removeReviewInboxItem(
  items: SmsReviewInboxItem[],
  id: string
): SmsReviewInboxItem[] {
  return items.filter((item) => item.id !== id);
}

export function findReviewInboxItem(
  items: SmsReviewInboxItem[],
  id: string
): SmsReviewInboxItem | undefined {
  return items.find((item) => item.id === id);
}

/** Mock-style line: parent category name; income shows Salary / Refund / …. */
export function briefSmsCategoryLabel(item: SmsReviewInboxItem): string {
  if (item.write.collection === "incomes") {
    return item.write.payload.source || item.parsed.incomeSource || "Income";
  }
  const category =
    item.parsed.category ||
    (item.write.collection === "expenses" ? item.write.payload.category : "") ||
    "Other";
  const brief = category.split(/[&/]/)[0]?.trim();
  return brief || category;
}

export function reviewItemMerchant(item: SmsReviewInboxItem): string {
  if (item.write.collection === "incomes") return "Income";
  if (item.parsed.merchant?.trim()) return item.parsed.merchant.trim();
  return "Unknown";
}

export function reviewItemAmount(item: SmsReviewInboxItem): number {
  return item.write.payload.amount;
}

export function formatDetectedCount(count: number): string {
  if (count === 1) return "1 transaction detected";
  return `${count} transactions detected`;
}
