import type { EventSubscription } from "expo-modules-core";

import SmsReader from "@/modules/sms-reader";
import type { RawSmsMessage } from "@/shared/types/smsTransaction";
import type { SmsInboundListener } from "./smsListener";

function toRaw(row: {
  id: string;
  address: string;
  body: string;
  receivedAtMs: number;
  read?: boolean;
}): RawSmsMessage {
  return {
    id: String(row.id),
    address: row.address ?? "",
    body: row.body ?? "",
    receivedAtMs: Number(row.receivedAtMs) || Date.now(),
    read: Boolean(row.read),
  };
}

export async function startSmsListening(): Promise<boolean> {
  return SmsReader.startListening();
}

export async function stopSmsListening(): Promise<boolean> {
  return SmsReader.stopListening();
}

export async function isSmsListening(): Promise<boolean> {
  return SmsReader.isListening();
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
