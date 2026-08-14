/**
 * SMS transaction detection.
 * Structured keyword rules first. `unknown` is never an expense.
 * Pure JS — no Firebase.
 */

import type {
  RawSmsMessage,
  SmsDetectionKind,
} from "@/shared/types/smsTransaction";
import { extractAmount } from "./smsFieldExtractor";

export type SmsDetectionResult = {
  kind: SmsDetectionKind;
  confidence: number;
  /** Human-readable rule tags (local debug). */
  reasons: string[];
  /** Best-effort amount when present in the body. */
  amount?: number;
};

const OTP_PATTERNS: RegExp[] = [
  /\botp\b/i,
  /\bone[-\s]?time\s+(?:password|pwd|pin|code)\b/i,
  /\bverification\s+code\b/i,
  /\bdo\s+not\s+share\b/i,
  /\bvalid\s+for\s+\d+\s*(?:min|minute|sec|second)/i,
];

const PROMO_PATTERNS: RegExp[] = [
  /\boffer\b/i,
  /\bdiscount\b/i,
  /\bcashback\s+offer\b/i,
  /\bflat\s+\d+%\s+off\b/i,
  /\blimited\s+period\b/i,
  /\bapply\s+now\b/i,
  /\bclick\s+(?:here|now)\b/i,
  /\bunsubscribe\b/i,
  /\bpre-?approved\b/i,
  /\bloan\s+offer\b/i,
  /\bshop\s+now\b/i,
  /\bwin\s+(?:a|an|the)?\s*(?:prize|voucher|gift)/i,
];

const CREDIT_CARD_PAYMENT_PATTERNS: RegExp[] = [
  /\bcredit\s+card\s+(?:bill\s+)?payment\b/i,
  /\b(?:cc|card)\s+bill\s+(?:paid|payment|received)\b/i,
  /\bpayment\s+(?:of\s+.{0,24})?(?:received\s+)?towards\s+your\s+(?:\w+\s+)?credit\s+card\b/i,
  /\bthank\s+you\s+for\s+(?:your\s+)?(?:card\s+)?payment\b/i,
  /\bpaid\s+to\s+your\s+credit\s+card\b/i,
];

const ATM_PATTERNS: RegExp[] = [
  /\batm\s+wdr\b/i,
  /\batm\s+(?:cash\s+)?(?:withdrawal|withdrawn|wdr)\b/i,
  /\bwithdrawn\b.*\batm\b/i,
  /\batm\b.*\b(?:withdrawn|withdrawal|wdr)\b/i,
];

const REFUND_PATTERNS: RegExp[] = [
  /\brefund(?:ed|s)?\b/i,
  /\breversed\b/i,
  /\breversal\b/i,
];

const TRANSFER_PATTERNS: RegExp[] = [
  /\bfund\s+transfer\b/i,
  /\b(?:has\s+been\s+)?transferred\s+(?:to|from)\b/i,
  /\btransfer(?:red)?\s+(?:of|to|from)\b/i,
  /\b(?:neft|imps|rtgs)\b.*\b(?:to|from|transfer)\b/i,
  /\bsent\s+to\s+(?:a\/c|account|acct)\b/i,
  /\breceived\s+from\s+(?:a\/c|account|acct)\b/i,
  /\bself\s+transfer\b/i,
];

const EXPENSE_PATTERNS: RegExp[] = [
  /\b(?:has\s+been\s+)?debited\b/i,
  /\bspent\b/i,
  /\bwithdrawn\b/i,
  /\bdeducted\b/i,
  /\bpurchase(?:d)?\b/i,
  /\bpaid\b/i,
  /\bpayment\s+(?:of|for|to)\b/i,
  /\bsent\s+(?:rs\.?|inr|₹|money)?/i,
  /\bdr\.?\s*(?:amt|amount)?\b/i,
  /\bpos\s+(?:txn|transaction|purchase)\b/i,
];

const INCOME_PATTERNS: RegExp[] = [
  /\b(?:has\s+been\s+)?credited\b/i,
  /\bdeposited\b/i,
  /\breceived\b/i,
  /\bsalary\b/i,
  /\bcashback\b/i,
  /\bcr\.?\s*(?:amt|amount)?\b/i,
  /\binward\s+(?:neft|imps|rtgs|upi)\b/i,
];

const STRONG_MONEY_MOVE =
  /\b(?:debited|credited|withdrawn|deposited|spent|purchase|paid|received|deducted|refunded|reversed)\b/i;

function hasMoneySignal(body: string, amount?: number): boolean {
  if (amount != null) return true;
  return /(?:inr|rs\.?|₹)\s*[\d,]+/i.test(body) || /[\d,]+\s*(?:inr|rs\.?|₹)/i.test(body);
}

function firstMatchLabel(body: string, patterns: RegExp[], label: string): string | null {
  return patterns.some((re) => re.test(body)) ? label : null;
}

/**
 * Classify an SMS body (+ optional sender) into a detection kind.
 * Priority: OTP → promotional → card payment → ATM → refund → transfer
 * → expense/income → unknown (money, no direction) → non_financial.
 */
