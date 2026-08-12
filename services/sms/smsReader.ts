import type { RawSmsMessage, SmsSyncCursor } from "@/shared/types/smsTransaction";

export type SmsReaderCapability =
  | { supported: false; reason: "ios" | "web" | "unavailable" }
  | { supported: true; platform: "android" };

export type SmsReadOptions = {
  cursor?: SmsSyncCursor;
  limit?: number;
  relevantOnly?: boolean;
  minReceivedAtMs?: number;
};

export interface SmsReader {
  getCapability(): SmsReaderCapability;
  hasPermission(): Promise<boolean>;
  requestPermission(): Promise<boolean>;
  readMessages(options?: SmsReadOptions): Promise<RawSmsMessage[]>;
}

export const stubSmsReader: SmsReader = {
  getCapability() {
    return { supported: false, reason: "web" };
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

export const androidSmsReader: SmsReader = stubSmsReader;
export const defaultSmsReader: SmsReader = stubSmsReader;
