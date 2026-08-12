import type { RawSmsMessage } from "@/shared/types/smsTransaction";
import {
  detectSmsTransaction,
  isMoneyMovementKind,
} from "./smsDetector";

/**
 * Heuristic filter for bank / UPI / card transaction SMS.
 * Phase 4: uses detector — keeps expense / income / transfer only.
 */

/** True when SMS looks like a money movement (not OTP/promo/noise). */
export function isRelevantTransactionSms(message: RawSmsMessage): boolean {
  const body = (message.body || "").trim();
  if (!body) return false;
  const detection = detectSmsTransaction(message);
  return isMoneyMovementKind(detection.kind);
}

export function filterRelevantSms(messages: RawSmsMessage[]): RawSmsMessage[] {
  return messages.filter(isRelevantTransactionSms);
}