export function detectSmsTransaction(
  message: Pick<RawSmsMessage, "body" | "address">
): SmsDetectionResult {
  const body = (message.body || "").trim();
  if (!body) {
    return { kind: "non_financial", confidence: 0.95, reasons: ["empty_body"] };
  }

  const amount = extractAmount(body);
  const reasons: string[] = [];

  const otpHit = firstMatchLabel(body, OTP_PATTERNS, "otp_keyword");
  const looksLikeOtpCode =
    /\botp\b/i.test(body) ||
    (/\b(?:password|code|pin)\b/i.test(body) && /\b\d{4,8}\b/.test(body));
  if (otpHit || looksLikeOtpCode) {
    if (otpHit) reasons.push(otpHit);
    if (looksLikeOtpCode) reasons.push("otp_code_shape");
    return { kind: "otp", confidence: 0.92, reasons, amount };
  }

  const promoHit = firstMatchLabel(body, PROMO_PATTERNS, "promo_keyword");
  const strongMoneyMove = STRONG_MONEY_MOVE.test(body) && hasMoneySignal(body, amount);
  if (promoHit && !strongMoneyMove) {
    reasons.push(promoHit);
    return { kind: "promotional", confidence: 0.85, reasons, amount };
  }

  const ccPayHit = firstMatchLabel(
    body,
    CREDIT_CARD_PAYMENT_PATTERNS,
    "credit_card_payment"
  );
  if (ccPayHit && hasMoneySignal(body, amount)) {
    reasons.push(ccPayHit);
    return {
      kind: "credit_card_payment",
      confidence: amount != null ? 0.9 : 0.8,
      reasons,
      amount,
    };
  }

  const atmHit = firstMatchLabel(body, ATM_PATTERNS, "atm_withdrawal");
  if (atmHit) {
    reasons.push(atmHit);
    return {
      kind: "atm_withdrawal",
      confidence: amount != null ? 0.9 : 0.8,
      reasons,
      amount,
    };
  }

  const refundHit = firstMatchLabel(body, REFUND_PATTERNS, "refund_keyword");
  if (refundHit) {
    reasons.push(refundHit);
    return {
      kind: "refund",
      confidence: amount != null ? 0.9 : 0.8,
      reasons,
      amount,
    };
  }

  const transferHit = firstMatchLabel(body, TRANSFER_PATTERNS, "transfer_keyword");
  if (transferHit) {
    reasons.push(transferHit);
    return {
      kind: "transfer",
      confidence: amount != null ? 0.88 : 0.8,
      reasons,
      amount,
    };
  }

  const expenseHit = firstMatchLabel(body, EXPENSE_PATTERNS, "expense_keyword");
  const incomeHit = firstMatchLabel(body, INCOME_PATTERNS, "income_keyword");

  if (expenseHit && !incomeHit) {
    reasons.push(expenseHit);
    return {
      kind: "expense",
      confidence: amount != null ? 0.9 : 0.78,
      reasons,
      amount,
    };
  }
  if (incomeHit && !expenseHit) {
    reasons.push(incomeHit);
    if (
      /\bcredit\s+card\b/i.test(body) &&
      !/\bcredited\b/i.test(body) &&
      !/\breceived\b/i.test(body)
    ) {
      reasons.push("credit_card_guard");
      return { kind: "non_financial", confidence: 0.55, reasons, amount };
    }
    return {
      kind: "income",
      confidence: amount != null ? 0.9 : 0.78,
      reasons,
      amount,
    };
  }

  if (expenseHit && incomeHit) {
    if (
      /\bdebited\b/i.test(body) ||
      /\bspent\b/i.test(body) ||
      /\bpaid\b/i.test(body) ||
      /\bdeducted\b/i.test(body)
    ) {
      reasons.push("expense_over_income");
      return {
        kind: "expense",
        confidence: amount != null ? 0.86 : 0.74,
        reasons,
        amount,
      };
    }
    reasons.push("income_over_expense");
    return {
      kind: "income",
      confidence: amount != null ? 0.86 : 0.74,
      reasons,
      amount,
    };
  }

  if (hasMoneySignal(body, amount) && /\bupi\b/i.test(body)) {
    if (/\b(?:to|paid)\b/i.test(body)) {
      reasons.push("upi_outgoing");
      return { kind: "expense", confidence: 0.72, reasons, amount };
    }
    if (/\bfrom\b/i.test(body)) {
      reasons.push("upi_incoming");
      return { kind: "income", confidence: 0.72, reasons, amount };
    }
  }

  if (hasMoneySignal(body, amount)) {
    reasons.push("money_without_clear_direction");
    return { kind: "unknown", confidence: 0.45, reasons, amount };
  }

  reasons.push("no_financial_signal");
  return { kind: "non_financial", confidence: 0.7, reasons, amount };
}

export function isMoneyMovementKind(kind: SmsDetectionKind): boolean {
  return (
    kind === "expense" ||
    kind === "income" ||
    kind === "refund" ||
    kind === "transfer" ||
    kind === "atm_withdrawal" ||
    kind === "credit_card_payment"
  );
}

export function isExpenseOrIncomeKind(kind: SmsDetectionKind): boolean {
  return (
    kind === "expense" ||
    kind === "income" ||
    kind === "refund" ||
    kind === "atm_withdrawal"
  );
}

export function isUnknownSmsKind(kind: SmsDetectionKind): boolean {
  return kind === "unknown";
}
