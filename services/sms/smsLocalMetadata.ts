/**
 * On-device SMS metadata. Never uploaded to Firebase.
 */

export type SmsLocalMetadata = {
  smsId: string;
  sender: string;
  body: string;
  /** Epoch ms */
  timestamp: number;
};

export type SmsNativeRowLike = {
  id?: string;
  smsId?: string;
  address?: string;
  sender?: string;
  body?: string;
  receivedAtMs?: number;
  timestamp?: number;
  read?: boolean;
};

export function toSmsLocalMetadata(row: SmsNativeRowLike): SmsLocalMetadata {
  return {
    smsId: String(row.smsId ?? row.id ?? ""),
    sender: row.sender ?? row.address ?? "",
    body: row.body ?? "",
    timestamp: Number(row.timestamp ?? row.receivedAtMs) || 0,
  };
}
