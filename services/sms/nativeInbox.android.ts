import SmsReader from "@/modules/sms-reader";
import type { RawSmsMessage } from "@/shared/types/smsTransaction";
import type { NativeInboxQuery } from "./nativeInbox";

function toRawSms(row: {
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
    receivedAtMs: Number(row.receivedAtMs) || 0,
    read: Boolean(row.read),
  };
}

/**
 * Android bridge → local Expo module ContentResolver query.
 * Never uploads; callers must keep results on-device.
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

  const rows = await SmsReader.readInbox(limit, minDateMs, afterId);
  return (rows ?? []).map(toRawSms);
}
