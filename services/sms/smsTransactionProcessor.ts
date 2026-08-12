/**
 * Transaction processor for newly received SMS.
 * Parks drafts in the Transaction Inbox (or auto-commits when Auto Add is on).
 */

import type { RawSmsMessage } from "@/shared/types/smsTransaction";
import { loadSmsAutomationPrefs } from "./smsAutomationPrefs";
import { detectSmsTransaction } from "./smsDetector";
import {
  loadSmsDedupeKeys,
  mergeSmsDedupeKeys,
} from "./smsDedupeStore";
import {
  loadSmsInboundStatus,
  patchSmsInboundStatus,
} from "./smsInboundStatus";
import { processRawSmsMessages } from "./smsPipeline";
import { filterRelevantSms } from "./smsRelevanceFilter";
import { enqueueWriteReadyForReview } from "./smsReviewActions";

export type ProcessIncomingSmsResult = {
  accepted: boolean;
  reason?: "disabled" | "empty" | "not_relevant" | "processed";
  relevantCount: number;
  skippedCount: number;
  writeReadyCount: number;
  duplicateCount?: number;
  inboxQueuedCount?: number;
  /** Detection kind of the first message in the batch (debug / Settings). */
  lastDetectionKind?: string;
};

/**
 * Handle a batch from the BroadcastReceiver.
 * Parks write-ready drafts in the Transaction Inbox (or auto-commits when Auto Add is on).
 */
export async function processIncomingSmsMessages(
  messages: RawSmsMessage[],
  options: { blockImport?: boolean; uid?: string } = {}
): Promise<ProcessIncomingSmsResult> {
  if (!messages.length) {
    return {
      accepted: false,
      reason: "empty",
      relevantCount: 0,
      skippedCount: 0,
      writeReadyCount: 0,
    };
  }

  if (options.blockImport) {
    return {
      accepted: false,
      reason: "disabled",
      relevantCount: 0,
      skippedCount: 0,
      writeReadyCount: 0,
    };
  }

  const prefs = await loadSmsAutomationPrefs();
  if (!prefs.enabled) {
    return {
      accepted: false,
      reason: "disabled",
      relevantCount: 0,
      skippedCount: 0,
      writeReadyCount: 0,
    };
  }

  const latest = messages[0];
  const firstDetection = detectSmsTransaction(latest);
  const relevant = filterRelevantSms(messages);

  if (!relevant.length) {
    await patchSmsInboundStatus({
      lastReceivedAtMs: latest?.receivedAtMs,
      lastSender: latest?.address,
      lastDetectionKind: firstDetection.kind,
      lastRelevantCount: 0,
      lastSkippedCount: messages.length,
      lastWriteReadyCount: 0,
      lastDuplicateCount: 0,
    });
    return {
      accepted: false,
      reason: "not_relevant",
      relevantCount: 0,
      skippedCount: messages.length,
      writeReadyCount: 0,
      lastDetectionKind: firstDetection.kind,
    };
  }

  // Classify full batch; skip duplicates via persisted ref/txn keys.
  const known = await loadSmsDedupeKeys();
  const pipeline = processRawSmsMessages(messages, {
    knownDedupeKeys: known,
  });
  const skippedCount = pipeline.records.filter((r) => r.status === "skipped")
    .length;
  const duplicateCount = pipeline.records.filter(
    (r) => r.skipReason === "duplicate"
  ).length;
  const writeReadyCount = pipeline.writeReady.length;
  await mergeSmsDedupeKeys(known);

  let inboxQueuedCount = 0;
  const autoCommit =
    prefs.autoAdd && !prefs.reviewBeforeAdding && Boolean(options.uid);
  if (autoCommit && options.uid) {
    const { commitSmsWritePayload } = await import("./smsExpenseWriter");
    const failed: typeof pipeline.writeReady = [];
    for (const entry of pipeline.writeReady) {
      try {
        await commitSmsWritePayload(options.uid, entry.write);
      } catch {
        failed.push(entry);
      }
    }
    inboxQueuedCount = await enqueueWriteReadyForReview(failed);
  } else {
    inboxQueuedCount = await enqueueWriteReadyForReview(pipeline.writeReady);
  }

  const head = relevant[0];
  const headKind = detectSmsTransaction(head).kind;
  const current = await loadSmsInboundStatus();

  await patchSmsInboundStatus({
    lastReceivedAtMs: head.receivedAtMs,
    lastSender: head.address,
    lastDetectionKind: headKind,
    lastRelevantCount: relevant.length,
    lastSkippedCount: skippedCount,
    lastWriteReadyCount: writeReadyCount,
    lastDuplicateCount: duplicateCount,
    totalInboundEvents: (current.totalInboundEvents || 0) + 1,
  });

  return {
    accepted: true,
    reason: "processed",
    relevantCount: relevant.length,
    skippedCount,
    writeReadyCount,
    duplicateCount,
    inboxQueuedCount,
    lastDetectionKind: headKind,
  };
}
