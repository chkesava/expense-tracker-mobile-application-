/**
 * Transaction processor for newly received SMS.
 * Phase 3: filter → pipeline → local status only (no Firebase expense writes yet).
 */

import type { RawSmsMessage } from "@/shared/types/smsTransaction";
import { loadSmsAutomationPrefs } from "./smsAutomationPrefs";
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

  const relevant = filterRelevantSms(messages);
  const latest = messages[0];

  if (!relevant.length) {
    await patchSmsInboundStatus({
      lastReceivedAtMs: latest?.receivedAtMs,
      lastSender: latest?.address,
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
    };
  }

  const pipeline = processRawSmsMessages(relevant);
  const skippedCount = pipeline.records.filter((r) => r.status === "skipped")
    .length;
  const writeReadyCount = pipeline.writeReady.length;
  const head = relevant[0];
  const current = await loadSmsInboundStatus();

  await patchSmsInboundStatus({
    lastReceivedAtMs: head.receivedAtMs,
    lastSender: head.address,
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
  };
}
