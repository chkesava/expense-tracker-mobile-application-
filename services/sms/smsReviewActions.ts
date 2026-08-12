import type {
  SmsParsedTransaction,
  SmsReviewInboxItem,
  SmsWritePayload,
} from "@/shared/types/smsTransaction";
import { findReviewInboxItem, toReviewInboxItem } from "./smsReviewInbox";
import {
  dismissSmsReviewItem,
  enqueueSmsReviewItems,
  loadSmsReviewInbox,
} from "./smsReviewInboxStore";

export type SmsCommitResult = {
  collection: "expenses" | "incomes";
  id: string;
};

export type SmsExpenseWriter = (
  uid: string,
  write: SmsWritePayload
) => Promise<SmsCommitResult>;

export function writeReadyToInboxItems(
  writeReady: Array<{
    record: {
      smsId: string;
      fingerprint: string;
      parsed?: SmsParsedTransaction;
    };
    write: SmsWritePayload;
  }>
): SmsReviewInboxItem[] {
  const items: SmsReviewInboxItem[] = [];
  for (const entry of writeReady) {
    if (!entry.record.parsed) continue;
    items.push(
      toReviewInboxItem({
        smsId: entry.record.smsId,
        fingerprint: entry.record.fingerprint,
        parsed: entry.record.parsed,
        write: entry.write,
      })
    );
  }
  return items;
}

export async function enqueueWriteReadyForReview(
  writeReady: Array<{
    record: {
      smsId: string;
      fingerprint: string;
      parsed?: SmsParsedTransaction;
    };
    write: SmsWritePayload;
  }>
): Promise<number> {
  const items = writeReadyToInboxItems(writeReady);
  if (!items.length) return 0;
  const { added } = await enqueueSmsReviewItems(items);
  return added;
}

/** Ignore: drop from inbox. Dedupe keys stay so it will not reappear. */
export async function ignoreSmsReviewItem(id: string): Promise<void> {
  await dismissSmsReviewItem(id);
}

/** Add: write ExpenseForm-shaped doc, then drop from inbox. */
export async function addSmsReviewItem(
  id: string,
  uid: string,
  writer?: SmsExpenseWriter
): Promise<SmsCommitResult> {
  const items = await loadSmsReviewInbox();
  const item = findReviewInboxItem(items, id);
  if (!item) {
    throw new Error("Transaction is no longer in the inbox");
  }
  const commit =
    writer ?? (await import("./smsExpenseWriter")).commitSmsWritePayload;
  const result = await commit(uid, item.write);
  await dismissSmsReviewItem(id);
  if (result.collection === "expenses") {
    void import("./smsRecurringSync")
      .then((m) =>
        m.syncRecurringAfterSmsCommit(uid, [
          {
            record: {
              smsId: item.smsId,
              fingerprint: item.fingerprint,
              parsed: item.parsed,
            },
            write: item.write,
          },
        ])
      )
      .catch(() => undefined);
  }
  return result;
}
