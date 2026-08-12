/**
 * Transaction processor for newly received SMS.
 * Phase 4: detect class for every message → pipeline (no Firebase writes yet).
 */

import type { RawSmsMessage } from "@/shared/types/smsTransaction";
import { loadSmsAutomationPrefs } from "./smsAutomationPrefs";
import { detectSmsTransaction } from "./smsDetector";
import {
  loadSmsInboundStatus,
  patchSmsInboundStatus,
} from "./smsInboundStatus";
import { processRawSmsMessages } from "./smsPipeline";
import { filterRelevantSms } from "./smsRelevanceFilter";

export type ProcessIncomingSmsResult = {
  accepted: boolean;
  reason?: "disabled" | "empty" | "not_relevant" | "processed";
  relevantCount: number;
  skippedCount: number;
  writeReadyCount: number;
  /** Detection kind of the first message in the batch (debug / Settings). */
  lastDetectionKind?: string;
};

/**
 * Handle a batch from the BroadcastReceiver.
 * Does not upload raw SMS or create Firestore expenses in this phase.
 */
export async function processIncomingSmsMessages(
  messages: RawSmsMessage[],
  options: { blockImport?: boolean } = {}
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

  // Classify full batch (including non-relevant) for accurate skip reasons,
  // but adapt only money-movement candidates via pipeline.
  const pipeline = processRawSmsMessages(messages);
  const skippedCount = pipeline.records.filter((r) => r.status === "skipped")
    .length;
  const writeReadyCount = pipeline.writeReady.length;
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
    totalInboundEvents: (current.totalInboundEvents || 0) + 1,
  });

  return {
    accepted: true,
    reason: "processed",
    relevantCount: relevant.length,
    skippedCount,
    writeReadyCount,
    lastDetectionKind: headKind,
  };
}
