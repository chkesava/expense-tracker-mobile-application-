import { Platform } from "react-native";

import type { RawSmsMessage, SmsSyncCursor } from "@/shared/types/smsTransaction";
import {
  checkSmsPermission,
  getSmsPermissionPlatformStatus,
  requestSmsPermission,
} from "./smsPermissions";

export type SmsReaderCapability =
  | { supported: false; reason: "ios" | "web" | "unavailable" }
  | { supported: true; platform: "android" };

/**
 * Platform boundary for SMS access.
 * Phase 1: permission check/request live; inbox read stays empty until a later phase.
 */
export interface SmsReader {
  getCapability(): SmsReaderCapability;
  hasPermission(): Promise<boolean>;
  requestPermission(): Promise<boolean>;
  /**
   * Phase 1: always returns [] (no parsing / inbox access yet).
   */
  readMessages(options?: {
    cursor?: SmsSyncCursor;
    limit?: number;
  }): Promise<RawSmsMessage[]>;
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

/** Android reader: PermissionsAndroid only; no ContentResolver inbox queries yet. */
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
  async readMessages() {
    return [];
  },
};

export const defaultSmsReader: SmsReader =
  Platform.OS === "android" ? androidSmsReader : stubSmsReader;
