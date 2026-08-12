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
    String(message.body.length),
    message.body.slice(0, 24).replace(/\s+/g, " "),
  ];
  return parts.join("|");
}

export function normalizeSmsReferenceId(ref?: string | null): string | undefined {
  const value = (ref || "").trim().toUpperCase().replace(/[\s-]+/g, "");
  return value.length >= 6 ? value : undefined;
}

/**
 * Keys used to decide "already exists?" before creating an expense.
 * Prefer transaction/reference ID; fall back to amount+date+merchant.
 */
export function buildSmsDedupeKeys(
  message: RawSmsMessage,
  parsed?: SmsParsedTransaction
): string[] {
  const keys: string[] = [];
  if (message.id) keys.push(`sms:${message.id}`);

  const ref = normalizeSmsReferenceId(parsed?.externalRef);
  if (ref) keys.push(`ref:${ref}`);

  if (
    parsed?.amount != null &&
    parsed.date &&
    (parsed.kind === "expense" || parsed.kind === "income") &&
    (parsed.merchant || parsed.accountLast4)
  ) {
    const merchant = (parsed.merchant || "").trim().toLowerCase();
    const last4 = parsed.accountLast4 || "";
    keys.push(
      `txn:${parsed.kind}|${parsed.amount}|${parsed.date}|${merchant}|${last4}`
    );
  }

  keys.push(`fp:${buildSmsFingerprint(message, parsed)}`);
  return [...new Set(keys)];
}

export function findDuplicateSmsKey(
  keys: string[],
  known: Set<string>
): string | undefined {
  const hasRef = keys.some((key) => key.startsWith("ref:"));
  // When a reference ID exists, do not collapse other same-day merchant spends.
  const candidates = hasRef
    ? keys.filter((key) => !key.startsWith("txn:"))
    : keys;
  return candidates.find((key) => known.has(key));
}

export function rememberSmsDedupeKeys(
  known: Set<string>,
  keys: string[]
): void {
  for (const key of keys) known.add(key);
}
