/**
 * Phase 10 — route write-ready SMS drafts by handling mode + confidence.
 * High-confidence auto-add; low-confidence → Review Inbox.
 */

import type { SmsParsedTransaction, SmsWritePayload } from "@/shared/types/smsTransaction";
import type { SmsHandlingMode } from "./smsAutomationPrefs";
import { SMS_AUTO_COMMIT_CONFIDENCE } from "./smsParser";
import type { SmsExpenseWriter } from "./smsReviewActions";
import { enqueueWriteReadyForReview } from "./smsReviewActions";

export type SmsWriteReadyEntry = {
  record: {
    smsId: string;
    fingerprint: string;
    parsed?: SmsParsedTransaction;
  };
  write: SmsWritePayload;
};

export function isHighConfidenceForAutoAdd(
  parsed?: SmsParsedTransaction,
  threshold = SMS_AUTO_COMMIT_CONFIDENCE
): boolean {
  if (!parsed) return false;
  if (parsed.confidence < threshold) return false;
  if (parsed.amount == null || !parsed.date) return false;
  if (!parsed.merchant?.trim()) return false;
  return true;
}

export function routeWriteReady(
  writeReady: SmsWriteReadyEntry[],
  mode: SmsHandlingMode
): { toCommit: SmsWriteReadyEntry[]; toReview: SmsWriteReadyEntry[] } {
  if (mode === "manual") {
    return { toCommit: [], toReview: [] };
  }
  if (mode === "review") {
    return { toCommit: [], toReview: writeReady };
  }
  const toCommit: SmsWriteReadyEntry[] = [];
  const toReview: SmsWriteReadyEntry[] = [];
  for (const entry of writeReady) {
    if (isHighConfidenceForAutoAdd(entry.record.parsed)) {
      toCommit.push(entry);
    } else {
      toReview.push(entry);
    }
  }
  return { toCommit, toReview };
}

export async function dispatchWriteReady(
  writeReady: SmsWriteReadyEntry[],
  options: {
    mode: SmsHandlingMode;
    uid?: string;
    writer?: SmsExpenseWriter;
  }
): Promise<{ committed: number; queued: number }> {
  const routed = routeWriteReady(writeReady, options.mode);
  let toReview = routed.toReview;
  let committed = 0;

  if (routed.toCommit.length) {
    if (!options.uid) {
      toReview = [...toReview, ...routed.toCommit];
    } else {
      const commit =
        options.writer ??
        (await import("./smsExpenseWriter")).commitSmsWritePayload;
      const failed: SmsWriteReadyEntry[] = [];
      for (const entry of routed.toCommit) {
        try {
          await commit(options.uid, entry.write);
          committed += 1;
        } catch {
          failed.push(entry);
        }
      }
      toReview = [...toReview, ...failed];
    }
  }

  const queued = await enqueueWriteReadyForReview(toReview);
  return { committed, queued };
}
