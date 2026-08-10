import type {
  RawSmsMessage,
  SmsFingerprint,
  SmsParsedTransaction,
} from "@/shared/types/smsTransaction";

/**
 * Build a stable fingerprint for local (and optional future cloud) dedupe.
 * Does not store or return the raw body — only a compact key.
 */
export function buildSmsFingerprint(
  message: RawSmsMessage,
  parsed?: SmsParsedTransaction
): SmsFingerprint {
  const parts = [
    message.address.trim().toLowerCase(),
    String(message.receivedAtMs),
    parsed?.amount != null ? String(parsed.amount) : "",
    parsed?.externalRef?.trim() || "",
    parsed?.date || "",
    // Short body hash substitute until expo-crypto is wired in the pipeline
    String(message.body.length),
    message.body.slice(0, 24).replace(/\s+/g, " "),
  ];
  return parts.join("|");
}
