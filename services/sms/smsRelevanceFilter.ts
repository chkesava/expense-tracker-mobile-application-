import type { RawSmsMessage } from "@/shared/types/smsTransaction";

/**
 * Heuristic filter for bank / UPI / card transaction SMS.
 * Pure JS — no Firebase. Parsing into expenses is a later phase.
 */

const SENDER_HINTS = [
  "hdfc",
  "sbi",
  "icici",
  "axis",
  "kotak",
  "yesbank",
  "idfc",
  "bob",
  "pnb",
  "unionbank",
  "canara",
  "indusind",
  "federal",
  "rbl",
  "hsbc",
  "citi",
  "scb",
  "paytm",
  "phonepe",
  "gpay",
  "googlepay",
  "amazonpay",
  "bhim",
  "upi",
  "bank",
  "card",
  "credit",
  "debit",
  "alerts",
  "txn",
];

const BODY_HINTS = [
  /\b(?:inr|rs\.?|₹)\s*[\d,]+\.?\d*/i,
  /\b(?:debited|credited|withdrawn|spent|paid|payment|purchase|txn|transaction)\b/i,
  /\b(?:upi|imps|neft|rtgs|pos|atm)\b/i,
  /\ba\/c\b|\baccount\b/i,
  /\b(?:avl|available)\s*(?:bal|balance)\b/i,
  /\bref(?:erence)?\s*(?:no|num|#)?\s*[:\-]?\s*\w+/i,
];

function normalizeSender(address: string): string {
  return (address || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** True when sender or body looks like a financial transaction alert. */
export function isRelevantTransactionSms(message: RawSmsMessage): boolean {
  const sender = normalizeSender(message.address);
  const body = (message.body || "").trim();
  if (!body) return false;

  const senderHit = SENDER_HINTS.some((hint) => sender.includes(hint));
  const bodyHit = BODY_HINTS.some((re) => re.test(body));

  // Prefer body money patterns; allow sender+generic banking wording
  if (bodyHit) return true;
  if (senderHit && /\b(?:debited|credited|upi|txn|transaction|payment|balance)\b/i.test(body)) {
    return true;
  }
  return false;
}

export function filterRelevantSms(messages: RawSmsMessage[]): RawSmsMessage[] {
  return messages.filter(isRelevantTransactionSms);
}
