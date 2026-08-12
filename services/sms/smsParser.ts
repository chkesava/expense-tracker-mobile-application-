import type {
  RawSmsMessage,
  SmsParsedTransaction,
} from "@/shared/types/smsTransaction";
import { formatDateKey, monthFromDateKey } from "@/shared/utils/dates";
import {
  detectSmsTransaction,
  isExpenseOrIncomeKind,
} from "./smsDetector";

export interface SmsParseContext {
  /** Optional account names for matching “from HDFC” style hints */
  accounts?: Array<{ id: string; name: string }>;
  /** Override timezone when deriving date from receivedAtMs */
  timezone?: string;
}

/**
 * Bank / UPI SMS parser boundary.
 * Phase 4: detection (expense/income/transfer/otp/promo/non_financial) + amount.
 * Full merchant/category templates come in a later phase.
 */
export function parseBankSms(
  message: RawSmsMessage,
  context: SmsParseContext = {}
): SmsParsedTransaction {
  const body = (message.body || "").trim();
  if (!body) {
    return {
      kind: "non_financial",
      confidence: 0,
      detectionReasons: ["empty_body"],
    };
  }

  const detection = detectSmsTransaction(message);
  const date = formatDateKey(
    new Date(message.receivedAtMs || Date.now()),
    context.timezone
  );

  const parsed: SmsParsedTransaction = {
    kind: detection.kind,
    amount: detection.amount,
    date,
    month: monthFromDateKey(date),
    note: body.slice(0, 160),
    confidence: detection.confidence,
    detectionReasons: detection.reasons,
    templateId: "phase4-detector",
  };

  // Account hint from optional context (name match in body)
  if (context.accounts?.length) {
    const lower = body.toLowerCase();
    const hit = context.accounts.find((a) =>
      lower.includes(a.name.trim().toLowerCase())
    );
    if (hit) parsed.accountHint = hit.name;
  }

  // Mark low confidence for expense/income without amount
  if (isExpenseOrIncomeKind(detection.kind) && detection.amount == null) {
    parsed.confidence = Math.min(parsed.confidence, 0.55);
  }

  return parsed;
}

/** Minimum confidence to consider auto-commit without review (product-tunable later). */
export const SMS_AUTO_COMMIT_CONFIDENCE = 0.75;
