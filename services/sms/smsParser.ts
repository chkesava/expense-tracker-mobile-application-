import type {
  RawSmsMessage,
  SmsParsedTransaction,
} from "@/shared/types/smsTransaction";

export interface SmsParseContext {
  /** Optional account names for matching “from HDFC” style hints */
  accounts?: Array<{ id: string; name: string }>;
}

/**
 * Bank / UPI SMS parser boundary.
 * Distinct from `shared/utils/magicParser` (natural-language Magic Add).
 * Phase 0: returns unknown / zero confidence — templates come in a later phase.
 */
export function parseBankSms(
  message: RawSmsMessage,
  _context: SmsParseContext = {}
): SmsParsedTransaction {
  const body = (message.body || "").trim();
  if (!body) {
    return { kind: "unknown", confidence: 0 };
  }

  // Placeholder: detect nothing until bank templates are added.
  return {
    kind: "unknown",
    note: body.slice(0, 120),
    confidence: 0,
  };
}

/** Minimum confidence to consider auto-commit without review (product-tunable later). */
export const SMS_AUTO_COMMIT_CONFIDENCE = 0.75;
