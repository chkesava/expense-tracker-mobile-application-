/**
 * Local-only inbound SMS processing status (never uploaded as raw SMS).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

export type SmsInboundStatus = {
  listeningRequested: boolean;
  lastReceivedAtMs?: number;
  lastSender?: string;
  /** Phase 4: last detected class (expense/income/…). */
  lastDetectionKind?: string;
  lastRelevantCount: number;
  lastSkippedCount: number;
  lastWriteReadyCount: number;
  lastDuplicateCount: number;
  lastAutoAddedCount: number;
  lastInboxQueuedCount: number;
  totalInboundEvents: number;
};

const STORAGE_KEY = "vault_sms_inbound_status_v1";

export const SMS_INBOUND_STATUS_DEFAULTS: SmsInboundStatus = {
  listeningRequested: false,
  lastRelevantCount: 0,
  lastSkippedCount: 0,
  lastWriteReadyCount: 0,
  lastDuplicateCount: 0,
  lastAutoAddedCount: 0,
  lastInboxQueuedCount: 0,
  totalInboundEvents: 0,
};

export async function loadSmsInboundStatus(): Promise<SmsInboundStatus> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...SMS_INBOUND_STATUS_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<SmsInboundStatus>;
    return {
      ...SMS_INBOUND_STATUS_DEFAULTS,
      ...parsed,
    };
  } catch {
    return { ...SMS_INBOUND_STATUS_DEFAULTS };
  }
}

export async function saveSmsInboundStatus(
  status: SmsInboundStatus
): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(status));
}

export async function patchSmsInboundStatus(
  patch: Partial<SmsInboundStatus>
): Promise<SmsInboundStatus> {
  const current = await loadSmsInboundStatus();
  const next = { ...current, ...patch };
  await saveSmsInboundStatus(next);
  return next;
}
