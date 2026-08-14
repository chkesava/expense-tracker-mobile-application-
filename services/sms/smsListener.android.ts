import type { EventSubscription } from "expo-modules-core";

import SmsReader from "@/modules/sms-reader";
import type { RawSmsMessage } from "@/shared/types/smsTransaction";
import { toSmsLocalMetadata } from "./smsLocalMetadata";
import type { SmsInboundListener } from "./smsListener";

function toRaw(row: Parameters<typeof toSmsLocalMetadata>[0] & { read?: boolean }): RawSmsMessage {
  const meta = toSmsLocalMetadata(row);
  return {
    id: meta.smsId,
    address: meta.sender,
    body: meta.body,
    receivedAtMs: meta.timestamp,
    read: Boolean(row.read),
  };
}

export async function startSmsListening(): Promise<boolean> {
  try {
    return await SmsReader.startListening();
  } catch {
    return false;
  }
}

export async function stopSmsListening(): Promise<boolean> {
  try {
    return await SmsReader.stopListening();
  } catch {
    return false;
  }
}

export async function isSmsListening(): Promise<boolean> {
  try {
    return await SmsReader.isListening();
  } catch {
    return false;
  }
}

/**
 * Subscribe to runtime BroadcastReceiver events.
 * Messages stay on-device — never upload raw SMS from this path.
 */
export function addSmsReceivedListener(
  listener: SmsInboundListener
): EventSubscription {
  return SmsReader.addListener("onSmsReceived", (event) => {
    const rows = event?.messages ?? [];
    listener(rows.map(toRaw));
  });
}
