import { Platform } from "react-native";

import type { RawSmsMessage, SmsSyncCursor } from "@/shared/types/smsTransaction";
import { readNativeInbox } from "./nativeInbox";
import {
  checkSmsPermission,
  getSmsPermissionPlatformStatus,
  requestSmsPermission,
} from "./smsPermissions";
import { filterRelevantSms } from "./smsRelevanceFilter";

export type SmsReaderCapability =
  | { supported: false; reason: "ios" | "web" | "unavailable" }
  | { supported: true; platform: "android" };

export type SmsReadOptions = {
  cursor?: SmsSyncCursor;
  limit?: number;
  /** When true (default), keep only bank/UPI-like messages. */
  relevantOnly?: boolean;
  minReceivedAtMs?: number;
};

/**
 * Platform boundary for SMS access.
 * Phase 2: permission + local inbox read via native module.
 */
export interface SmsReader {
  getCapability(): SmsReaderCapability;
  hasPermission(): Promise<boolean>;
  requestPermission(): Promise<boolean>;
  readMessages(options?: SmsReadOptions): Promise<RawSmsMessage[]>;
}

function unsupportedReason(): "ios" | "web" | "unavailable" {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "web") return "web";
  return "unavailable";
}

export const stubSmsReader: SmsReader = {
  getCapability() {
    return { supported: false, reason: unsupportedReason() };
  },
  async hasPermission() {
    return false;
  },
  async requestPermission() {
    return false;
  },
  async readMessages() {
    return [];
  },
};

export const androidSmsReader: SmsReader = {
  getCapability() {
    if (getSmsPermissionPlatformStatus() === "unavailable") {
      return { supported: false, reason: unsupportedReason() };
    }
    return { supported: true, platform: "android" };
  },
  async hasPermission() {
    const status = await checkSmsPermission();
    return status === "granted";
  },
  async requestPermission() {
    const status = await requestSmsPermission();
    return status === "granted";
  },
  async readMessages(options = {}) {
    const granted = await this.hasPermission();
    if (!granted) {
      return [];
    }

    const messages = await readNativeInbox({
      limit: options.limit,
      cursor: options.cursor,
      minReceivedAtMs: options.minReceivedAtMs,
    });

    if (options.relevantOnly === false) {
      return messages;
    }
    return filterRelevantSms(messages);
  },
};

export const defaultSmsReader: SmsReader =
  Platform.OS === "android" ? androidSmsReader : stubSmsReader;
