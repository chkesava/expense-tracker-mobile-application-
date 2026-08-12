import type { EventSubscription } from "expo-modules-core";

import type { RawSmsMessage } from "@/shared/types/smsTransaction";

export type SmsInboundListener = (messages: RawSmsMessage[]) => void;

/** Default / non-Android stubs. */
export async function startSmsListening(): Promise<boolean> {
  return false;
}

export async function stopSmsListening(): Promise<boolean> {
  return false;
}

export async function isSmsListening(): Promise<boolean> {
  return false;
}

export function addSmsReceivedListener(
  _listener: SmsInboundListener
): EventSubscription {
  return { remove() {} };
}
