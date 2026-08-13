import SmsReader from "@/modules/sms-reader";
import type { RawSmsMessage } from "@/shared/types/smsTransaction";
import { toSmsLocalMetadata } from "./smsLocalMetadata";
import type { NativeInboxQuery } from "./nativeInbox";

function toRawSms(row: Parameters<typeof toSmsLocalMetadata>[0] & { read?: boolean }): RawSmsMessage {
  const meta = toSmsLocalMetadata(row);
  return {
    id: meta.smsId,
    address: meta.sender,
    body: meta.body,
    receivedAtMs: meta.timestamp,
    read: Boolean(row.read),
  };
}

/**
 * Android bridge → local Expo module ContentResolver query.
 * Never uploads; permission denial returns an empty list.
 */
export async function readNativeInbox(
  query: NativeInboxQuery = {}
): Promise<RawSmsMessage[]> {
  const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
  const minDateMs =
    query.minReceivedAtMs ??
    query.cursor?.lastProcessedReceivedAtMs ??
    0;
  const afterId = query.cursor?.lastProcessedSmsId ?? null;

  try {
    const rows = await SmsReader.readInbox(limit, minDateMs, afterId);
    return (rows ?? []).map(toRawSms);
  } catch {
    return [];
  }
}
