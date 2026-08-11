import type { RawSmsMessage, SmsSyncCursor } from "@/shared/types/smsTransaction";

export type NativeInboxQuery = {
  limit?: number;
  cursor?: SmsSyncCursor;
  minReceivedAtMs?: number;
};

/** Default / non-Android: no native inbox access. */
export async function readNativeInbox(
  _query: NativeInboxQuery = {}
): Promise<RawSmsMessage[]> {
  return [];
}
